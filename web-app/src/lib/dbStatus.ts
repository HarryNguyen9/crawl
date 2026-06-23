import { prisma } from "./prisma";

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export async function getDbStatus() {
  const [sizeResult, jobs, links, skus, logs, rawJsonRows] = await Promise.all([
    prisma.$queryRaw<Array<{ size_bytes: bigint | number | string }>>`SELECT pg_database_size(current_database()) AS size_bytes`,
    prisma.crawlJob.count(),
    prisma.crawlLink.count(),
    prisma.productSku.count(),
    prisma.crawlLog.count(),
    prisma.productSku.count({ where: { rawJson: { not: null } } })
  ]);

  const sizeBytes = Number(sizeResult[0]?.size_bytes ?? 0);
  const warningBytes = envNumber("DB_STORAGE_WARNING_BYTES", 450_000_000);
  const limitBytes = envNumber("DB_STORAGE_LIMIT_BYTES", 500_000_000);
  const usagePercent = limitBytes > 0 ? Math.min(100, Math.round((sizeBytes / limitBytes) * 10000) / 100) : 0;

  return {
    sizeBytes,
    warningBytes,
    limitBytes,
    usagePercent,
    counts: { jobs, links, skus, logs, rawJsonRows },
    isWarning: sizeBytes >= warningBytes
  };
}
