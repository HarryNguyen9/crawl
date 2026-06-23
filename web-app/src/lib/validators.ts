import { Platform } from "@prisma/client";
import { z } from "zod";

export const createJobSchema = z.object({
  platform: z.nativeEnum(Platform),
  links: z.array(z.string().trim().url()).min(1).max(500),
  maxTabs: z.coerce.number().int().min(1).max(20).default(1)
});

export const jobHistoryQuerySchema = z.object({
  platform: z.nativeEnum(Platform).optional()
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(200)
});

export const deleteAllSchema = z.object({
  confirmText: z.string()
});

export function dedupeLinks(links: string[]) {
  return Array.from(new Set(links.map((link) => link.trim()).filter(Boolean)));
}

export function validatePlatformLinks(platform: Platform, links: string[]) {
  const invalid = links.filter((link) => {
    const lower = link.toLowerCase();
    if (platform === Platform.lazada) {
      return !lower.includes("lazada.");
    }
    return !lower.includes("shopee.");
  });

  return invalid;
}
