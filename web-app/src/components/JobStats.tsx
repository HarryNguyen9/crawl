"use client";

type JobLike = {
  totalLinks?: number;
  processedLinks?: number;
  status?: string;
  skuCount?: number;
};

export function JobStats({ job }: { job?: JobLike | null }) {
  const items = [
    ["Total links", job?.totalLinks ?? 0],
    ["Processed", job?.processedLinks ?? 0],
    ["SKU count", job?.skuCount ?? 0],
    ["Status", job?.status ?? "idle"]
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-line bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-lg font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}
