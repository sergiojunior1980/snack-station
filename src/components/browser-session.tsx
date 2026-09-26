"use client";

import { useEffect, useSyncExternalStore } from "react";
import { clearSessionMark, markSessionOpen, sessionStillOpen } from "@/lib/browser-session";
import { logout } from "@/server/actions";

type Gate = "pending" | "open" | "closed";

let decided = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function isReload() {
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return entry?.type === "reload";
}

function settle() {
  if (decided) return;
  if (isReload()) markSessionOpen();
  decided = true;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!decided) queueMicrotask(settle);
  return () => listeners.delete(listener);
}

function getSnapshot(): Gate {
  if (!decided) return "pending";
  return sessionStillOpen() ? "open" : "closed";
}

function getServerSnapshot(): Gate {
  return "pending";
}

export function BrowserSession({ children }: { children: React.ReactNode }) {
  const gate = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (gate !== "open") {
      if (gate === "closed") {
        clearSessionMark();
        void logout();
      }
      return;
    }

    markSessionOpen();
    const tick = window.setInterval(markSessionOpen, 3000);
    const onHide = () => clearSessionMark();
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted || sessionStillOpen()) return;
      clearSessionMark();
      void logout();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, [gate]);

  if (gate !== "open") return null;
  return children;
}
