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
type SeriesKey = "originalPrice" | "currentPrice" | "finalPrice";

type ImportedRow = {
  date: Date;
  originalPrice: number;
  currentPrice: number;
  finalPrice: number;
};

type ChartPoint = {
  date: string;
  timestamp: number;
  originalPrice?: number;
  currentPrice?: number;
  finalPrice?: number;
};

const seriesConfig: Record<SeriesKey, { label: string; color: string }> = {
  originalPrice: { label: "Original Price", color: "#2563eb" },
  currentPrice: { label: "Current Price", color: "#d97706" },
  finalPrice: { label: "Final Price", color: "#059669" }
};

const dateHeaders = ["date", "created at", "createdat", "ngày", "ngay", "thời gian", "thoi gian", "timestamp"];
const priceHeaders: Record<SeriesKey, string[]> = {
  originalPrice: ["original price", "giá gốc", "gia goc", "original", "giagoc"],
  currentPrice: ["current price", "giá hiện tại", "gia hien tai", "seller price", "sellerprice", "current"],
  finalPrice: ["final price", "giá sau khuyến mãi", "gia sau khuyen mai", "giá cuối", "gia cuoi", "final"]
};

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
  const digits = text.replace(/[^0-9.-]/g, "");
  if (!digits) return 0;
  if (/^\d{1,3}(\.\d{3})+$/.test(digits)) return Number(digits.replace(/\./g, ""));
  return Number(digits.replace(/,/g, "")) || 0;
}

function parseDate(value: unknown, fallback: Date) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
  }
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return numeric ? numeric.toLocaleString("vi-VN") : "0";
}

function percent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function findHeader(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  return headers.find((header) => normalizedCandidates.includes(normalizeHeader(header)));
}

function readRowsFromWorkbook(workbook: XLSX.WorkBook) {
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
}

function aggregateRows(rows: ImportedRow[]) {
  const buckets = new Map<string, { timestamp: number; original: number[]; current: number[]; final: number[] }>();

  for (const row of rows) {
    const key = formatDateKey(row.date);
    const bucket = buckets.get(key) ?? {
      timestamp: row.date.getTime(),
      original: [],
      current: [],
      final: []
    };
    if (row.originalPrice) bucket.original.push(row.originalPrice);
    if (row.currentPrice) bucket.current.push(row.currentPrice);
    if (row.finalPrice) bucket.final.push(row.finalPrice);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([date, bucket]) => ({
      date,
      timestamp: bucket.timestamp,
      originalPrice: average(bucket.original),
      currentPrice: average(bucket.current),
      finalPrice: average(bucket.final)
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function average(values: number[]) {
  if (values.length === 0) return undefined;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function filterByRange(points: ChartPoint[], range: RangeKey) {
  if (range === "all" || points.length === 0) return points;
  const latest = Math.max(...points.map((point) => point.timestamp));
  const days = range === "30d" ? 30 : range === "quarter" ? 92 : 365;
  const threshold = latest - days * 24 * 60 * 60 * 1000;
  return points.filter((point) => point.timestamp >= threshold);
}

export function PriceChartImporter() {
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [range, setRange] = useState<RangeKey>("30d");
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    originalPrice: true,
    currentPrice: true,
    finalPrice: true
  });

  const filteredPoints = useMemo(() => filterByRange(points, range), [points, range]);
  const selectedKeys = useMemo(() => (Object.keys(visibleSeries) as SeriesKey[]).filter((key) => visibleSeries[key]), [visibleSeries]);

  const stats = useMemo(() => {
    const values = filteredPoints.flatMap((point) => selectedKeys.map((key) => Number(point[key] ?? 0)).filter(Boolean));
    const latestPoint = filteredPoints[filteredPoints.length - 1];
    const preferredLatestKey = (["finalPrice", "currentPrice", "originalPrice"] as SeriesKey[]).find((key) => visibleSeries[key] && latestPoint?.[key]);
    const latest = preferredLatestKey && latestPoint ? Number(latestPoint[preferredLatestKey] ?? 0) : 0;
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
  }, [filteredPoints, selectedKeys, visibleSeries]);

  async function importFile(file: File) {
    setError(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const rawRows = readRowsFromWorkbook(workbook);
      if (rawRows.length === 0) throw new Error("File has no rows.");

      const headers = Object.keys(rawRows[0]);
      const dateHeader = findHeader(headers, dateHeaders);
      const originalHeader = findHeader(headers, priceHeaders.originalPrice);
      const currentHeader = findHeader(headers, priceHeaders.currentPrice);
      const finalHeader = findHeader(headers, priceHeaders.finalPrice);
      if (!originalHeader && !currentHeader && !finalHeader) throw new Error("No supported price columns found.");

      const fallbackDate = new Date();
      const parsedRows = rawRows
        .map((row, index) => ({
          date: parseDate(dateHeader ? row[dateHeader] : undefined, dateHeader ? fallbackDate : new Date(fallbackDate.getTime() + index)),
          originalPrice: parsePrice(originalHeader ? row[originalHeader] : 0),
          currentPrice: parsePrice(currentHeader ? row[currentHeader] : 0),
          finalPrice: parsePrice(finalHeader ? row[finalHeader] : 0)
        }))
        .filter((row) => row.originalPrice || row.currentPrice || row.finalPrice);

      if (parsedRows.length === 0) throw new Error("No usable price rows found.");
      setPoints(aggregateRows(parsedRows));
    } catch (err) {
      setPoints([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-line bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-medium">Price Chart</h2>
            <p className="mt-1 text-sm text-muted">Import CSV or Excel files to compare price history.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-300">
            Import File
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
        {fileName ? <div className="mt-3 text-sm text-muted">Loaded: {fileName}</div> : null}
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
          <div className="flex flex-wrap gap-3">
            {(Object.keys(seriesConfig) as SeriesKey[]).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={visibleSeries[key]}
                  onChange={(event) => setVisibleSeries((current) => ({ ...current, [key]: event.target.checked }))}
                />
                <span>{seriesConfig[key].label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 h-[460px]">
          {filteredPoints.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-line text-sm text-muted">Import a CSV or Excel file to show the chart.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredPoints} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" />
                <XAxis dataKey="date" stroke="rgb(var(--color-muted))" tick={{ fontSize: 12 }} />
                <YAxis stroke="rgb(var(--color-muted))" tickFormatter={money} width={88} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => money(value)} contentStyle={{ borderRadius: 6 }} />
                <Legend />
                {(Object.keys(seriesConfig) as SeriesKey[]).map((key) =>
                  visibleSeries[key] ? (
                    <Line key={key} type="monotone" dataKey={key} name={seriesConfig[key].label} stroke={seriesConfig[key].color} strokeWidth={2} dot={false} connectNulls />
                  ) : null
                )}
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
