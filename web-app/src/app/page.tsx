"use client";

import { useEffect, useMemo, useState } from "react";
import type { Platform } from "@prisma/client";
import { DatabaseMonitor } from "@/components/DatabaseMonitor";
import { ExtensionStatus } from "@/components/ExtensionStatus";
import { JobHistory } from "@/components/JobHistory";
import { JobStats } from "@/components/JobStats";
import { LinkInput } from "@/components/LinkInput";
import { PlatformTabs } from "@/components/PlatformTabs";
import { ResultsTable } from "@/components/ResultsTable";

type Job = {
  id: string;
  platform: Platform;
  status: string;
  totalLinks: number;
  processedLinks: number;
  createdAt: string;
  skuCount?: number;
  _count?: { skus: number };
};

type ExtensionStatusPayload = {
  connected: boolean;
  latest: {
    clientId: string;
    connectedAt: string;
    lastHeartbeat: string;
    currentLink?: string | null;
  } | null;
};

const runningStatuses = new Set(["pending", "running"]);
const emptyPlatformText: Record<Platform, string> = { lazada: "", shopee: "" };
const emptyPlatformJobId: Record<Platform, string | null> = { lazada: null, shopee: null };
const emptyPlatformJob: Record<Platform, Job | null> = { lazada: null, shopee: null };
const emptyPlatformResults: Record<Platform, Record<string, any>[]> = { lazada: [], shopee: [] };

export default function Home() {
  const [platform, setPlatform] = useState<Platform>("lazada");
  const [linksTextByPlatform, setLinksTextByPlatform] = useState<Record<Platform, string>>(emptyPlatformText);
  const [activeJobIdByPlatform, setActiveJobIdByPlatform] = useState<Record<Platform, string | null>>(emptyPlatformJobId);
  const [activeJobByPlatform, setActiveJobByPlatform] = useState<Record<Platform, Job | null>>(emptyPlatformJob);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resultsByPlatform, setResultsByPlatform] = useState<Record<Platform, Record<string, any>[]>>(emptyPlatformResults);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const linksText = linksTextByPlatform[platform];
  const activeJobId = activeJobIdByPlatform[platform];
  const activeJob = activeJobByPlatform[platform];
  const results = resultsByPlatform[platform];
  const isRunning = useMemo(() => (activeJob ? runningStatuses.has(activeJob.status) : false), [activeJob]);

  function setCurrentLinksText(value: string) {
    setLinksTextByPlatform((current) => ({ ...current, [platform]: value }));
  }

  function setPlatformActiveJobId(nextPlatform: Platform, jobId: string | null) {
    setActiveJobIdByPlatform((current) => ({ ...current, [nextPlatform]: jobId }));
  }

  function setPlatformActiveJob(nextPlatform: Platform, job: Job | null) {
    setActiveJobByPlatform((current) => ({ ...current, [nextPlatform]: job }));
  }

  function setPlatformResults(nextPlatform: Platform, rows: Record<string, any>[]) {
    setResultsByPlatform((current) => ({ ...current, [nextPlatform]: rows }));
  }

  async function loadJobs(nextPlatform = platform) {
    const response = await fetch(`/api/jobs?platform=${nextPlatform}`);
    if (response.ok) {
      const data = await response.json();
      setJobs(data.jobs);
    }
  }

  async function loadJob(jobId: string, nextPlatform = platform) {
    const response = await fetch(`/api/jobs/${jobId}`);
    if (response.ok) {
      const data = await response.json();
      setPlatformActiveJob(nextPlatform, data.job);
    }
  }

  async function loadResults(jobId: string, nextPlatform = platform) {
    const response = await fetch(`/api/jobs/${jobId}/results?pageSize=500`);
    if (response.ok) {
      const data = await response.json();
      setPlatformResults(nextPlatform, data.results);
    }
  }

  async function loadExtensionStatus() {
    const response = await fetch("/api/extension/status");
    if (response.ok) {
      setExtensionStatus(await response.json());
    }
  }

  async function refreshAll() {
    await loadJobs();
    if (platform === "lazada") {
      await loadExtensionStatus();
    }
    if (activeJobId) {
      await Promise.all([loadJob(activeJobId, platform), loadResults(activeJobId, platform)]);
    }
  }

  async function startCrawl() {
    setError(null);
    const links = linksText
      .split(/\r?\n/)
      .map((link) => link.trim())
      .filter(Boolean);

    if (links.length === 0) {
      setError("Paste at least one product link.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, links })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create job");
      setPlatformActiveJobId(platform, data.jobId);
      setPlatformResults(platform, []);
      await loadJobs();
      await loadJob(data.jobId, platform);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelJob() {
    if (!activeJobId) return;
    await fetch(`/api/jobs/${activeJobId}/cancel`, { method: "POST" });
    await refreshAll();
  }

  async function retryFailed() {
    if (!activeJobId) return;
    await fetch(`/api/jobs/${activeJobId}/retry-failed`, { method: "POST" });
    await refreshAll();
  }

  function exportExcel() {
    if (!activeJobId) return;
    window.location.href = `/api/jobs/${activeJobId}/export`;
  }

  useEffect(() => {
    setError(null);
    void loadJobs(platform);
    if (platform === "lazada") void loadExtensionStatus();
  }, [platform]);

  useEffect(() => {
    if (!activeJobId) {
      if (platform === "lazada") {
        const timer = window.setInterval(() => void loadExtensionStatus(), 3000);
        return () => window.clearInterval(timer);
      }
      return;
    }
    void Promise.all([loadJob(activeJobId, platform), loadResults(activeJobId, platform), platform === "lazada" ? loadExtensionStatus() : Promise.resolve()]);
    const timer = window.setInterval(() => {
      void Promise.all([loadJob(activeJobId, platform), loadResults(activeJobId, platform), loadJobs(), platform === "lazada" ? loadExtensionStatus() : Promise.resolve()]);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeJobId, platform]);

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Marketplace SKU Crawler</h1>
            <p className="text-sm text-slate-600">Lightweight server-side fetch crawler for Lazada and Shopee.</p>
          </div>
          <div className="text-sm text-slate-500">Neon PostgreSQL + Prisma</div>
        </header>

        <div className="rounded-md border border-line bg-white">
          <PlatformTabs platform={platform} onChange={setPlatform} />
          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="space-y-4">
              {platform === "lazada" ? <ExtensionStatus status={extensionStatus} /> : null}
              <LinkInput value={linksText} disabled={busy} onChange={setCurrentLinksText} onStart={startCrawl} />
              {error ? <div className="rounded-md bg-red-100 p-3 text-sm text-red-800">{error}</div> : null}
              <JobStats job={activeJob} />
              <div className="flex flex-wrap gap-2">
                <button disabled={!activeJobId || !results.length} onClick={exportExcel} className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
                  Export Excel
                </button>
                <button disabled={!activeJobId || !isRunning} onClick={cancelJob} className="rounded-md border border-line px-3 py-2 text-sm hover:bg-slate-50">
                  Cancel job
                </button>
                <button disabled={!activeJobId || isRunning} onClick={retryFailed} className="rounded-md border border-line px-3 py-2 text-sm hover:bg-slate-50">
                  Retry failed
                </button>
              </div>
              <ResultsTable platform={platform} rows={results} />
            </section>
            <aside className="space-y-4">
              <JobHistory
                jobs={jobs}
                activeJobId={activeJobId}
                onSelect={(id) => {
                  setPlatformActiveJobId(platform, id);
                  setPlatformResults(platform, []);
                }}
              />
              <DatabaseMonitor onDataChanged={refreshAll} />
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
