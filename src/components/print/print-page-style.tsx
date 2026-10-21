"use client";

import { useEffect } from "react";

/**
 * Sets the printed page (e.g. "A4 landscape") while this page is shown. The
 * rule is added on mount and removed when the page is left or hidden, so it
 * never changes how other pages print.
 */
export function PrintPageStyle({ size, margin = "8mm" }: { size: string; margin?: string }) {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@media print { @page { size: ${size}; margin: ${margin}; } }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [size, margin]);
  return null;
}
