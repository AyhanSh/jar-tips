import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { chainClockOffset, getProgram } from "./solana";

export function useProgram() {
  const { connection } = useConnection();
  return useMemo(() => getProgram(connection), [connection]);
}

export function useHashRoute(): [string[], (path: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = useCallback((path: string) => {
    window.location.hash = path;
  }, []);
  return [parts, go];
}

/** Current time in seconds, corrected towards the cluster clock, ticking every second. */
export function useChainNow(): number {
  const { connection } = useConnection();
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    chainClockOffset(connection).then(setOffset);
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [connection]);
  return Math.floor(now + offset);
}

/** Polls `fn` every `ms`, never running two calls at once (keeps public RPC rate limits happy). */
export function useInterval(fn: () => unknown, ms: number, deps: unknown[] = []) {
  const running = useRef(false);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (running.current || !alive) return;
      running.current = true;
      try {
        await fn();
      } catch (e) {
        // Usually a 429 from the public RPC; the next tick retries.
        console.warn("poll failed", e);
      } finally {
        running.current = false;
      }
    };
    tick();
    const id = setInterval(tick, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function formatDuration(secs: number): string {
  secs = Math.max(0, Math.floor(secs));
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}
