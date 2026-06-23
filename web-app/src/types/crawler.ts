import type { Platform } from "@prisma/client";

export type CrawlerPlatform = Platform;

export type ProductSkuInput = {
  platform: CrawlerPlatform;
  url: string;
  shopId?: string | null;
  itemId?: string | null;
  skuId?: string | null;
  productName: string;
  variantName?: string | null;
  originalPrice?: number;
  currentPrice?: number;
  finalPrice?: number;
  couponDiscount?: number;
  salePrice?: number;
  voucherNote?: string | null;
  discountText?: string | null;
  rawJson?: string | null;
};

export type CrawlResult = {
  skus: ProductSkuInput[];
  warnings?: string[];
};

export type CrawlContext = {
  timeoutMs: number;
  enableRawJson: boolean;
  rawJsonMaxChars: number;
};

export type CrawlJobPayload = {
  jobId: string;
};
