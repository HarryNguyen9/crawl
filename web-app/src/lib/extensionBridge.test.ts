import assert from "node:assert/strict";
import test from "node:test";
import { CrawlJobStatus } from "@prisma/client";
import { getBearerToken, normalizeExtensionRows, resolveFinalJobStatus } from "./extensionBridge";

test("getBearerToken reads bearer token case-insensitively", () => {
  const headers = new Headers({ Authorization: "Bearer secret-token" });
  assert.equal(getBearerToken(headers), "secret-token");
});

test("normalizeExtensionRows coerces prices and stores rawJson strings", () => {
  const rows = normalizeExtensionRows([
    {
      productName: "Product",
      url: "https://www.lazada.vn/products/i1-s123.html",
      skuId: 123,
      variantName: "Red",
      originalPrice: "813000",
      currentPrice: "783000",
      finalPrice: "625045",
      couponDiscount: "157955",
      promotionDiscount: "30000",
      voucherDiscount: "157955",
      salePrice: "783000",
      discountText: "coupon",
      rawJson: { skuId: 123 }
    }
  ]);

  assert.equal(rows[0].skuId, "123");
  assert.equal(rows[0].url, "https://www.lazada.vn/products/i1-s123.html");
  assert.equal(rows[0].originalPrice, 813000);
  assert.equal(rows[0].currentPrice, 783000);
  assert.equal(rows[0].finalPrice, 625045);
  assert.equal(rows[0].couponDiscount, 157955);
  assert.equal(rows[0].promotionDiscount, 30000);
  assert.equal(rows[0].voucherDiscount, 157955);
  assert.equal(rows[0].rawJson, JSON.stringify({ skuId: 123 }));
});

test("resolveFinalJobStatus keeps running while work remains", () => {
  assert.equal(resolveFinalJobStatus({ remainingCount: 1, failedCount: 0 }), null);
  assert.equal(resolveFinalJobStatus({ remainingCount: 0, failedCount: 0 }), CrawlJobStatus.completed);
  assert.equal(resolveFinalJobStatus({ remainingCount: 0, failedCount: 2 }), CrawlJobStatus.failed);
});
