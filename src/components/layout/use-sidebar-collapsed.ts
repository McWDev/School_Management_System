"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "sms.sidebar-collapsed";
const listeners = new Set<() => void>();
/** Fallback when localStorage is unavailable (private mode, blocked storage). */
let memoryValue = false;

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return memoryValue;
  }
}

function write(value: boolean) {
  memoryValue = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Keep the in-memory value only.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Desktop sidebar collapsed state, remembered per browser. Defaults to expanded. */
export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);

  const toggle = useCallback(() => {
    write(!read());
    listeners.forEach((listener) => listener());
  }, []);

  return { collapsed, toggle };
}
