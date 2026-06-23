"use client";

import type { Platform } from "@prisma/client";

type Row = Record<string, any>;

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("vi-VN");
}

function simplifyVoucherNote(value: unknown) {
  const note = String(value ?? "");
  if (!note) return "";
  if (/not checkout-guaranteed/i.test(note)) return "Estimated";
  return note;
}

export function ResultsTable({ platform, rows }: { platform: Platform; rows: Row[] }) {
  const columns =
    platform === "lazada"
      ? ["productName", "skuId", "variantName", "originalPrice", "currentPrice", "finalPrice", "couponDiscount", "url"]
      : ["productName", "shopId", "itemId", "variantName", "originalPrice", "currentPrice", "finalPrice", "discountText", "voucherNote", "url"];

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
    discountText: "Voucher",
    voucherNote: "Voucher Note",
    url: "URL"
  };

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface shadow-sm shadow-slate-900/5 dark:shadow-black/20">
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-surface2">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap border-b border-line px-3 py-2.5 text-xs font-black uppercase tracking-wide">
                  {labels[column]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted" colSpan={columns.length}>
                  No results yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-line hover:bg-surface2/60">
                  {columns.map((column) => {
                    const isPrice = ["originalPrice", "currentPrice", "finalPrice", "couponDiscount"].includes(column);
                    return (
                      <td key={column} className="max-w-xs truncate px-3 py-2" title={String(row[column] ?? "")}>
                        {isPrice ? money(row[column]) : column === "voucherNote" ? simplifyVoucherNote(row[column]) : row[column] ?? ""}
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
