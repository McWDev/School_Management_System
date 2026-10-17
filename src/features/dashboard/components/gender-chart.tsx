"use client";

import { useState } from "react";

/**
 * Gender split as one proportion bar: two validated categorical hues, a 2px
 * surface gap between segments, a legend with counts (identity is never
 * color-alone), hover tooltips and a table view.
 */
export function GenderChart({ male, female }: { male: number; female: number }) {
  const [active, setActive] = useState<"male" | "female" | null>(null);
  const total = male + female;
  const segments = [
    { key: "male" as const, label: "Male", count: male, color: "bg-chart-1" },
    { key: "female" as const, label: "Female", count: female, color: "bg-chart-2" },
  ].filter((s) => s.count > 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative" aria-hidden="true">
        <div className="flex h-6 w-full gap-[2px] overflow-visible">
          {segments.map((s, i) => (
            <span
              key={s.key}
              className={`${s.color} h-full transition-[filter] hover:brightness-110 ${i === 0 ? "rounded-l-[4px]" : ""} ${i === segments.length - 1 ? "rounded-r-[4px]" : ""}`}
              style={{ width: `${(s.count / total) * 100}%` }}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </div>
        {active && (
          <span
            role="tooltip"
            className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-surface px-2 py-1 text-xs shadow-lg"
          >
            {active === "male" ? "Male" : "Female"}: {active === "male" ? male : female} staff (
            {pct(active === "male" ? male : female)}%)
          </span>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Gender of current staff">
        {[
          { label: "Male", count: male, color: "bg-chart-1" },
          { label: "Female", count: female, color: "bg-chart-2" },
        ].map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`size-3 rounded-sm ${s.color}`} aria-hidden="true" />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">{s.count}</span>
            <span className="text-muted-foreground tabular-nums">({pct(s.count)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
