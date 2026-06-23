import { CrawlJobStatus, CrawlLinkStatus, Platform, type CrawlLogLevel } from "@prisma/client";
import { z } from "zod";
import { envBoolean, envNumber, truncateRawJson } from "@/crawlers/shared";
import { prisma } from "./prisma";

type ExtensionClient = {
  clientId: string;
  connectedAt: string;
  lastHeartbeat: string;
  currentLink?: string | null;
};

type ExtensionBridgeState = {
  clients: Map<string, ExtensionClient>;
};

const globalBridge = globalThis as typeof globalThis & { __tmallExtensionBridge?: ExtensionBridgeState };
const bridgeState = (globalBridge.__tmallExtensionBridge ??= { clients: new Map() });

export const extensionRowSchema = z.object({
  url: z.string().optional().nullable(),
  productName: z.string().optional(),
  shopId: z.union([z.string(), z.number()]).optional().nullable(),
  itemId: z.union([z.string(), z.number()]).optional().nullable(),
  skuId: z.union([z.string(), z.number()]).optional().nullable(),
  variantName: z.string().optional().nullable(),
  originalPrice: z.coerce.number().default(0),
  currentPrice: z.coerce.number().default(0),
  finalPrice: z.coerce.number().default(0),
  couponDiscount: z.coerce.number().default(0),
  promotionDiscount: z.coerce.number().default(0),
  voucherDiscount: z.coerce.number().default(0),
  salePrice: z.coerce.number().default(0),
  voucherNote: z.string().optional().nullable(),
  discountText: z.string().optional().nullable(),
  rawJson: z.unknown().optional().nullable()
});

export const extensionResultSchema = z.object({
  clientId: z.string().min(1),
  jobId: z.string().min(1),
  linkId: z.string().min(1),
  status: z.enum(["success", "failed", "captcha"]),
  rows: z.array(extensionRowSchema).default([]),
  error: z.string().optional().nullable()
});

export const extensionLogSchema = z.object({
  clientId: z.string().min(1),
  jobId: z.string().min(1),
  linkId: z.string().optional().nullable(),
  level: z.enum(["info", "warn", "error"]).default("info"),
  message: z.string().min(1),
  meta: z.unknown().optional()
});

export function getBearerToken(headers: Headers) {
  const value = headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function requireExtensionAuth(headers: Headers) {
  const expected = process.env.EXTENSION_TOKEN;
  if (!expected) throw new Error("EXTENSION_TOKEN is not configured");
  if (getBearerToken(headers) !== expected) throw new Error("Invalid extension token");
}

export function normalizeExtensionRows(rows: unknown[]) {
  const enableRawJson = envBoolean("ENABLE_RAW_JSON", true);
  const rawJsonMaxChars = envNumber("RAW_JSON_MAX_CHARS", 50000);

  return rows.map((row) => {
    const parsed = extensionRowSchema.parse(row);
    return {
      productName: parsed.productName || "Unknown marketplace product",
      url: parsed.url || null,
      shopId: parsed.shopId === null || parsed.shopId === undefined ? null : String(parsed.shopId),
      itemId: parsed.itemId === null || parsed.itemId === undefined ? null : String(parsed.itemId),
      skuId: parsed.skuId === null || parsed.skuId === undefined ? null : String(parsed.skuId),
      variantName: parsed.variantName || "Default",
      originalPrice: parsed.originalPrice,
      currentPrice: parsed.currentPrice,
      finalPrice: parsed.finalPrice,
      couponDiscount: parsed.couponDiscount,
      promotionDiscount: parsed.promotionDiscount,
      voucherDiscount: parsed.voucherDiscount,
      salePrice: parsed.salePrice,
      voucherNote: parsed.voucherNote ?? null,
      discountText: parsed.discountText ?? null,
      rawJson: truncateRawJson(parsed.rawJson ?? row, enableRawJson, rawJsonMaxChars)
    };
  });
}

export function resolveFinalJobStatus(input: { remainingCount: number; failedCount: number }) {
  if (input.remainingCount > 0) return null;
  return input.failedCount > 0 ? CrawlJobStatus.failed : CrawlJobStatus.completed;
}

export function registerExtensionClient(clientId = crypto.randomUUID()) {
  const now = new Date().toISOString();
  const client: ExtensionClient = {
    clientId,
    connectedAt: now,
    lastHeartbeat: now,
    currentLink: null
  };
  bridgeState.clients.set(clientId, client);
  return client;
}

export function touchExtensionClient(clientId: string, currentLink?: string | null) {
  const existing = bridgeState.clients.get(clientId) ?? registerExtensionClient(clientId);
  existing.lastHeartbeat = new Date().toISOString();
  if (currentLink !== undefined) existing.currentLink = currentLink;
  bridgeState.clients.set(clientId, existing);
  return existing;
}

export function getExtensionStatus() {
  const clients = Array.from(bridgeState.clients.values()).sort((a, b) => b.lastHeartbeat.localeCompare(a.lastHeartbeat));
  const latest = clients[0] ?? null;
  const connected =
    latest !== null && Date.now() - new Date(latest.lastHeartbeat).getTime() <= Math.max(30000, envNumber("EXTENSION_POLL_INTERVAL_MS", 3000) * 6);
  return { connected, latest, clients };
}

export async function claimNextMarketplaceLink(clientId: string, platform?: Platform) {
  touchExtensionClient(clientId);

  const link = await prisma.crawlLink.findFirst({
    where: {
      platform: platform ? platform : { in: [Platform.lazada, Platform.shopee] },
      status: CrawlLinkStatus.pending,
      job: { status: { in: [CrawlJobStatus.pending, CrawlJobStatus.running] } }
    },
    orderBy: { createdAt: "asc" },
    include: { job: true }
  });

  if (!link || link.job.status === CrawlJobStatus.cancelled) {
    touchExtensionClient(clientId, null);
    return null;
  }

  const claimed = await prisma.crawlLink.updateMany({
    where: { id: link.id, status: CrawlLinkStatus.pending },
    data: { status: CrawlLinkStatus.running, startedAt: new Date(), error: null }
  });
  if (claimed.count === 0) return null;

  await prisma.crawlJob.update({
    where: { id: link.jobId },
    data: { status: CrawlJobStatus.running, startedAt: link.job.startedAt ?? new Date() }
  });
  await prisma.crawlLog.create({
    data: {
      jobId: link.jobId,
      linkId: link.id,
      level: "info",
      message: `Extension ${clientId} claimed ${link.platform} link ${link.url}`
    }
  });

  touchExtensionClient(clientId, link.url);
  return { jobId: link.jobId, linkId: link.id, url: link.url, platform: link.platform, maxTabs: link.job.maxTabs };
}

export async function peekNextMarketplaceLink(clientId: string, platform?: Platform) {
  touchExtensionClient(clientId);
  const link = await prisma.crawlLink.findFirst({
    where: {
      platform: platform ? platform : { in: [Platform.lazada, Platform.shopee] },
      status: CrawlLinkStatus.pending,
      job: { status: { in: [CrawlJobStatus.pending, CrawlJobStatus.running] } }
    },
    orderBy: { createdAt: "asc" }
  });
  if (!link) return null;
  return { jobId: link.jobId, linkId: link.id, url: link.url, platform: link.platform };
}

async function finalizeJobIfDone(jobId: string) {
  const [remainingCount, failedCount] = await Promise.all([
    prisma.crawlLink.count({ where: { jobId, status: { in: [CrawlLinkStatus.pending, CrawlLinkStatus.running] } } }),
    prisma.crawlLink.count({ where: { jobId, status: CrawlLinkStatus.failed } })
  ]);
  const finalStatus = resolveFinalJobStatus({ remainingCount, failedCount });
  if (!finalStatus) return null;

  const job = await prisma.crawlJob.update({
    where: { id: jobId },
    data: { status: finalStatus, finishedAt: new Date() }
  });
  await prisma.crawlLog.create({
    data: {
      jobId,
      level: failedCount > 0 ? "warn" : "info",
      message: `Extension crawler finished with ${failedCount} failed link(s)`
    }
  });
  return job;
}

export async function saveExtensionResult(input: z.infer<typeof extensionResultSchema>) {
  const payload = extensionResultSchema.parse(input);
  touchExtensionClient(payload.clientId, null);

  const link = await prisma.crawlLink.findFirst({
    where: { id: payload.linkId, jobId: payload.jobId, platform: { in: [Platform.lazada, Platform.shopee] } },
    include: { job: true }
  });
  if (!link) throw new Error("Extension crawl link not found");
  if (link.job.status === CrawlJobStatus.cancelled) throw new Error("Job is cancelled");
  if (link.status === CrawlLinkStatus.completed || link.status === CrawlLinkStatus.failed) {
    return { accepted: false, reason: `Link already ${link.status}` };
  }

  if (payload.status !== "success") {
    const message = payload.error || (payload.status === "captcha" ? "Captcha detected, manual action required" : "Extension crawl failed");
    await prisma.$transaction([
      prisma.crawlLink.update({
        where: { id: link.id },
        data: { status: CrawlLinkStatus.failed, error: message, finishedAt: new Date() }
      }),
      prisma.crawlJob.update({
        where: { id: link.jobId },
        data: { processedLinks: { increment: 1 }, failedCount: { increment: 1 } }
      }),
      prisma.crawlLog.create({
        data: { jobId: link.jobId, linkId: link.id, level: "error", message }
      })
    ]);
    await finalizeJobIfDone(link.jobId);
    return { accepted: true, savedRows: 0 };
  }

  const rows = normalizeExtensionRows(payload.rows);
  if (rows.length === 0) throw new Error("Extension result has no SKU rows");

  await prisma.$transaction([
    prisma.productSku.deleteMany({ where: { linkId: link.id } }),
    prisma.productSku.createMany({
      data: rows.map((row) => ({
        jobId: link.jobId,
        linkId: link.id,
        platform: link.platform,
        url: row.url || link.url,
        shopId: row.shopId,
        itemId: row.itemId,
        skuId: row.skuId,
        productName: row.productName,
        variantName: row.variantName,
        originalPrice: row.originalPrice,
        currentPrice: row.currentPrice,
        finalPrice: row.finalPrice,
        couponDiscount: row.couponDiscount,
        promotionDiscount: row.promotionDiscount,
        voucherDiscount: row.voucherDiscount,
        salePrice: row.salePrice,
        voucherNote: row.voucherNote || "method: companion_extension",
        discountText: row.discountText,
        rawJson: row.rawJson
      }))
    }),
    prisma.crawlLink.update({
      where: { id: link.id },
      data: { status: CrawlLinkStatus.completed, finishedAt: new Date(), error: null }
    }),
    prisma.crawlJob.update({
      where: { id: link.jobId },
      data: { processedLinks: { increment: 1 }, successCount: { increment: 1 } }
    }),
    prisma.crawlLog.create({
      data: { jobId: link.jobId, linkId: link.id, level: "info", message: `Extension saved ${rows.length} SKU row(s)` }
    })
  ]);

  await finalizeJobIfDone(link.jobId);
  return { accepted: true, savedRows: rows.length };
}

export async function saveExtensionLog(input: z.infer<typeof extensionLogSchema>) {
  const payload = extensionLogSchema.parse(input);
  touchExtensionClient(payload.clientId);
  return prisma.crawlLog.create({
    data: {
      jobId: payload.jobId,
      linkId: payload.linkId || undefined,
      level: payload.level as CrawlLogLevel,
      message: payload.message,
      meta: payload.meta ? JSON.stringify(payload.meta) : undefined
    }
  });
}
