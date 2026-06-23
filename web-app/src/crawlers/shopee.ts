import type { CrawlContext, CrawlResult } from "../types/crawler";
import { fetchJson, normalizeShopeePrice, sanitizeSku, stackVoucherEstimate, truncateRawJson } from "./shared";

export function parseShopeeIds(url: string) {
  const match = url.match(/\/i\.(\d+)\.(\d+)/) || url.match(/\/product\/(\d+)\/(\d+)/);
  if (!match) return null;
  return { shopId: match[1], itemId: match[2] };
}

function voucherLabel(voucher: any) {
  const parts: string[] = [];
  if (voucher?.name) parts.push(String(voucher.name));
  if (voucher?.discount_value) parts.push(`Giảm ${Math.round(Number(voucher.discount_value) / 100000)}`);
  if (voucher?.discount_percentage) parts.push(`Giảm ${voucher.discount_percentage}%`);
  return parts.join(" ").trim();
}

export async function crawlShopee(url: string, context: CrawlContext): Promise<CrawlResult> {
  const ids = parseShopeeIds(url);
  if (!ids) throw new Error("Cannot parse Shopee shopId/itemId from URL");

  const pdpUrl = `https://shopee.vn/api/v4/pdp/get_pc?item_id=${ids.itemId}&shop_id=${ids.shopId}`;
  const pdpJson = await fetchJson<any>(pdpUrl, context.timeoutMs);
  const item = pdpJson?.data?.item;
  if (!item) throw new Error("Shopee PDP API returned no item data. It may be blocked by 403/captcha or unavailable.");

  const shopVouchers: string[] = [];
  const platformVouchers: string[] = [];
  const apiVouchers = pdpJson?.data?.shop_vouchers || pdpJson?.data?.vouchers || [];
  if (Array.isArray(apiVouchers)) {
    for (const voucher of apiVouchers) {
      const label = voucherLabel(voucher);
      if (label && !shopVouchers.includes(label)) shopVouchers.push(label);
    }
  }

  try {
    const voucherUrl = `https://shopee.vn/api/v4/voucher/get_vouchers_by_item?item_id=${ids.itemId}&shop_id=${ids.shopId}`;
    const voucherJson = await fetchJson<any>(voucherUrl, context.timeoutMs);
    const vouchers = voucherJson?.data?.vouchers || [];
    if (Array.isArray(vouchers)) {
      for (const voucher of vouchers) {
        const label = voucherLabel(voucher);
        if (label && !shopVouchers.includes(label)) shopVouchers.push(label);
      }
    }
  } catch {
    platformVouchers.push("Voucher API unavailable");
  }

  const productName = item.name || item.title || "Shopee product";
  const models = Array.isArray(item.models) && item.models.length > 0 ? item.models : [null];
  const shopVoucherText = shopVouchers.join(" | ");
  const platformVoucherText = platformVouchers.join(" | ");

  return {
    skus: models.map((model: any) => {
      const originalPrice = normalizeShopeePrice(model?.price_before_discount || item.price_before_discount || model?.price || item.price);
      const currentPrice = normalizeShopeePrice(model?.price || item.price);
      const estimate = stackVoucherEstimate(currentPrice, shopVoucherText, platformVoucherText);

      return sanitizeSku({
        platform: "shopee",
        url,
        shopId: ids.shopId,
        itemId: ids.itemId,
        skuId: model?.modelid ? String(model.modelid) : String(item.itemid || ids.itemId),
        productName,
        variantName: model?.name || "Default",
        originalPrice,
        currentPrice,
        finalPrice: estimate.finalPrice,
        voucherNote: estimate.note,
        discountText: [shopVoucherText, platformVoucherText].filter(Boolean).join(" | "),
        rawJson: truncateRawJson(model || item, context.enableRawJson, context.rawJsonMaxChars)
      });
    })
  };
}
