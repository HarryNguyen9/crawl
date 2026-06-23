"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type RangeKey = "30d" | "quarter" | "1y" | "all";

type ChartPoint = {
  date: string;
  timestamp: number;
  price?: number;
};

type SkuPriceRow = {
  skuId: string;
  points: ChartPoint[];
};

const AVERAGE_SKU = "__average__";

const skuHeaderCandidates = ["sku id", "skuid", "sku", "id sản phẩm", "id san pham", "product id", "item id"];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parsePrice(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const digits = text.replace(/[^0-9.,-]/g, "");
  if (!digits) return 0;

  // Vietnamese format: 1.016.660 or 1,016,660
  if (/^\d{1,3}(\.\d{3})+$/.test(digits)) return Number(digits.replace(/\./g, ""));
  if (/^\d{1,3}(,\d{3})+$/.test(digits)) return Number(digits.replace(/,/g, ""));

  return Number(digits.replace(/,/g, "")) || 0;
}

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return numeric ? numeric.toLocaleString("vi-VN") : "0";
}

function percent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function average(values: number[]) {
  if (values.length === 0) return undefined;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function readSheetMatrix(workbook: XLSX.WorkBook) {
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: "",
    raw: false
  });

  return rows.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
}

function findSkuColumn(headers: unknown[]) {
  const normalizedCandidates = skuHeaderCandidates.map(normalizeHeader);
  const exactIndex = headers.findIndex((header) => normalizedCandidates.includes(normalizeHeader(header)));
  if (exactIndex >= 0) return exactIndex;

  // Fallback: nếu không có header SKU ID thì lấy cột đầu tiên như file mẫu.
  return 0;
}

function parsePriceFormatRows(matrix: unknown[][]) {
  if (matrix.length < 2) throw new Error("File has no usable rows.");

  const headers = matrix[0].map((header) => String(header ?? "").trim());
  const skuColumnIndex = findSkuColumn(headers);
  const dayColumns = headers
    .map((label, index) => ({ label: label || `Ngày ${index}`, index }))
    .filter((column) => column.index !== skuColumnIndex && column.label.trim() !== "");

  if (dayColumns.length === 0) throw new Error("No day/price columns found. Expected: SKU ID, Ngày 1, Ngày 2, ...");

  const skuRows: SkuPriceRow[] = matrix
    .slice(1)
    .map((row) => {
      const skuId = String(row[skuColumnIndex] ?? "").trim();
      const points = dayColumns
        .map((column, dayIndex) => {
          const price = parsePrice(row[column.index]);
          return price
            ? {
                date: column.label,
                timestamp: dayIndex,
                price
              }
            : null;
        })
        .filter(Boolean) as ChartPoint[];

      return { skuId, points };
    })
    .filter((row) => row.skuId && row.points.length > 0);

  if (skuRows.length === 0) throw new Error("No usable SKU price rows found.");

  return { skuRows, dayCount: dayColumns.length };
}

function buildAverageSeries(skuRows: SkuPriceRow[]) {
  const buckets = new Map<string, { date: string; timestamp: number; values: number[] }>();

  for (const skuRow of skuRows) {
    for (const point of skuRow.points) {
      if (!point.price) continue;
      const bucket = buckets.get(point.date) ?? {
        date: point.date,
        timestamp: point.timestamp,
        values: []
      };
      bucket.values.push(point.price);
      buckets.set(point.date, bucket);
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      date: bucket.date,
      timestamp: bucket.timestamp,
      price: average(bucket.values)
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function filterByRange(points: ChartPoint[], range: RangeKey) {
  if (range === "all" || points.length === 0) return points;
  const count = range === "30d" ? 30 : range === "quarter" ? 92 : 365;
  return points.slice(Math.max(points.length - count, 0));
}

export function PriceChartImporter() {
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [skuRows, setSkuRows] = useState<SkuPriceRow[]>([]);
  const [selectedSku, setSelectedSku] = useState(AVERAGE_SKU);
  const [range, setRange] = useState<RangeKey>("30d");
  const [dayCount, setDayCount] = useState(0);

  const allAveragePoints = useMemo(() => buildAverageSeries(skuRows), [skuRows]);

  const selectedPoints = useMemo(() => {
    if (selectedSku === AVERAGE_SKU) return allAveragePoints;
    return skuRows.find((row) => row.skuId === selectedSku)?.points ?? [];
  }, [allAveragePoints, selectedSku, skuRows]);

  const filteredPoints = useMemo(() => filterByRange(selectedPoints, range), [selectedPoints, range]);

  const stats = useMemo(() => {
    const values = filteredPoints.map((point) => Number(point.price ?? 0)).filter(Boolean);
    const latest = values.length ? values[values.length - 1] : 0;
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    const avg = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    return {
      min,
      max,
      avg,
      latest,
      changeFromMin: min ? ((latest - min) / min) * 100 : 0,
      changeFromMax: max ? ((latest - max) / max) * 100 : 0
    };
  }, [filteredPoints]);

  async function importFile(file: File) {
    setError(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const matrix = readSheetMatrix(workbook);
      const parsed = parsePriceFormatRows(matrix);

      setSkuRows(parsed.skuRows);
      setDayCount(parsed.dayCount);
      setSelectedSku(parsed.skuRows.length === 1 ? parsed.skuRows[0].skuId : AVERAGE_SKU);
    } catch (err) {
      setSkuRows([]);
      setDayCount(0);
      setSelectedSku(AVERAGE_SKU);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const lineName = selectedSku === AVERAGE_SKU ? "Average Price" : `Price - ${selectedSku}`;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-line bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-medium">Price Chart</h2>
            <p className="mt-1 text-sm text-muted">Import price format file: SKU ID + Ngày 1, Ngày 2, ... with one price per cell.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-300">
            Import Price File
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        {fileName ? (
          <div className="mt-3 text-sm text-muted">
            Loaded: {fileName} · {skuRows.length} SKU · {dayCount} ngày
          </div>
        ) : null}
        {error ? <div className="mt-3 rounded-md bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Lowest" value={money(stats.min)} />
        <StatCard label="Highest" value={money(stats.max)} />
        <StatCard label="Average" value={money(stats.avg)} />
        <StatCard label="Latest" value={money(stats.latest)} />
        <StatCard label="From Low" value={percent(stats.changeFromMin)} />
        <StatCard label="From High" value={percent(stats.changeFromMax)} />
      </div>

      <div className="rounded-md border border-line bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              ["30d", "30 ngày"],
              ["quarter", "1 quý"],
              ["1y", "1 năm"],
              ["all", "All"]
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRange(key as RangeKey)}
                className={`rounded-md border border-line px-3 py-1.5 text-sm font-medium ${range === key ? "bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950" : "bg-surface hover:bg-surface2"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">SKU</span>
            <select
              value={selectedSku}
              onChange={(event) => setSelectedSku(event.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none hover:bg-surface2"
            >
              {skuRows.length > 1 ? <option value={AVERAGE_SKU}>Tất cả SKU - giá trung bình</option> : null}
              {skuRows.map((row) => (
                <option key={row.skuId} value={row.skuId}>
                  {row.skuId}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 h-[460px]">
          {filteredPoints.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-line text-sm text-muted">
              Import a price format CSV or Excel file to show the chart.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredPoints} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" />
                <XAxis dataKey="date" stroke="rgb(var(--color-muted))" tick={{ fontSize: 12 }} />
                <YAxis stroke="rgb(var(--color-muted))" tickFormatter={money} width={88} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => money(value)} contentStyle={{ borderRadius: 6 }} />
                <Legend />
                <Line type="monotone" dataKey="price" name={lineName} stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3 shadow-sm shadow-slate-900/5 dark:shadow-black/20">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-2 text-xl font-medium">{value}</div>
    </div>
  );
}
