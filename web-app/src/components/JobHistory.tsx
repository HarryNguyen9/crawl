"use client";

type Job = {
  id: string;
  platform: string;
  status: string;
  totalLinks: number;
  processedLinks: number;
  createdAt: string;
  _count?: { skus: number };
};

export function JobHistory({ jobs, activeJobId, onSelect }: { jobs: Job[]; activeJobId?: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="rounded-md border border-line bg-surface shadow-sm shadow-slate-900/5 dark:shadow-black/20">
      <div className="border-b border-line bg-surface2 px-3 py-2.5 text-sm font-black">Recent jobs</div>
      <div className="max-h-72 overflow-auto">
        {jobs.length === 0 ? (
          <div className="px-3 py-6 text-sm font-semibold text-muted">No jobs yet.</div>
        ) : (
          jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => onSelect(job.id)}
              className={`block w-full border-b border-line px-3 py-2 text-left text-sm hover:bg-surface2 ${
                activeJobId === job.id ? "bg-surface2" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold">{job.status}</span>
                <span className="text-xs text-muted">{job.processedLinks}/{job.totalLinks}</span>
              </div>
              <div className="mt-1 truncate text-xs text-muted">{job.id}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
