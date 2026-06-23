# Marketplace SKU Crawler Web App

Lightweight Next.js web app for managing Lazada and Shopee product SKU price crawl jobs.

This app is intentionally simple for a small team:

- Next.js App Router + TypeScript
- Tailwind CSS
- Neon PostgreSQL + Prisma
- Shopee server-side HTTP fetch crawler
- Lazada Companion Chrome Extension crawler using the user's real Chrome browser session
- xlsx export
- No Redis
- No BullMQ
- No Docker requirement
- No backend Playwright crawler

Existing Chrome Extension folders at `../Lazada` and `../Shopee` are not modified.

## Setup

```bash
cd web-app
npm install
copy .env.example .env
```

Fill `DATABASE_URL` in `.env` with your Neon PostgreSQL connection string and set a private `EXTENSION_TOKEN`.

```bash
npx prisma migrate dev
npm run dev
```

Open `http://localhost:3000`.

## Environment

```env
DATABASE_URL=
CRAWLER_CONCURRENCY=2
CRAWLER_LINK_TIMEOUT_MS=30000
ENABLE_RAW_JSON=true
RAW_JSON_MAX_CHARS=50000
EXTENSION_TOKEN=
EXTENSION_POLL_INTERVAL_MS=3000
DB_STORAGE_WARNING_BYTES=450000000
DB_STORAGE_LIMIT_BYTES=500000000
ADMIN_DELETE_CONFIRM_TEXT=DELETE
```

## How Crawling Works

`POST /api/jobs` creates `CrawlJob` and `CrawlLink` rows.

Shopee jobs start processing inside the current Next.js Node process with low concurrency. Lazada jobs stay pending until the Companion Chrome Extension claims links and posts results back.

The frontend polls:

- `GET /api/jobs/:id`
- `GET /api/jobs/:id/results`

Progress and results are stored in Neon through Prisma.

Important limitation: Shopee still uses an in-memory job runner, so a server restart can interrupt running Shopee jobs. Lazada extension clients also need to reconnect after a server restart. Already saved DB rows remain available, and failed links can be retried from the UI.

## Lazada

Lazada price data is crawled by the Companion Chrome Extension in `../companion-extension`.

Why: Lazada only exposes complete SKU price data inside a real user Chrome browser session. The web-app does not try to bypass captcha, and it no longer runs backend Playwright/headless crawling for Lazada.

Load the extension:

1. Open Chrome Extensions: `chrome://extensions`
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `companion-extension` from the project root.
5. Open the extension popup.
6. Enter the web app URL, for example `http://localhost:3000`.
7. Enter the same `EXTENSION_TOKEN` configured in `web-app/.env`.
8. Click Connect.

The extension polls:

- `POST /api/extension/register`
- `GET /api/extension/next-link?clientId=...`
- `POST /api/extension/result`
- `POST /api/extension/log`

Every extension request must send:

```http
Authorization: Bearer <EXTENSION_TOKEN>
```

For each Lazada link, the extension opens a real Chrome tab, waits for page load, injects into the page MAIN world, and reads:

- `pageData`
- `__moduleData__`
- `__INITIAL_STATE__`
- `skuInfos`

It parses one row per SKU and uses this pricing logic:

- `originalPrice = price.originalPrice.value || price.originalPrice.text || 0`
- `salePrice = price.salePrice.value || price.salePrice.text || price.salePrice.noSymbolPriceText || 0`
- `finalPrice = price.coupon.priceNumber || price.coupon.priceText || salePrice`
- `couponDiscount = numeric value from price.coupon.desc`
- `currentPrice = finalPrice + couponDiscount` when a coupon exists, otherwise sale/final/original price

If captcha/security verification is detected, the extension does not bypass it. The link is marked failed and a CrawlLog is written: `Captcha detected, manual action required`.

## Shopee

The Shopee crawler parses `shopId` and `itemId` from:

- `/i.{shopId}.{itemId}`
- `/product/{shopId}/{itemId}`

Then it calls:

- `https://shopee.vn/api/v4/pdp/get_pc?item_id=...&shop_id=...`
- `https://shopee.vn/api/v4/voucher/get_vouchers_by_item?item_id=...&shop_id=...`

Shopee prices are normalized by dividing by `100000` when needed. Voucher final price is an estimate only, and `voucherNote` states that it is not checkout-guaranteed.

If Shopee returns 403/captcha/null item, the link is marked failed. The app does not try to bypass captcha.

## Admin Data Tools

The Database Monitor uses:

- `GET /api/admin/db-status`
- `DELETE /api/admin/data/logs`
- `DELETE /api/admin/data/raw-json`
- `DELETE /api/admin/data/all`

Deleting all data requires typing `DELETE` or the configured `ADMIN_DELETE_CONFIRM_TEXT`. It deletes crawl rows only and does not drop tables, schema, or migrations.

## Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run prisma:migrate
npm run prisma:studio
```
