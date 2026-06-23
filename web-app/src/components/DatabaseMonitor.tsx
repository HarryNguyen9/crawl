"use client";

import { useEffect, useState } from "react";

type DbStatus = {
  sizeBytes: number;
  warningBytes: number;
  limitBytes: number;
  usagePercent: number;
  counts: { jobs: number; links: number; skus: number; logs: number; rawJsonRows: number };
  isWarning: boolean;
};

function mb(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function DatabaseMonitor({ onDataChanged }: { onDataChanged: () => void }) {
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/db-status");
    if (response.ok) setStatus(await response.json());
  }

  async function remove(path: string, body?: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: "DELETE",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Delete failed");
      await refresh();
      onDataChanged();
      if (path.endsWith("/logs")) {
        setMessage(`Deleted ${data.deleted ?? 0} log row(s)`);
      } else if (path.endsWith("/raw-json")) {
        setMessage(`Cleared rawJson on ${data.updated ?? 0} SKU row(s)`);
      } else if (path.endsWith("/all")) {
        setMessage(`Deleted jobs: ${data.jobs ?? 0}, links: ${data.links ?? 0}, SKUs: ${data.skus ?? 0}, logs: ${data.logs ?? 0}`);
      } else {
        setMessage("Delete completed");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="rounded-md border border-line bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-black">Database Monitor</h2>
        <button onClick={refresh} className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-surface2">
          Refresh
        </button>
      </div>

      {status?.isWarning ? <div className="mt-3 rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Database is near the configured warning size.</div> : null}
      {message ? <div className="mt-3 rounded-md bg-surface2 p-3 text-sm text-muted">{message}</div> : null}

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-semibold">
        <div>Used: {status ? mb(status.sizeBytes) : "-"}</div>
        <div>Limit: {status ? mb(status.limitBytes) : "-"}</div>
        <div>Usage: {status?.usagePercent ?? 0}%</div>
        <div>Warning: {status ? mb(status.warningBytes) : "-"}</div>
        <div>Jobs: {status?.counts.jobs ?? 0}</div>
        <div>Links: {status?.counts.links ?? 0}</div>
        <div>SKUs: {status?.counts.skus ?? 0}</div>
        <div>Logs: {status?.counts.logs ?? 0}</div>
        <div>Raw JSON rows: {status?.counts.rawJsonRows ?? 0}</div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => remove("/api/admin/data/logs")} className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface2">
          Delete logs
        </button>
        <button disabled={busy} onClick={() => remove("/api/admin/data/raw-json")} className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface2">
          Delete rawJson
        </button>
        <button disabled={busy} onClick={() => setConfirmOpen(true)} className="rounded-md bg-red-600 px-3 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-red-700">
          Delete all data
        </button>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-md bg-surface p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Confirm data deletion</h3>
            <p className="mt-2 text-sm text-muted">Type DELETE to remove crawl rows only. Tables and migrations are kept.</p>
            <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className="mt-4 w-full rounded-md border border-line bg-surface p-2" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} className="rounded-md border border-line px-3 py-2 text-sm hover:bg-surface2">
                Cancel
              </button>
              <button
                disabled={busy || confirmText.length === 0}
                onClick={async () => {
                  await remove("/api/admin/data/all", { confirmText });
                  setConfirmOpen(false);
                  setConfirmText("");
                }}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
