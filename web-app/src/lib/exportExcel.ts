import * as XLSX from "xlsx";
import { Platform } from "@prisma/client";
import { prisma } from "./prisma";

export async function buildJobWorkbook(jobId: string) {
  const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const rows = await prisma.productSku.findMany({
    where: { jobId },
    orderBy: { createdAt: "asc" }
  });

  const data =
    job.platform === Platform.lazada
      ? rows.map((row) => ({
          "Product Name": row.productName,
          "SKU ID": row.skuId ?? "",
          Variant: row.variantName ?? "",
          "Original Price": row.originalPrice,
          "Current Price": row.currentPrice,
          "Final Price": row.finalPrice,
          "Coupon Discount": row.couponDiscount,
          "Promotion Discount": row.promotionDiscount,
          "Voucher Discount": row.voucherDiscount,
          URL: row.url
        }))
      : rows.map((row) => ({
          "Product Name": row.productName,
          "Shop ID": row.shopId ?? "",
          "Item ID": row.itemId ?? "",
          Variant: row.variantName ?? "",
          "Original Price": row.originalPrice,
          "Current Price": row.currentPrice,
          "Final Price": row.finalPrice,
          Voucher: row.discountText ?? "",
          "Voucher Note": row.voucherNote?.includes("not checkout-guaranteed") ? "Estimated" : row.voucherNote ?? "",
          URL: row.url
        }));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, sheet, job.platform === Platform.lazada ? "Lazada Results" : "Shopee Results");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return {
    buffer,
    filename: `${job.platform}-crawl-${job.id}.xlsx`
  };
}
