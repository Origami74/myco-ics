// In-app capture of the WebView's console — logcat can't see it, so we mirror
// every console.* call (and uncaught errors) into a buffer shown in the app's
// debug panel. Import this module first (main.tsx) so capture is installed before
// anything else logs.
import { BehaviorSubject } from "rxjs";

const MAX = 500;
const buffer: string[] = [];

/** Reactive view of the captured log lines (oldest first). */
export const logs$ = new BehaviorSubject<string[]>([]);

function push(level: string, parts: unknown[]) {
  const t = new Date().toLocaleTimeString([], { hour12: false });
  buffer.push(`${t} ${level} ${parts.map(fmt).join(" ")}`);
  if (buffer.length > MAX) buffer.shift();
  logs$.next(buffer.slice());
}

/** App-tagged log line (shows as `·`). */
export function dlog(...parts: unknown[]) {
  push("·", parts);
}

export function clearLogs() {
  buffer.length = 0;
  logs$.next([]);
}

function fmt(v: unknown): string {
  if (v instanceof Error) return `${v.message}`;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null) {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

// --- install console + error capture (once, at import time) ---
if (typeof window !== "undefined" && !(window as { __icsLog?: boolean }).__icsLog) {
  (window as { __icsLog?: boolean }).__icsLog = true;

  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const orig = console[level]?.bind(console);
    console[level] = (...args: unknown[]) => {
      push(level.toUpperCase(), args);
      orig?.(...args);
    };
  }

  window.addEventListener("error", (e) =>
    push("ERR", [e.message, `${e.filename}:${e.lineno}`]),
  );
  window.addEventListener("unhandledrejection", (e) =>
    push("REJ", [(e.reason as Error)?.message ?? e.reason]),
  );
}
