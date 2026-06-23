import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function addLog(input: {
  jobId: string;
  linkId?: string;
  level: "info" | "warn" | "error";
  message: string;
  meta?: Prisma.InputJsonValue;
}) {
  return prisma.crawlLog.create({
    data: {
      jobId: input.jobId,
      linkId: input.linkId,
      level: input.level,
      message: input.message,
      meta: input.meta ? JSON.stringify(input.meta) : undefined
    }
  });
}
