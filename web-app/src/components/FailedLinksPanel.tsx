"use client";

type FailedLink = {
  id: string;
  url: string;
  error?: string | null;
  retryCount?: number;
};

export function FailedLinksPanel({ links }: { links: FailedLink[] }) {
  if (links.length === 0) return null;

  async function copyLinks() {
    await navigator.clipboard.writeText(links.map((link) => link.url).join("\n"));
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950 shadow-sm dark:border-red-800 dark:bg-red-950/35 dark:text-red-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">Failed links ({links.length})</div>
        <button onClick={copyLinks} className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100 dark:border-red-700 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900">
          Copy links
        </button>
      </div>
      <div className="mt-3 max-h-48 overflow-auto rounded-md border border-red-200 bg-white dark:border-red-800 dark:bg-red-950/30">
        {links.map((link) => (
          <div key={link.id} className="border-b border-red-100 p-2 last:border-b-0 dark:border-red-900">
            <div className="truncate font-medium" title={link.url}>
              {link.url}
            </div>
            <div className="mt-1 text-xs text-red-700 dark:text-red-200">{link.error || "Unknown error"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
