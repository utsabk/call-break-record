"use client";

import { useEffect } from "react";
import { useGameStore } from "./useGameStore";

export function useGamePolling(gameCode: string | undefined, enabled: boolean): void {
  const loadGameByCode = useGameStore((state) => state.loadGameByCode);

  useEffect(() => {
    if (!gameCode || !enabled) return;
    const poll = () => { void loadGameByCode(gameCode).catch(() => undefined); };
    const interval = window.setInterval(poll, 4000);
    window.addEventListener("focus", poll);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", poll); };
  }, [enabled, gameCode, loadGameByCode]);
}