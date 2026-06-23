"use client";

import type { Platform } from "@prisma/client";

type ExtensionStatusPayload = {
  connected: boolean;
  latest: {
    clientId: string;
    connectedAt: string;
    lastHeartbeat: string;
    currentLink?: string | null;
  } | null;
};

function formatTime(value?: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleTimeString("vi-VN");
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function ExtensionStatus({ platform, status }: { platform: Platform; status: ExtensionStatusPayload | null }) {
  const connected = Boolean(status?.connected);
  const latest = status?.latest;
  const label = platform === "lazada" ? "Lazada" : "Shopee";

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 shadow-sm shadow-amber-900/10 dark:border-amber-600 dark:bg-amber-900/35 dark:text-amber-50">
      <div className="font-medium">{label} cần Companion Extension để lấy giá chính xác.</div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div>
          <span className="text-amber-700 dark:text-amber-300">Extension:</span> {titleCase(connected ? "connected" : "disconnected")}
        </div>
        <div>
          <span className="text-amber-700 dark:text-amber-300">Last heartbeat:</span> {formatTime(latest?.lastHeartbeat)}
        </div>
        <div className="truncate" title={latest?.currentLink || ""}>
          <span className="text-amber-700 dark:text-amber-300">Current link:</span> {latest?.currentLink || "-"}
        </div>
      </div>
    </div>
  );
}
