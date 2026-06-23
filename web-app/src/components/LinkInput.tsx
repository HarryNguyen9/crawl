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
        className="h-40 w-full resize-y rounded-md border border-line bg-surface p-3 text-sm font-normal outline-none shadow-inner shadow-slate-900/5 placeholder:text-muted focus:border-ink focus:ring-2 focus:ring-ink/10"
      />
      <button
        onClick={onStart}
        disabled={disabled}
        className="rounded-md bg-slate-950 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-300"
      >
        Start Crawl
      </button>
    </div>
  );
}
