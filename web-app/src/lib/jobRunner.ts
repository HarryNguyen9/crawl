import { CrawlJobStatus, CrawlLinkStatus, Platform } from "@prisma/client";
import { crawlLazada } from "../crawlers/lazada";
import { crawlShopee } from "../crawlers/shopee";
import { envBoolean, envNumber } from "../crawlers/shared";
import type { CrawlContext, CrawlResult } from "../types/crawler";
import { addLog } from "./logs";
import { prisma } from "./prisma";

const runningJobs = new Map<string, Promise<void>>();

function getContext(): CrawlContext {
  return {
    timeoutMs: envNumber("CRAWLER_LINK_TIMEOUT_MS", 30000),
    enableRawJson: envBoolean("ENABLE_RAW_JSON", true),
    rawJsonMaxChars: envNumber("RAW_JSON_MAX_CHARS", 50000)
  };
}

async function crawlUrl(platform: Platform, url: string): Promise<CrawlResult> {
  const context = getContext();
  return platform === Platform.lazada ? crawlLazada(url, context) : crawlShopee(url, context);
}

async function processOneLink(jobId: string) {
  const link = await prisma.crawlLink.findFirst({
    where: { jobId, status: CrawlLinkStatus.pending },
    orderBy: { createdAt: "asc" }
  });
  if (!link) return false;

  const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === CrawlJobStatus.cancelled) return false;

  const claimed = await prisma.crawlLink.updateMany({
    where: { id: link.id, status: CrawlLinkStatus.pending },
    data: { status: CrawlLinkStatus.running, startedAt: new Date(), error: null }
  });
  if (claimed.count === 0) return true;
  await addLog({ jobId, linkId: link.id, level: "info", message: `Crawling ${link.url}` });

  try {
    const result = await crawlUrl(link.platform, link.url);
    if (result.skus.length === 0) throw new Error("Crawler returned no SKU rows");

    await prisma.$transaction([
      prisma.productSku.deleteMany({ where: { linkId: link.id } }),
      prisma.productSku.createMany({
        data: result.skus.map((sku) => ({
          jobId,
          linkId: link.id,
          platform: sku.platform,
          url: sku.url,
          shopId: sku.shopId,
          itemId: sku.itemId,
          skuId: sku.skuId,
          productName: sku.productName,
          variantName: sku.variantName,
          originalPrice: sku.originalPrice ?? 0,
          currentPrice: sku.currentPrice ?? 0,
          finalPrice: sku.finalPrice ?? 0,
          couponDiscount: sku.couponDiscount ?? 0,
          salePrice: sku.salePrice ?? 0,
          voucherNote: sku.voucherNote,
          discountText: sku.discountText,
          rawJson: sku.rawJson
        }))
      }),
      prisma.crawlLink.update({
        where: { id: link.id },
        data: { status: CrawlLinkStatus.completed, finishedAt: new Date() }
      }),
      prisma.crawlJob.update({
        where: { id: jobId },
        data: {
          processedLinks: { increment: 1 },
          successCount: { increment: 1 }
        }
      })
    ]);

    for (const warning of result.warnings ?? []) {
      await addLog({ jobId, linkId: link.id, level: "warn", message: warning });
    }
    await addLog({ jobId, linkId: link.id, level: "info", message: `Saved ${result.skus.length} SKU row(s)` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.$transaction([
      prisma.crawlLink.update({
        where: { id: link.id },
        data: { status: CrawlLinkStatus.failed, error: message, finishedAt: new Date() }
      }),
      prisma.crawlJob.update({
        where: { id: jobId },
        data: {
          processedLinks: { increment: 1 },
          failedCount: { increment: 1 }
        }
      }),
      prisma.crawlLog.create({
        data: { jobId, linkId: link.id, level: "error", message }
      })
    ]);
  }

  return true;
}

async function linkLoop(jobId: string) {
  while (true) {
    const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === CrawlJobStatus.cancelled) return;
    const didWork = await processOneLink(jobId);
    if (!didWork) return;
  }
}

async function runJob(jobId: string) {
  const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === CrawlJobStatus.cancelled) return;

  await prisma.crawlJob.update({
    where: { id: jobId },
    data: {
      status: CrawlJobStatus.running,
      startedAt: job.startedAt ?? new Date()
    }
  });
  await addLog({ jobId, level: "info", message: "In-process crawler started" });

  const concurrency = Math.max(1, envNumber("CRAWLER_CONCURRENCY", 2));
  await Promise.all(Array.from({ length: concurrency }, () => linkLoop(jobId)));

  const latest = await prisma.crawlJob.findUnique({ where: { id: jobId } });
  if (!latest || latest.status === CrawlJobStatus.cancelled) return;

  const [pendingCount, failedCount] = await Promise.all([
    prisma.crawlLink.count({ where: { jobId, status: { in: [CrawlLinkStatus.pending, CrawlLinkStatus.running] } } }),
    prisma.crawlLink.count({ where: { jobId, status: CrawlLinkStatus.failed } })
  ]);

  if (pendingCount > 0) return;

  await prisma.crawlJob.update({
    where: { id: jobId },
    data: {
      status: failedCount > 0 ? CrawlJobStatus.failed : CrawlJobStatus.completed,
      finishedAt: new Date()
    }
  });
  await addLog({ jobId, level: failedCount > 0 ? "warn" : "info", message: `Crawler finished with ${failedCount} failed link(s)` });
}

export function startJobProcessing(jobId: string) {
  if (runningJobs.has(jobId)) return;
  const promise = runJob(jobId)
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await addLog({ jobId, level: "error", message: `Job runner crashed: ${message}` });
      await prisma.crawlJob.update({
        where: { id: jobId },
        data: { status: CrawlJobStatus.failed, finishedAt: new Date() }
      });
    })
    .finally(() => {
      runningJobs.delete(jobId);
    });
  runningJobs.set(jobId, promise);
}

export function isJobRunning(jobId: string) {
  return runningJobs.has(jobId);
}
