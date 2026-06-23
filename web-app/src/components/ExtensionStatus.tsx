"use client";

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

export function ExtensionStatus({ status }: { status: ExtensionStatusPayload | null }) {
  const connected = Boolean(status?.connected);
  const latest = status?.latest;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <div className="font-semibold">Lazada cần Companion Extension để lấy giá chính xác.</div>
      <div className="mt-2 grid gap-1 text-xs sm:grid-cols-3">
        <div>
          <span className="text-amber-700">Extension:</span> {connected ? "connected" : "disconnected"}
        </div>
        <div>
          <span className="text-amber-700">Last heartbeat:</span> {formatTime(latest?.lastHeartbeat)}
        </div>
        <div className="truncate" title={latest?.currentLink || ""}>
          <span className="text-amber-700">Current link:</span> {latest?.currentLink || "-"}
        </div>
      </div>
    </div>
  );
}
