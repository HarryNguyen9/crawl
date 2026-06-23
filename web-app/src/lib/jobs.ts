import { CrawlJobStatus, CrawlLinkStatus, Platform } from "@prisma/client";
import { prisma } from "./prisma";
import { dedupeLinks, validatePlatformLinks } from "./validators";

export async function createCrawlJob(platform: Platform, rawLinks: string[]) {
  const links = dedupeLinks(rawLinks);
  const invalidLinks = validatePlatformLinks(platform, links);

  if (invalidLinks.length > 0) {
    throw new Error(`Invalid ${platform} link(s): ${invalidLinks.slice(0, 3).join(", ")}`);
  }

  const job = await prisma.crawlJob.create({
    data: {
      platform,
      totalLinks: links.length,
      links: {
        create: links.map((url) => ({
          platform,
          url
        }))
      },
      logs: {
        create: {
          level: "info",
          message: `Created ${platform} crawl job with ${links.length} links`
        }
      }
    }
  });

  return job;
}

export async function getJobProgress(jobId: string) {
  const [job, skuCount] = await Promise.all([
    prisma.crawlJob.findUnique({
      where: { id: jobId },
      include: {
        links: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            url: true,
            status: true,
            error: true,
            retryCount: true
          }
        }
      }
    }),
    prisma.productSku.count({ where: { jobId } })
  ]);

  if (!job) return null;
  return { ...job, skuCount };
}

export async function listJobs(platform?: Platform) {
  return prisma.crawlJob.findMany({
    where: platform ? { platform } : undefined,
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      _count: {
        select: {
          skus: true,
          links: true,
          logs: true
        }
      }
    }
  });
}

export async function cancelJob(jobId: string) {
  return prisma.crawlJob.update({
    where: { id: jobId },
    data: {
      status: CrawlJobStatus.cancelled,
      finishedAt: new Date(),
      logs: {
        create: {
          level: "warn",
          message: "Job cancelled by user"
        }
      }
    }
  });
}

export async function retryFailedLinks(jobId: string) {
  const failedCount = await prisma.crawlLink.count({
    where: { jobId, status: CrawlLinkStatus.failed }
  });

  if (failedCount === 0) {
    return { failedCount: 0 };
  }

  await prisma.$transaction([
    prisma.crawlLink.updateMany({
      where: { jobId, status: CrawlLinkStatus.failed },
      data: {
        status: CrawlLinkStatus.pending,
        error: null,
        startedAt: null,
        finishedAt: null
      }
    }),
    prisma.crawlJob.update({
      where: { id: jobId },
      data: {
        status: CrawlJobStatus.pending,
        finishedAt: null,
        processedLinks: { decrement: failedCount },
        failedCount: { decrement: failedCount },
        logs: {
          create: {
            level: "info",
            message: `Queued ${failedCount} failed link(s) for retry`
          }
        }
      }
    })
  ]);

  return { failedCount };
}
