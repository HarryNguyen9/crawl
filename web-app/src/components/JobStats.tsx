"use client";

type JobLike = {
  totalLinks?: number;
  processedLinks?: number;
  status?: string;
  skuCount?: number;
};

function titleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function JobStats({ job }: { job?: JobLike | null }) {
  const items = [
    ["Total Links", job?.totalLinks ?? 0],
    ["Processed", job?.processedLinks ?? 0],
    ["SKU Count", job?.skuCount ?? 0],
    ["Status", titleCase(job?.status ?? "idle")]
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-line bg-surface p-3 shadow-sm shadow-slate-900/5 dark:shadow-black/20">
          <div className="text-xs font-medium tracking-wide text-muted">{label}</div>
          <div className="mt-2 text-2xl font-medium leading-none">{value}</div>
        </div>
      ))}
    </div>
  );
}
