"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { apiGameRepository } from "@/lib/repositories/ApiGameRepository";

/**
 * Scoring moved to the live screen so the host and the players work from the same
 * server state. Older links point here, by code or by id, so both are forwarded.
 */
export default function GamePage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const gameId = params.get("id");

    if (code) {
      window.location.replace(`/game/live/?code=${encodeURIComponent(code.toUpperCase())}`);
      return;
    }
    if (!gameId) {
      setFailed(true);
      return;
    }
    apiGameRepository
      .getGame(gameId)
      .then((game) => window.location.replace(`/game/live/?code=${encodeURIComponent(game.gameCode)}`))
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <main className="app-shell">
        <div className="app-container max-w-md py-20 text-center">
          <p role="alert" className="text-[var(--danger)]">That game could not be opened.</p>
          <Link className="btn-secondary mt-5" href="/">Home</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="app-container max-w-md py-20 text-center text-[var(--muted)]">
        <Loader2 className="mx-auto animate-spin" aria-hidden="true" />
        <p className="mt-3">Opening game…</p>
      </div>
    </main>
  );
}
