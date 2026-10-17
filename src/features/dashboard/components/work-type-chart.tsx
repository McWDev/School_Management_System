"use client";

import { useState } from "react";

/**
 * Staff per work type as horizontal bars (one series → one hue, no legend).
 * Bars are ≤ 20px thick with a 4px rounded end and grow from one baseline;
 * each row has a hover/focus tooltip, and a table carries the same numbers.
 */
export function WorkTypeChart({ data }: { data: { name: string; count: number }[] }) {
  const [active, setActive] = useState<string | null>(null);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-2.5" aria-hidden="true">
        {data.map((d) => {
          const pct = total ? Math.round((d.count / total) * 100) : 0;
          return (
            <li
              key={d.name}
              className="group relative grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-3 rounded-md px-1 py-0.5"
              onMouseEnter={() => setActive(d.name)}
              onMouseLeave={() => setActive(null)}
            >
              <span className="truncate text-sm text-muted-foreground">{d.name}</span>
              <span className="flex items-center gap-2">
                <span
                  className="h-5 rounded-r-[4px] bg-primary transition-[filter] group-hover:brightness-110"
                  style={{
                    width: `${Math.max(2, (d.count / max) * 100)}%`,
                    maxWidth: "calc(100% - 3rem)",
                  }}
                />
                <span className="text-sm font-medium tabular-nums">{d.count}</span>
              </span>
              {active === d.name && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute -top-8 left-36 z-10 whitespace-nowrap rounded-md border bg-surface px-2 py-1 text-xs shadow-lg"
                >
                  <span className="font-medium">{d.name}</span>: {d.count} staff ({pct}%)
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <table className="sr-only">
        <caption>Current staff by work type</caption>
        <thead>
          <tr>
            <th scope="col">Work type</th>
            <th scope="col">Staff</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
