import type { CrawlContext, CrawlResult } from "../types/crawler";
import { extractJsonAssignment, stripHtml } from "./shared";

type LazadaCrawlMethod = "fetch" | "fetch_tracking_fallback";

type LazadaSkuPayload = {
  productName: string;
  warnings: string[];
  skus: Array<{
    skuId: string;
    variantName: string;
    originalPrice: number;
    currentPrice: number;
    finalPrice: number;
    couponDiscount: number;
    salePrice: number;
    discountText?: string | null;
    method: LazadaCrawlMethod;
    raw: unknown;
  }>;
};

export function parseVnd(value?: string | number | null) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

function findSkuInfosRecursive(obj: unknown): Record<string, any> | null {
  if (!obj || typeof obj !== "object") return null;
  const current = obj as Record<string, any>;
  if (current.skuInfos && typeof current.skuInfos === "object") return current.skuInfos;
  for (const key of Object.keys(current)) {
    const result = findSkuInfosRecursive(current[key]);
    if (result) return result;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object");
}

function hasPriceData(value: unknown) {
  return isObject(value) && Object.keys(value).length > 0;
}

function findPriceRecursively(obj: unknown, skuId: string, seen = new Set<unknown>()): any | null {
  if (!isObject(obj) || seen.has(obj)) return null;
  seen.add(obj);

  if (isObject(obj[skuId]) && hasPriceData(obj[skuId].price)) return obj[skuId].price;

  const currentSkuId = obj.skuId ?? obj.sku_id ?? obj.id ?? obj.itemSkuId ?? obj.skuID;
  if (String(currentSkuId ?? "") === String(skuId) && hasPriceData(obj.price)) return obj.price;

  for (const key of Object.keys(obj)) {
    if (key === skuId && isObject(obj[key]) && hasPriceData(obj[key].price)) return obj[key].price;
    const result = findPriceRecursively(obj[key], skuId, seen);
    if (result) return result;
  }

  return null;
}

function firstPriceInfo(...values: unknown[]): any {
  return values.find(hasPriceData) ?? {};
}

function jsonPreview(value: unknown) {
  try {
    return JSON.stringify(value).slice(0, 1200);
  } catch {
    return "[unserializable]";
  }
}

function resolveVariant(sku: any, skuId: string, pageData: any) {
  if (Array.isArray(sku.cartPropValues) && sku.cartPropValues.length > 0) return sku.cartPropValues.join(" - ");
  if (sku.saleProp && Object.keys(sku.saleProp).length > 0) return Object.values(sku.saleProp).join(" - ");
  if (sku.saleprop && Object.keys(sku.saleprop).length > 0) return Object.values(sku.saleprop).join(" - ");

  const skuList = pageData?.mods?.skuSelect?.skuList || pageData?.data?.root?.fields?.skuSelect?.skuList;
  if (Array.isArray(skuList)) {
    const matchedSku = skuList.find((item: any) => String(item.skuId) === String(skuId));
    if (Array.isArray(matchedSku?.optionStrings) && matchedSku.optionStrings.length > 0) return matchedSku.optionStrings.join(" - ");
  }

  const productOption = pageData?.data?.root?.fields?.productOption || pageData?.productOption || pageData?.mods?.skuSelect;
  const skuBase = productOption?.skuBase;
  const matchedSkuBase = Array.isArray(skuBase?.skus) ? skuBase.skus.find((item: any) => String(item.skuId) === String(skuId)) : null;
  if (matchedSkuBase?.propPath) {
    const pathIds = String(matchedSkuBase.propPath)
      .split(";")
      .filter(Boolean)
      .map((part) => (part.includes(":") ? part.split(":")[1] : part));
    const propsList = skuBase.properties || skuBase.props || [];
    const resolved: string[] = [];
    for (const property of propsList) {
      for (const value of property.values || []) {
        if (pathIds.includes(String(value.vid)) || pathIds.includes(String(value.id))) resolved.push(value.name || value.value);
      }
    }
    if (resolved.length > 0) return resolved.join(" - ");
  }

  return "Default";
}

export function parseLazadaHtml(html: string): LazadaSkuPayload {
  const pageData = extractJsonAssignment(html, ["pageData", "__moduleData__", "__INITIAL_STATE__"]);
  if (!pageData) throw new Error("Lazada pageData not found in HTML scripts");

  const titleMatch =
    html.match(/<h1[^>]*class=["'][^"']*pdp-product-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleFromHtml = titleMatch?.[1] ? stripHtml(titleMatch[1]).replace(/\|.*$/g, "").trim() : "";
  const productName =
    titleFromHtml ||
    pageData?.data?.root?.fields?.product?.title ||
    pageData?.data?.root?.fields?.product?.name ||
    "Lazada product";

  return parseLazadaPageData(pageData, titleFromHtml, "fetch", true);
}

function parseLazadaPageData(pageData: any, titleFromDom: string, method: LazadaCrawlMethod, allowTrackingFallback: boolean): LazadaSkuPayload {
  const productName =
    titleFromDom ||
    pageData?.data?.root?.fields?.product?.title ||
    pageData?.data?.root?.fields?.product?.name ||
    "Lazada product";

  const skuInfos = pageData?.data?.root?.fields?.skuInfos || findSkuInfosRecursive(pageData);
  if (!skuInfos) throw new Error("Lazada skuInfos not found");
  const trackingPrice = allowTrackingFallback ? parseVnd(pageData?.data?.root?.fields?.tracking?.pdt_price) : 0;

  const seen = new Set<string>();
  const warnings: string[] = [];
  const skus = Object.keys(skuInfos)
    .map((key) => {
      const sku = skuInfos[key];
      const skuId = String(sku?.skuId || key);
      if (!sku || seen.has(skuId)) return null;
      seen.add(skuId);

      const recursivePrice = findPriceRecursively(pageData, skuId);
      const priceInfo = firstPriceInfo(sku.price, skuInfos[skuId]?.price, recursivePrice);
      const originalPrice = Number(priceInfo.originalPrice?.value) || parseVnd(priceInfo.originalPrice?.text) || 0;
      const salePrice =
        Number(priceInfo.salePrice?.value) ||
        parseVnd(priceInfo.salePrice?.text) ||
        parseVnd(priceInfo.salePrice?.noSymbolPriceText) ||
        0;
      const finalPrice = Number(priceInfo.coupon?.priceNumber) || parseVnd(priceInfo.coupon?.priceText) || salePrice;
      const discountText = priceInfo.coupon?.desc || null;
      const couponDiscount = parseVnd(discountText || "");
      const fallbackPrice = !originalPrice && !salePrice && !finalPrice && trackingPrice ? trackingPrice : 0;
      const resolvedOriginalPrice = originalPrice || fallbackPrice;
      const resolvedSalePrice = salePrice || fallbackPrice;
      const resolvedFinalPrice = finalPrice || fallbackPrice;
      const currentPrice =
        resolvedFinalPrice && couponDiscount
          ? resolvedFinalPrice + couponDiscount
          : resolvedSalePrice || resolvedFinalPrice || resolvedOriginalPrice || 0;

      if (fallbackPrice) {
        const message = `Lazada price warning: skuId ${skuId} missing SKU price object; using tracking.pdt_price fallback ${fallbackPrice}`;
        warnings.push(message);
        console.warn(message);
      }

      if (!resolvedOriginalPrice && !resolvedSalePrice && !resolvedFinalPrice && !currentPrice) {
        const debug = {
          skuId,
          skuKeys: Object.keys(sku || {}),
          skuPrice: sku?.price ?? null,
          keyedSkuPrice: skuInfos[skuId]?.price ?? null,
          recursivePrice: recursivePrice ?? null,
          rawPreview: jsonPreview(sku)
        };
        const message = `Lazada price debug: ${JSON.stringify(debug)}`;
        warnings.push(message);
        console.warn(message);
      }

      return {
        skuId,
        variantName: resolveVariant(sku, skuId, pageData),
        originalPrice: resolvedOriginalPrice,
        salePrice: resolvedSalePrice,
        finalPrice: resolvedFinalPrice,
        couponDiscount,
        currentPrice,
        discountText,
        method: fallbackPrice ? "fetch_tracking_fallback" : method,
        raw: sku
      };
    })
    .filter(Boolean) as LazadaSkuPayload["skus"];

  return { productName, warnings, skus };
}

export function shouldUsePlaywrightFallback(payload: LazadaSkuPayload) {
  if (payload.skus.length === 0) return true;
  return payload.skus.some(
    (sku) =>
      sku.method === "fetch_tracking_fallback" ||
      (!sku.originalPrice && !sku.currentPrice && !sku.finalPrice)
  );
}

export async function crawlLazada(_url: string, _context: CrawlContext): Promise<CrawlResult> {
  throw new Error("Lazada backend crawler is disabled. Use the Companion Chrome Extension for browser-session price crawling.");
}
