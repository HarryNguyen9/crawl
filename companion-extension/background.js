let state = {
  enabled: false,
  appUrl: "",
  token: "",
  clientId: "",
  currentLink: "",
  lastHeartbeat: "",
  statusMessage: "",
  loginRequired: false,
  loginTabId: null,
  busy: false,
  pollTimer: null
};

const DEFAULT_WEB_APP_URL = "https://crawl-pi.vercel.app";

function normalizeAppUrl(value) {
  return (value || DEFAULT_WEB_APP_URL).trim().replace(/\/+$/, "");
}

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(value) {
  return chrome.storage.local.set(value);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${state.appUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function register() {
  const body = state.clientId ? { clientId: state.clientId } : {};
  const data = await apiFetch("/api/extension/register", {
    method: "POST",
    body: JSON.stringify(body)
  });
  state.clientId = data.clientId;
  state.lastHeartbeat = new Date().toISOString();
  await storageSet({ clientId: state.clientId });
  return data.clientId;
}

async function openOrFocusWebApp() {
  if (!state.appUrl) return;
  const tabs = await chrome.tabs.query({ url: `${state.appUrl}/*` }).catch(() => []);
  const existing = tabs[0];
  if (existing?.id) {
    if (existing.windowId !== undefined) {
      await chrome.windows.update(existing.windowId, { focused: true }).catch(() => undefined);
    }
    await chrome.tabs.update(existing.id, { active: true }).catch(() => undefined);
    return;
  }
  await chrome.tabs.create({ url: state.appUrl, active: true }).catch(() => undefined);
}

async function openLazadaLogin() {
  const loginUrl = "https://member.lazada.vn/user/login?redirect=https%3A%2F%2Fwww.lazada.vn%2Fcustomer%2Faccount%2F";
  if (state.loginTabId) {
    await chrome.tabs.update(state.loginTabId, { url: loginUrl, active: true }).catch(async () => {
      const loginTab = await chrome.tabs.create({ url: loginUrl, active: true });
      state.loginTabId = loginTab.id;
    });
  } else {
    const loginTab = await chrome.tabs.create({ url: loginUrl, active: true });
    state.loginTabId = loginTab.id;
  }
}

async function getLazadaSessionCookies() {
  const cookies = await chrome.cookies.getAll({ domain: ".lazada.vn" }).catch(() => []);
  return cookies.filter((cookie) => /lzd_uid|lzd_uid_v2|account|user/i.test(cookie.name));
}

function inspectLazadaLoginPage() {
  const text = document.body?.innerText || "";
  const hasLoginForm = /đăng nhập|dang nhap|login|password|mật khẩu|mat khau/i.test(text);
  const hasAccountSignal = /tài khoản của tôi|tai khoan cua toi|đơn hàng của tôi|don hang cua toi|logout|đăng xuất|dang xuat/i.test(text);
  const hasLoginNav = /đăng nhập|dang nhap/i.test(text) && /đăng ký|dang ky|register/i.test(text);

  if (location.href.includes("/user/login") || location.href.includes("/customer/account/login")) {
    return { loggedIn: false, reason: "Lazada login page is open" };
  }
  if (hasAccountSignal && !hasLoginForm) {
    return { loggedIn: true, reason: "Account page detected" };
  }
  if (hasLoginNav || hasLoginForm) {
    return { loggedIn: false, reason: "Lazada login form detected" };
  }
  return { loggedIn: false, reason: "Unable to confirm Lazada login" };
}

async function checkLazadaLogin() {
  const cookies = await getLazadaSessionCookies();
  const hasStrongCookie = cookies.some((cookie) => /lzd_uid|lzd_uid_v2/i.test(cookie.name) && cookie.value);
  if (hasStrongCookie) {
    return { loggedIn: true, reason: "Lazada session cookie detected" };
  }

  const loginCheckUrl = "https://member.lazada.vn/user/login?redirect=https%3A%2F%2Fwww.lazada.vn%2Fcustomer%2Faccount%2F";
  const tab = await chrome.tabs.create({ url: loginCheckUrl, active: true });
  state.loginTabId = tab.id;
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  }

  try {
    await waitForTabComplete(tab.id, 30000);
    await delay(1500);
    const currentTab = await chrome.tabs.get(tab.id);
    if ((currentTab.url || "").includes("/user/login")) {
      return { loggedIn: false, reason: "Lazada login page is open" };
    }
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: inspectLazadaLoginPage
    });
    const result = injected?.[0]?.result || { loggedIn: false, reason: "No login check result" };
    if (result.loggedIn) {
      await chrome.tabs.remove(tab.id).catch(() => undefined);
      state.loginTabId = null;
    }
    return result;
  } catch (error) {
    return { loggedIn: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function requireLazadaLoginBeforeCrawl() {
  const result = await checkLazadaLogin();
  if (result.loggedIn) {
    state.loginRequired = false;
    state.statusMessage = "Lazada login confirmed";
    return true;
  }

  state.loginRequired = true;
  state.statusMessage = `Please login to Lazada: ${result.reason}`;
  state.currentLink = "Login required";
  state.enabled = false;
  await openLazadaLogin();
  return false;
}

async function sendLog(level, message, extra = {}) {
  if (!extra.jobId) return;
  await apiFetch("/api/extension/log", {
    method: "POST",
    body: JSON.stringify({
      clientId: state.clientId,
      level,
      message,
      jobId: extra.jobId,
      linkId: extra.linkId,
      meta: extra.meta
    })
  }).catch(() => undefined);
}

function parseLazadaInPage() {
  function parseVnd(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const digits = String(value).replace(/[^0-9]/g, "");
    return digits ? Number(digits) : 0;
  }

  function findSkuInfosRecursive(obj, seen) {
    if (!obj || typeof obj !== "object" || seen.has(obj)) return null;
    seen.add(obj);
    if (obj.skuInfos && typeof obj.skuInfos === "object") return obj.skuInfos;
    for (const key of Object.keys(obj)) {
      const result = findSkuInfosRecursive(obj[key], seen);
      if (result) return result;
    }
    return null;
  }

  function resolveVariant(sku, skuId, pageData) {
    if (Array.isArray(sku.cartPropValues) && sku.cartPropValues.length > 0) return sku.cartPropValues.join(" - ");
    if (sku.saleProp && Object.keys(sku.saleProp).length > 0) return Object.values(sku.saleProp).join(" - ");
    if (sku.saleprop && Object.keys(sku.saleprop).length > 0) return Object.values(sku.saleprop).join(" - ");

    const skuList = pageData?.mods?.skuSelect?.skuList || pageData?.data?.root?.fields?.skuSelect?.skuList;
    if (Array.isArray(skuList)) {
      const matchedSku = skuList.find((item) => String(item.skuId) === String(skuId));
      if (Array.isArray(matchedSku?.optionStrings) && matchedSku.optionStrings.length > 0) return matchedSku.optionStrings.join(" - ");
    }

    const productOption = pageData?.data?.root?.fields?.productOption || pageData?.productOption || pageData?.mods?.skuSelect;
    const skuBase = productOption?.skuBase;
    const matchedSkuBase = Array.isArray(skuBase?.skus) ? skuBase.skus.find((item) => String(item.skuId) === String(skuId)) : null;
    if (matchedSkuBase?.propPath) {
      const pathIds = String(matchedSkuBase.propPath)
        .split(";")
        .filter(Boolean)
        .map((part) => (part.includes(":") ? part.split(":")[1] : part));
      const propsList = skuBase.properties || skuBase.props || [];
      const resolved = [];
      for (const property of propsList) {
        for (const value of property.values || []) {
          if (pathIds.includes(String(value.vid)) || pathIds.includes(String(value.id))) resolved.push(value.name || value.value);
        }
      }
      if (resolved.length > 0) return resolved.join(" - ");
    }

    return "Default";
  }

  const bodyText = document.body?.innerText || "";
  if (/captcha|recaptcha|robot|punish|verify|security check/i.test(bodyText)) {
    return { status: "captcha", error: "Captcha detected, manual action required" };
  }

  let pageData = window.pageData || window.__moduleData__ || window.__INITIAL_STATE__;
  if (!pageData) {
    for (const script of Array.from(document.querySelectorAll("script"))) {
      const text = script.textContent || "";
      if (!text.includes("skuInfos")) continue;
      const match = text.match(/(?:window\.)?(?:pageData|__moduleData__|__INITIAL_STATE__)\s*=\s*({[\s\S]*?});/);
      if (match?.[1]) {
        try {
          pageData = JSON.parse(match[1]);
          break;
        } catch (_error) {
          continue;
        }
      }
    }
  }

  if (!pageData) return { status: "failed", error: "Lazada pageData not found" };
  const skuInfos = pageData?.data?.root?.fields?.skuInfos || findSkuInfosRecursive(pageData, new Set());
  if (!skuInfos) return { status: "failed", error: "Lazada skuInfos not found" };

  const productName =
    document.querySelector(".pdp-mod-product-title .pdp-product-title, h1.pdp-product-title")?.textContent?.trim() ||
    pageData?.data?.root?.fields?.product?.title ||
    pageData?.data?.root?.fields?.product?.name ||
    "Lazada product";

  const rows = [];
  const seen = new Set();
  for (const key of Object.keys(skuInfos)) {
    const sku = skuInfos[key];
    const skuId = String(sku?.skuId || key);
    if (!sku || seen.has(skuId)) continue;
    seen.add(skuId);

    const priceInfo = sku.price || {};

    const originalPrice = Number(priceInfo.originalPrice?.value) || parseVnd(priceInfo.originalPrice?.text) || 0;

    const salePrice =
      Number(priceInfo.salePrice?.value) ||
      parseVnd(priceInfo.salePrice?.text) ||
      parseVnd(priceInfo.salePrice?.noSymbolPriceText) ||
      0;

    const finalPrice = Number(priceInfo.coupon?.priceNumber) || parseVnd(priceInfo.coupon?.priceText) || salePrice;

    const couponDiscount = parseVnd(priceInfo.coupon?.desc || "");

    const currentPrice = finalPrice && couponDiscount ? finalPrice + couponDiscount : salePrice || finalPrice || originalPrice || 0;

    rows.push({
      productName,
      skuId,
      variantName: resolveVariant(sku, skuId, pageData),
      originalPrice,
      currentPrice,
      finalPrice,
      couponDiscount,
      salePrice,
      discountText: priceInfo.coupon?.desc || null,
      rawJson: sku
    });
  }

  if (rows.length === 0) return { status: "failed", error: "No Lazada SKU rows found" };
  if (!rows.some((row) => row.originalPrice || row.currentPrice || row.finalPrice)) {
    return { status: "failed", error: "Lazada price not found in browser session" };
  }
  return { status: "success", rows };
}

async function waitForTabComplete(tabId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await delay(500);
  }
  throw new Error("Timed out waiting for Lazada page load");
}

async function crawlLazada(link) {
  const originalWindow = await chrome.windows.getCurrent().catch(() => null);
  const originalTabs = originalWindow?.id ? await chrome.tabs.query({ active: true, windowId: originalWindow.id }).catch(() => []) : [];
  const crawlerWindow = await chrome.windows.create({
    url: link.url,
    focused: false,
    type: "normal",
    width: 420,
    height: 760,
    left: 40,
    top: 40
  });
  const tab = crawlerWindow.tabs?.[0];
  if (!tab?.id) return { status: "failed", error: "Unable to open Lazada crawler tab" };

  if (originalWindow?.id) {
    await chrome.windows.update(originalWindow.id, { focused: true }).catch(() => undefined);
  }
  if (originalTabs[0]?.id) {
    await chrome.tabs.update(originalTabs[0].id, { active: true }).catch(() => undefined);
  }

  try {
    await waitForTabComplete(tab.id, 45000);
    const startedAt = Date.now();
    let lastResult = { status: "failed", error: "No injection result" };

    while (Date.now() - startedAt < 45000) {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: parseLazadaInPage
      });
      lastResult = injected?.[0]?.result || lastResult;

      if (lastResult.status === "success" || lastResult.status === "captcha") {
        return lastResult;
      }

      const retryable = /pageData not found|skuInfos not found|No Lazada SKU rows found|price not found/i.test(lastResult.error || "");
      if (!retryable) return lastResult;
      await delay(1200);
    }

    return lastResult;
  } finally {
    if (crawlerWindow.id) {
      await chrome.windows.remove(crawlerWindow.id).catch(() => undefined);
    } else if (tab.id) {
      await chrome.tabs.remove(tab.id).catch(() => undefined);
    }
    if (originalWindow?.id) {
      await chrome.windows.update(originalWindow.id, { focused: true }).catch(() => undefined);
    }
    if (originalTabs[0]?.id) {
      await chrome.tabs.update(originalTabs[0].id, { active: true }).catch(() => undefined);
    }
  }
}

function parseShopeeIds(url) {
  const match = url.match(/\/i\.(\d+)\.(\d+)/) || url.match(/\/product\/(\d+)\/(\d+)/);
  if (!match) return null;
  return { shopId: match[1], itemId: match[2] };
}

function normalizeShopeePrice(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric >= 100000 ? Math.round(numeric / 100000) : numeric;
}

function getBestDiscount(basePrice, voucherText) {
  if (!voucherText) return { amount: 0, label: "None" };
  const cleaned = voucherText.toLowerCase();
  let maxDiscount = 0;
  let bestLabel = "";

  for (const match of cleaned.matchAll(/(?:giam|giảm|hoan xu|hoàn xu)\s*(\d+)%/g)) {
    const percent = Number(match[1]);
    const discount = Math.round(basePrice * (percent / 100));
    if (discount > maxDiscount) {
      maxDiscount = discount;
      bestLabel = `Discount ${percent}%`;
    }
  }

  for (const match of cleaned.matchAll(/(?:giam|giảm|hoan xu|hoàn xu)\s*(?:₫|đ)?\s*(\d+)\s*k/g)) {
    const discount = Number(match[1]) * 1000;
    if (discount > maxDiscount) {
      maxDiscount = discount;
      bestLabel = `Discount ${match[1]}k`;
    }
  }

  for (const match of cleaned.matchAll(/(?:giam|giảm|hoan xu|hoàn xu)\s*(?:₫|đ)?\s*([\d.]+)(?:\s*đ)?/g)) {
    const discount = Number(match[1].replace(/\./g, ""));
    if (discount > 100 && !match[0].includes("%") && !match[0].includes("k") && discount > maxDiscount) {
      maxDiscount = discount;
      bestLabel = `Discount ${discount}`;
    }
  }

  return { amount: maxDiscount, label: bestLabel || "Voucher" };
}

function estimateShopeeFinalPrice(currentPrice, shopVoucherText, platformVoucherText) {
  const shop = getBestDiscount(currentPrice, shopVoucherText);
  const platform = getBestDiscount(currentPrice, platformVoucherText);
  const discount = shop.amount + platform.amount;
  return {
    finalPrice: Math.max(0, currentPrice - discount),
    note: "Estimated",
    detail: `Estimated from browser voucher text, not checkout-guaranteed. Shop: ${shop.label} (-${shop.amount}); Platform: ${platform.label} (-${platform.amount})`
  };
}

async function fetchShopeeInPage(shopId, itemId) {
  function findShopeeItemRecursive(value, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);

    if (
      (String(value.itemid || value.item_id || "") === String(itemId) || value.itemid || value.item_id) &&
      (value.name || value.title) &&
      (value.price || value.price_before_discount || Array.isArray(value.models))
    ) {
      return value;
    }

    for (const key of Object.keys(value)) {
      const result = findShopeeItemRecursive(value[key], seen);
      if (result) return result;
    }
    return null;
  }

  function jsonPreview(value) {
    try {
      return JSON.stringify(value).slice(0, 500);
    } catch (_error) {
      return "[unserializable]";
    }
  }

  try {
    const response = await fetch(`https://shopee.vn/api/v4/pdp/get_pc?item_id=${itemId}&shop_id=${shopId}`, {
      credentials: "include",
      headers: {
        accept: "application/json",
        "x-api-source": "pc",
        "x-requested-with": "XMLHttpRequest"
      }
    });
    const json = await response.json().catch(() => ({}));
    let item =
      json?.data?.item ||
      window.__PRELOADED_STATE__?.item ||
      findShopeeItemRecursive(window.__PRELOADED_STATE__) ||
      findShopeeItemRecursive(window.__INITIAL_STATE__) ||
      findShopeeItemRecursive(window.__NEXT_DATA__);
    if (!item) {
      const bodyText = document.body?.innerText || "";
      if (response.status === 403 || /captcha|verify|robot|blocked/i.test(bodyText)) {
        return { status: "failed", retryable: true, error: `Shopee PDP API blocked with HTTP ${response.status}; payload=${jsonPreview(json)}` };
      }
      return {
        status: "failed",
        retryable: true,
        error: `Shopee PDP API returned no item data (HTTP ${response.status}; title=${document.title}; payload=${jsonPreview(json)})`
      };
    }

    const voucherLabels = [];
    const apiVouchers = json?.data?.shop_vouchers || json?.data?.vouchers || [];
    if (Array.isArray(apiVouchers)) {
      for (const voucher of apiVouchers) {
        const label = voucher?.name || (voucher?.discount_value ? `Discount ${Math.round(Number(voucher.discount_value) / 100000)}` : "");
        if (label && !voucherLabels.includes(label)) voucherLabels.push(label);
      }
    }

    try {
      const voucherResponse = await fetch(`https://shopee.vn/api/v4/voucher/get_vouchers_by_item?item_id=${itemId}&shop_id=${shopId}`, {
        credentials: "include",
        headers: { accept: "application/json", "x-api-source": "pc", "x-requested-with": "XMLHttpRequest" }
      });
      const voucherJson = await voucherResponse.json().catch(() => ({}));
      const rawVouchers = voucherJson?.data?.vouchers || [];
      if (Array.isArray(rawVouchers)) {
        for (const voucher of rawVouchers) {
          let label = "";
          if (voucher?.discount_value) label = `Discount ${Math.round(Number(voucher.discount_value) / 100000)}`;
          if (voucher?.discount_percentage) label = `Discount ${voucher.discount_percentage}%`;
          if (label && !voucherLabels.includes(label)) voucherLabels.push(label);
        }
      }
    } catch (_error) {
      voucherLabels.push("Voucher API unavailable");
    }

    const domVouchers = Array.from(document.querySelectorAll('.mini-voucher-v2__label, [class*="voucher"], [class*="Voucher"], [class*="badge"]'));
    for (const element of domVouchers) {
      const text = (element.textContent || "").trim();
      if (text && text.length > 1 && text.length < 80 && /đ|₫|%|k|giam|giảm|xu|freeship/i.test(text) && !voucherLabels.includes(text)) {
        voucherLabels.push(text);
      }
    }

    const productName =
      item.name ||
      item.title ||
      document.querySelector("h1")?.textContent?.trim() ||
      document.title.replace(/\|.*$/g, "").trim() ||
      "Shopee product";

    return {
      status: "success",
      item,
      productName,
      voucherText: voucherLabels.join(" | ")
    };
  } catch (error) {
    return { status: "failed", retryable: true, error: error instanceof Error ? error.message : String(error) };
  }
}

async function crawlShopee(link) {
  const ids = parseShopeeIds(link.url);
  if (!ids) return { status: "failed", error: "Cannot parse Shopee shopId/itemId from URL" };

  const originalWindow = await chrome.windows.getCurrent().catch(() => null);
  const originalTabs = originalWindow?.id ? await chrome.tabs.query({ active: true, windowId: originalWindow.id }).catch(() => []) : [];
  const crawlerWindow = await chrome.windows.create({
    url: link.url,
    focused: false,
    type: "normal",
    width: 420,
    height: 760,
    left: 80,
    top: 80
  });
  const tab = crawlerWindow.tabs?.[0];
  if (!tab?.id) return { status: "failed", error: "Unable to open Shopee crawler tab" };

  if (originalWindow?.id) await chrome.windows.update(originalWindow.id, { focused: true }).catch(() => undefined);
  if (originalTabs[0]?.id) await chrome.tabs.update(originalTabs[0].id, { active: true }).catch(() => undefined);

  try {
    await waitForTabComplete(tab.id, 45000);
    const startedAt = Date.now();
    let result = { status: "failed", retryable: true, error: "No Shopee injection result" };

    while (Date.now() - startedAt < 45000) {
      await delay(1500);
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        args: [ids.shopId, ids.itemId],
        func: fetchShopeeInPage
      });
      result = injected?.[0]?.result || result;
      if (result.status === "success") break;
      if (!result.retryable) break;
    }

    if (result.status !== "success") return result;

    const item = result.item;
    const models = Array.isArray(item.models) && item.models.length > 0 ? item.models : [null];
    const rows = models.map((model) => {
      const originalPrice = normalizeShopeePrice(model?.price_before_discount || item.price_before_discount || model?.price || item.price);
      const currentPrice = normalizeShopeePrice(model?.price || item.price);
      const estimate = estimateShopeeFinalPrice(currentPrice, result.voucherText || "", "");
      return {
        productName: result.productName,
        shopId: ids.shopId,
        itemId: ids.itemId,
        skuId: model?.modelid ? String(model.modelid) : String(item.itemid || ids.itemId),
        variantName: model?.name || "Default",
        originalPrice,
        currentPrice,
        finalPrice: estimate.finalPrice,
        couponDiscount: 0,
        salePrice: currentPrice,
        voucherNote: estimate.note,
        discountText: result.voucherText || estimate.detail,
        rawJson: model || item
      };
    });

    return { status: "success", rows };
  } finally {
    if (crawlerWindow.id) await chrome.windows.remove(crawlerWindow.id).catch(() => undefined);
    if (originalWindow?.id) await chrome.windows.update(originalWindow.id, { focused: true }).catch(() => undefined);
    if (originalTabs[0]?.id) await chrome.tabs.update(originalTabs[0].id, { active: true }).catch(() => undefined);
  }
}

async function processNextLink() {
  if (!state.enabled || state.busy || !state.clientId) return;
  state.busy = true;
  try {
    let link = await apiFetch(`/api/extension/next-link?clientId=${encodeURIComponent(state.clientId)}&platform=shopee`);
    state.lastHeartbeat = new Date().toISOString();

    if (!link || !link.linkId) {
      const lazadaPending = await apiFetch(`/api/extension/next-link?clientId=${encodeURIComponent(state.clientId)}&platform=lazada&peek=true`);
      if (!lazadaPending || !lazadaPending.linkId) {
        state.currentLink = "";
        return;
      }

      const loggedIn = await requireLazadaLoginBeforeCrawl();
      if (!loggedIn) return;
      link = await apiFetch(`/api/extension/next-link?clientId=${encodeURIComponent(state.clientId)}&platform=lazada`);
    }

    if (!link || !link.linkId) {
      state.currentLink = "";
      return;
    }

    state.currentLink = link.url;
    await storageSet({ currentLink: state.currentLink });
    let result;
    if (link.platform === "lazada") {
      result = await crawlLazada(link);
    } else if (link.platform === "shopee") {
      result = await crawlShopee(link);
    } else {
      result = { status: "failed", error: `Unsupported platform ${link.platform}` };
    }
    await apiFetch("/api/extension/result", {
      method: "POST",
      body: JSON.stringify({
        clientId: state.clientId,
        jobId: link.jobId,
        linkId: link.linkId,
        status: result.status,
        rows: result.rows || [],
        error: result.error || null
      })
    });
  } catch (error) {
    console.error("TMall Companion error", error);
  } finally {
    state.currentLink = "";
    state.busy = false;
  }
}

function schedulePoll() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  if (!state.enabled) return;
  state.pollTimer = setTimeout(async () => {
    await processNextLink();
    schedulePoll();
  }, 3000);
}

async function connect(input = {}) {
  const saved = await storageGet(["appUrl", "token", "clientId"]);
  state.appUrl = normalizeAppUrl(input.appUrl || saved.appUrl);
  state.token = input.token || saved.token || "";
  state.clientId = saved.clientId || state.clientId || "";
  state.enabled = true;
  state.loginRequired = false;
  state.statusMessage = "Connected";
  await storageSet({ appUrl: state.appUrl, token: state.token });
  await register();
  await openOrFocusWebApp();
  schedulePoll();
  return { ...state, pollTimer: undefined };
}

async function stop() {
  state.enabled = false;
  state.currentLink = "";
  state.statusMessage = "Stopped";
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = null;
  await storageSet({ currentLink: "" });
  return { ...state, pollTimer: undefined };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CONNECT") {
    connect(message).then(sendResponse).catch((error) => sendResponse({ ...state, enabled: false, error: String(error.message || error) }));
    return true;
  }
  if (message.type === "STOP") {
    stop().then(sendResponse);
    return true;
  }
  if (message.type === "STATUS") {
    sendResponse({ ...state, pollTimer: undefined });
  }
  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  const saved = await storageGet(["appUrl", "token", "clientId"]);
  state.appUrl = normalizeAppUrl(saved.appUrl);
  state.token = saved.token || "";
  state.clientId = saved.clientId || "";
});
