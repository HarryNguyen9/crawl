import type { ProductSkuInput } from "../types/crawler";

export function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function envBoolean(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

export function truncateRawJson(value: unknown, enabled: boolean, maxChars: number) {
  if (!enabled) return null;
  const json = JSON.stringify(value);
  return json.length > maxChars ? `${json.slice(0, maxChars)}...[truncated]` : json;
}

export async function fetchText(url: string, timeoutMs: number, headers?: HeadersInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        ...headers
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, timeoutMs: number, headers?: HeadersInit) {
  const text = await fetchText(url, timeoutMs, {
    accept: "application/json,text/plain,*/*",
    referer: "https://shopee.vn/",
    ...headers
  });
  return JSON.parse(text) as T;
}

export function normalizeShopeePrice(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric >= 100000 ? Math.round(numeric / 100000) : numeric;
}

export function extractNumberFromText(text?: string | null) {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

export function extractJsonAssignment(html: string, variableNames: string[]) {
  for (const name of variableNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`(?:window\\.)?${escaped}\\s*=\\s*({[\\s\\S]*?})\\s*;\\s*</script>`, "i"),
      new RegExp(`(?:window\\.)?${escaped}\\s*=\\s*({[\\s\\S]*?})\\s*;`, "i")
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (!match?.[1]) continue;
      try {
        return JSON.parse(match[1]);
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseBestDiscount(basePrice: number, voucherText: string) {
  const cleaned = voucherText.toLowerCase();
  let maxDiscount = 0;
  let bestLabel = "";

  for (const match of cleaned.matchAll(/(?:giảm|giam|hoàn xu|hoan xu)\s*(\d+)%/g)) {
    const percent = Number(match[1]);
    const discount = Math.round(basePrice * (percent / 100));
    if (discount > maxDiscount) {
      maxDiscount = discount;
      bestLabel = `Giảm ${percent}%`;
    }
  }

  for (const match of cleaned.matchAll(/(?:giảm|giam|hoàn xu|hoan xu)\s*(?:₫|đ)?\s*(\d+)\s*k/g)) {
    const discount = Number(match[1]) * 1000;
    if (discount > maxDiscount) {
      maxDiscount = discount;
      bestLabel = `Giảm ${match[1]}k`;
    }
  }

  for (const match of cleaned.matchAll(/(?:giảm|giam|hoàn xu|hoan xu)\s*(?:₫|đ)?\s*([\d.]+)(?:\s*đ)?/g)) {
    const value = Number(match[1].replace(/\./g, ""));
    if (value > 100 && !match[0].includes("%") && !match[0].includes("k") && value > maxDiscount) {
      maxDiscount = value;
      bestLabel = `Giảm ${value}`;
    }
  }

  return { amount: maxDiscount, label: bestLabel || "Không rõ" };
}

export function stackVoucherEstimate(currentPrice: number, shopVoucherText: string, platformVoucherText: string) {
  const shop = parseBestDiscount(currentPrice, shopVoucherText);
  const platform = parseBestDiscount(currentPrice, platformVoucherText);
  const discount = shop.amount + platform.amount;
  return {
    finalPrice: Math.max(0, currentPrice - discount),
    note: `Estimated from voucher text, not checkout-guaranteed. Shop: ${shop.label} (-${shop.amount}); Platform: ${platform.label} (-${platform.amount})`
  };
}

export function sanitizeSku(input: ProductSkuInput): ProductSkuInput {
  return {
    ...input,
    productName: input.productName || "Unknown product",
    variantName: input.variantName || "Default",
    originalPrice: Number(input.originalPrice ?? 0),
    currentPrice: Number(input.currentPrice ?? 0),
    finalPrice: Number(input.finalPrice ?? 0),
    couponDiscount: Number(input.couponDiscount ?? 0),
    salePrice: Number(input.salePrice ?? 0)
  };
}
