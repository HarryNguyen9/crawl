-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('lazada', 'shopee');

-- CreateEnum
CREATE TYPE "CrawlJobStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "CrawlLinkStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "CrawlLogLevel" AS ENUM ('info', 'warn', 'error');

-- CreateTable
CREATE TABLE "CrawlJob" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "CrawlJobStatus" NOT NULL DEFAULT 'pending',
    "totalLinks" INTEGER NOT NULL DEFAULT 0,
    "processedLinks" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CrawlJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlLink" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "url" TEXT NOT NULL,
    "status" "CrawlLinkStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CrawlLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSku" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "url" TEXT NOT NULL,
    "shopId" TEXT,
    "itemId" TEXT,
    "skuId" TEXT,
    "productName" TEXT NOT NULL,
    "variantName" TEXT,
    "originalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "couponDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voucherNote" TEXT,
    "discountText" TEXT,
    "rawJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "linkId" TEXT,
    "level" "CrawlLogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrawlLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrawlJob_platform_createdAt_idx" ON "CrawlJob"("platform", "createdAt");

-- CreateIndex
CREATE INDEX "CrawlJob_status_idx" ON "CrawlJob"("status");

-- CreateIndex
CREATE INDEX "CrawlLink_jobId_status_idx" ON "CrawlLink"("jobId", "status");

-- CreateIndex
CREATE INDEX "CrawlLink_platform_idx" ON "CrawlLink"("platform");

-- CreateIndex
CREATE INDEX "ProductSku_jobId_idx" ON "ProductSku"("jobId");

-- CreateIndex
CREATE INDEX "ProductSku_linkId_idx" ON "ProductSku"("linkId");

-- CreateIndex
CREATE INDEX "ProductSku_platform_idx" ON "ProductSku"("platform");

-- CreateIndex
CREATE INDEX "CrawlLog_jobId_createdAt_idx" ON "CrawlLog"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "CrawlLog_level_idx" ON "CrawlLog"("level");

-- AddForeignKey
ALTER TABLE "CrawlLink" ADD CONSTRAINT "CrawlLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSku" ADD CONSTRAINT "ProductSku_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSku" ADD CONSTRAINT "ProductSku_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "CrawlLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlLog" ADD CONSTRAINT "CrawlLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlLog" ADD CONSTRAINT "CrawlLog_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "CrawlLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
