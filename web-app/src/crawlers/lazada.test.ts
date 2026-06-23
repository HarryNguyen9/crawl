import assert from "node:assert/strict";
import test from "node:test";
import { parseLazadaHtml, parseVnd, shouldUsePlaywrightFallback } from "./lazada";

test("parseVnd handles Lazada formatted VND text", () => {
  assert.equal(parseVnd("685.000 ₫"), 685000);
  assert.equal(parseVnd("Mua ngay giảm 125.260 ₫"), 125260);
  assert.equal(parseVnd("271000"), 271000);
  assert.equal(parseVnd(""), 0);
});

test("parseLazadaHtml reads price text and skuInfos[skuId] price fallback", () => {
  const pageData = {
    data: {
      root: {
        fields: {
          product: { title: "Test Lazada Product" },
          skuInfos: {
            listKey: {
              skuId: "123",
              cartPropValues: ["Blue"]
            },
            "123": {
              price: {
                originalPrice: { text: "685.000 ₫" },
                salePrice: { noSymbolPriceText: "380000" },
                coupon: {
                  priceText: "254.740 ₫",
                  desc: "Mua ngay giảm 125.260 ₫"
                }
              }
            }
          }
        }
      }
    }
  };
  const html = `<script>window.pageData = ${JSON.stringify(pageData)};</script>`;

  const parsed = parseLazadaHtml(html);

  assert.equal(parsed.skus[0].originalPrice, 685000);
  assert.equal(parsed.skus[0].salePrice, 380000);
  assert.equal(parsed.skus[0].finalPrice, 254740);
  assert.equal(parsed.skus[0].couponDiscount, 125260);
  assert.equal(parsed.skus[0].currentPrice, 380000);
});

test("parseLazadaHtml finds price recursively by skuId", () => {
  const pageData = {
    data: {
      root: {
        fields: {
          product: { title: "Recursive Price Product" },
          skuInfos: {
            abc: {
              skuId: "sku-9",
              saleProp: { color: "Red" }
            }
          },
          otherModule: {
            nested: {
              skuId: "sku-9",
              price: {
                originalPrice: { value: 700000 },
                salePrice: { text: "510.000 ₫" },
                coupon: { priceNumber: 490000 }
              }
            }
          }
        }
      }
    }
  };
  const html = `<script>window.pageData = ${JSON.stringify(pageData)};</script>`;

  const parsed = parseLazadaHtml(html);

  assert.equal(parsed.skus[0].originalPrice, 700000);
  assert.equal(parsed.skus[0].salePrice, 510000);
  assert.equal(parsed.skus[0].finalPrice, 490000);
  assert.equal(parsed.skus[0].currentPrice, 510000);
});

test("parseLazadaHtml falls back to tracking pdt_price when SKU price is absent", () => {
  const pageData = {
    data: {
      root: {
        fields: {
          product: { title: "Tracking Price Product" },
          tracking: { pdt_price: "813.000 ₫" },
          skuInfos: {
            "116175741046": {
              skuId: "116175741046",
              cartPropValues: ["Default"]
            }
          }
        }
      }
    }
  };
  const html = `<script>window.pageData = ${JSON.stringify(pageData)};</script>`;

  const parsed = parseLazadaHtml(html);

  assert.equal(parsed.skus[0].originalPrice, 813000);
  assert.equal(parsed.skus[0].salePrice, 813000);
  assert.equal(parsed.skus[0].finalPrice, 813000);
  assert.equal(parsed.skus[0].currentPrice, 813000);
  assert.match(parsed.warnings.join("\n"), /using tracking.pdt_price fallback/);
  assert.equal(shouldUsePlaywrightFallback(parsed), true);
});

test("parseLazadaHtml does not need Playwright when SKU price exists", () => {
  const pageData = {
    data: {
      root: {
        fields: {
          product: { title: "Priced Product" },
          skuInfos: {
            "123": {
              skuId: "123",
              cartPropValues: ["Blue"],
              price: {
                originalPrice: { value: 685000 },
                salePrice: { value: 380000 },
                coupon: { priceNumber: 254740, desc: "Mua ngay giảm 125.260 ₫" }
              }
            }
          }
        }
      }
    }
  };
  const html = `<script>window.pageData = ${JSON.stringify(pageData)};</script>`;

  const parsed = parseLazadaHtml(html);

  assert.equal(shouldUsePlaywrightFallback(parsed), false);
});
