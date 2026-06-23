"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Platform } from "@prisma/client";
import { DatabaseMonitor } from "@/components/DatabaseMonitor";
import { ExtensionStatus } from "@/components/ExtensionStatus";
import { FailedLinksPanel } from "@/components/FailedLinksPanel";
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
  maxTabs?: number;
  processedLinks: number;
  failedCount?: number;
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

type FailedLink = {
  id: string;
  url: string;
  error?: string | null;
  retryCount?: number;
};

const runningStatuses = new Set(["pending", "running"]);
const emptyPlatformText: Record<Platform, string> = { lazada: "", shopee: "" };
const emptyPlatformJobId: Record<Platform, string | null> = { lazada: null, shopee: null };
const emptyPlatformJob: Record<Platform, Job | null> = { lazada: null, shopee: null };
const emptyPlatformResults: Record<Platform, Record<string, any>[]> = { lazada: [], shopee: [] };
const emptyPlatformFailedLinks: Record<Platform, FailedLink[]> = { lazada: [], shopee: [] };
const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
const PriceChartImporter = dynamic(() => import("@/components/PriceChartImporter").then((module) => module.PriceChartImporter), {
  ssr: false,
  loading: () => <div className="rounded-md border border-line bg-surface p-4 text-sm text-muted">Loading chart tools...</div>
});

function titleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default function Home() {
  const [view, setView] = useState<"crawler" | "chart">("crawler");
  const [platform, setPlatform] = useState<Platform>("lazada");
  const [linksTextByPlatform, setLinksTextByPlatform] = useState<Record<Platform, string>>(emptyPlatformText);
  const [activeJobIdByPlatform, setActiveJobIdByPlatform] = useState<Record<Platform, string | null>>(emptyPlatformJobId);
  const [activeJobByPlatform, setActiveJobByPlatform] = useState<Record<Platform, Job | null>>(emptyPlatformJob);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resultsByPlatform, setResultsByPlatform] = useState<Record<Platform, Record<string, any>[]>>(emptyPlatformResults);
  const [failedLinksByPlatform, setFailedLinksByPlatform] = useState<Record<Platform, FailedLink[]>>(emptyPlatformFailedLinks);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [completionDialog, setCompletionDialog] = useState<{ jobId: string; status: string; totalLinks: number; processedLinks: number; failedCount?: number } | null>(null);
  const lastStatusByJob = useRef<Record<string, string>>({});

  const linksText = linksTextByPlatform[platform];
  const activeJobId = activeJobIdByPlatform[platform];
  const activeJob = activeJobByPlatform[platform];
  const results = resultsByPlatform[platform];
  const failedLinks = failedLinksByPlatform[platform];
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

  function setPlatformFailedLinks(nextPlatform: Platform, links: FailedLink[]) {
    setFailedLinksByPlatform((current) => ({ ...current, [nextPlatform]: links }));
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

  async function loadFailedLinks(jobId: string, nextPlatform = platform) {
    const response = await fetch(`/api/jobs/${jobId}/failed-links`);
    if (response.ok) {
      const data = await response.json();
      setPlatformFailedLinks(nextPlatform, data.links);
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
    await loadExtensionStatus();
    if (activeJobId) {
      await Promise.all([loadJob(activeJobId, platform), loadResults(activeJobId, platform), loadFailedLinks(activeJobId, platform)]);
    }
  }

  function parsedLinks() {
    return linksText
      .split(/\r?\n/)
      .map((link) => link.trim())
      .filter(Boolean);
  }

  function openStartDialog() {
    setError(null);
    if (parsedLinks().length === 0) {
      setError("Paste at least one product link.");
      return;
    }
    setStartDialogOpen(true);
  }

  async function startCrawl(maxTabs: number) {
    setError(null);
    const links = parsedLinks();
    setBusy(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, links, maxTabs })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create job");
      setStartDialogOpen(false);
      setPlatformActiveJobId(platform, data.jobId);
      setPlatformResults(platform, []);
      setPlatformFailedLinks(platform, []);
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
    setPlatformFailedLinks(platform, []);
    await refreshAll();
  }

  function exportExcel() {
    if (!activeJobId) return;
    window.location.href = `/api/jobs/${activeJobId}/export`;
  }

  useEffect(() => {
    setError(null);
    void loadJobs(platform);
    void loadExtensionStatus();
  }, [platform]);

  useEffect(() => {
    if (!activeJobId) {
      const timer = window.setInterval(() => void loadExtensionStatus(), 3000);
      return () => window.clearInterval(timer);
    }
    void Promise.all([loadJob(activeJobId, platform), loadResults(activeJobId, platform), loadFailedLinks(activeJobId, platform), loadExtensionStatus()]);
    const timer = window.setInterval(() => {
      void Promise.all([loadJob(activeJobId, platform), loadResults(activeJobId, platform), loadFailedLinks(activeJobId, platform), loadJobs(), loadExtensionStatus()]);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeJobId, platform]);

  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDarkMode(saved ? saved === "dark" : prefersDark);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    window.localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (!activeJob) return;
    const previousStatus = lastStatusByJob.current[activeJob.id];
    lastStatusByJob.current[activeJob.id] = activeJob.status;
    if (previousStatus && runningStatuses.has(previousStatus) && terminalStatuses.has(activeJob.status)) {
      setCompletionDialog({
        jobId: activeJob.id,
        status: activeJob.status,
        totalLinks: activeJob.totalLinks,
        processedLinks: activeJob.processedLinks,
        failedCount: activeJob.failedCount
      });
    }
  }, [activeJob]);

  return (
    <main className="min-h-screen p-3 lg:p-5">
      <div className="w-full space-y-5">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Marketplace SKU Crawler</h1>
            <p className="mt-1 text-sm font-normal text-muted">Lightweight server-side fetch crawler for Lazada and Shopee.</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>Neon PostgreSQL + Prisma</span>
            <button onClick={() => setDarkMode((value) => !value)} className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface2">
              {darkMode ? "Light" : "Dark"}
            </button>
          </div>
        </header>

        <div className="flex w-fit overflow-hidden rounded-md border border-line bg-surface shadow-sm shadow-slate-900/5 dark:shadow-black/20">
          {[
            ["crawler", "Crawler"],
            ["chart", "Price Chart"]
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key as "crawler" | "chart")}
              className={`px-4 py-2 text-sm font-medium ${view === key ? "bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950" : "text-muted hover:bg-surface2 hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "crawler" ? (
          <div className="rounded-md border border-line bg-surface shadow-md shadow-slate-900/5 dark:shadow-black/20">
            <PlatformTabs platform={platform} onChange={setPlatform} />
            <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
              <section className="space-y-4">
                <ExtensionStatus platform={platform} status={extensionStatus} />
              <LinkInput value={linksText} disabled={busy} onChange={setCurrentLinksText} onStart={openStartDialog} />
                {error ? <div className="rounded-md bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
                <JobStats job={activeJob} />
                <div className="flex flex-wrap gap-2">
                  <button disabled={!activeJobId || !results.length} onClick={exportExcel} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-600">
                    Export Excel
                  </button>
                  <button disabled={!activeJobId || !isRunning} onClick={cancelJob} className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-surface2">
                    Cancel job
                  </button>
                  <button disabled={!activeJobId || isRunning} onClick={retryFailed} className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-surface2">
                    Retry failed
                  </button>
                </div>
                <FailedLinksPanel links={failedLinks} />
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
        ) : (
          <PriceChartImporter />
        )}
      </div>
      {completionDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-md border border-line bg-surface p-5 shadow-xl shadow-slate-950/20">
            <div className="text-lg font-medium">Job {titleCase(completionDialog.status)}</div>
            <p className="mt-2 text-sm text-muted">
              Processed {completionDialog.processedLinks}/{completionDialog.totalLinks} link(s)
              {completionDialog.failedCount ? `, failed ${completionDialog.failedCount}` : ""}.
            </p>
            <button onClick={() => setCompletionDialog(null)} className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-300">
              OK
            </button>
          </div>
        </div>
      ) : null}
      {startDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-md border border-line bg-surface p-5 shadow-xl shadow-slate-950/20">
            <div className="text-lg font-medium">Choose Parallel Tabs</div>
            <p className="mt-2 text-sm text-muted">
              More tabs can crawl faster, but 10-20 tabs may be heavier and can trigger marketplace checks more often.
            </p>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {[1, 3, 5, 10, 20].map((count) => (
                <button
                  key={count}
                  disabled={busy}
                  onClick={() => void startCrawl(count)}
                  className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-surface2"
                >
                  {count}
                </button>
              ))}
            </div>
            <button onClick={() => setStartDialogOpen(false)} className="mt-4 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-surface2">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
