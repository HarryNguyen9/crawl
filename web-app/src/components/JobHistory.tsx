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
    <div className="rounded-md border border-line bg-white">
      <div className="border-b border-line px-3 py-2 text-sm font-semibold">Recent jobs</div>
      <div className="max-h-72 overflow-auto">
        {jobs.length === 0 ? (
          <div className="px-3 py-6 text-sm text-slate-500">No jobs yet.</div>
        ) : (
          jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => onSelect(job.id)}
              className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                activeJobId === job.id ? "bg-slate-100" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{job.status}</span>
                <span className="text-xs text-slate-500">{job.processedLinks}/{job.totalLinks}</span>
              </div>
              <div className="mt-1 truncate text-xs text-slate-500">{job.id}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
