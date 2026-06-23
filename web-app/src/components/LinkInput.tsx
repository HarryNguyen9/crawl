"use client";

export function LinkInput({
  value,
  disabled,
  onChange,
  onStart
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onStart: () => void;
}) {
  return (
    <div className="space-y-3">
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste product links, one per line"
        className="h-40 w-full resize-y rounded-md border border-line bg-white p-3 text-sm outline-none focus:border-ink"
      />
      <button
        onClick={onStart}
        disabled={disabled}
        className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
      >
        Start Crawl
      </button>
    </div>
  );
}
