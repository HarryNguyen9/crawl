"use client";

import type { Platform } from "@prisma/client";

export function PlatformTabs({ platform, onChange }: { platform: Platform; onChange: (platform: Platform) => void }) {
  return (
    <div className="flex w-full gap-2 border-b border-line bg-surface2/60">
      {(["lazada", "shopee"] as Platform[]).map((item) => (
        <button
          key={item}
          onClick={() => onChange(item)}
          className={`px-4 py-3 text-sm font-extrabold capitalize ${
            platform === item ? "border-b-2 border-ink bg-surface text-ink" : "text-muted hover:bg-surface/70 hover:text-ink"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
