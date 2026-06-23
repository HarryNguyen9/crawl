"use client";

import type { Platform } from "@prisma/client";

type Row = Record<string, any>;

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("vi-VN");
}

export function ResultsTable({ platform, rows }: { platform: Platform; rows: Row[] }) {
  const columns =
    platform === "lazada"
      ? ["productName", "skuId", "variantName", "originalPrice", "currentPrice", "finalPrice", "couponDiscount", "url"]
      : ["productName", "shopId", "itemId", "variantName", "originalPrice", "currentPrice", "finalPrice", "voucherNote", "url"];

  const labels: Record<string, string> = {
    productName: "Product Name",
    skuId: "SKU ID",
    shopId: "Shop ID",
    itemId: "Item ID",
    variantName: "Variant",
    originalPrice: "Original Price",
    currentPrice: "Current Price",
    finalPrice: "Final Price",
    couponDiscount: "Coupon Discount",
    voucherNote: "Voucher Note",
    url: "URL"
  };

  return (
    <div className="overflow-hidden rounded-md border border-line bg-white">
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap border-b border-line px-3 py-2 font-semibold">
                  {labels[column]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={columns.length}>
                  No results yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  {columns.map((column) => {
                    const isPrice = ["originalPrice", "currentPrice", "finalPrice", "couponDiscount"].includes(column);
                    return (
                      <td key={column} className="max-w-xs truncate px-3 py-2" title={String(row[column] ?? "")}>
                        {isPrice ? money(row[column]) : row[column] ?? ""}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
