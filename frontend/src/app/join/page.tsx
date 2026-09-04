"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, Spade, Users } from "lucide-react";
import Link from "next/link";
import { GameView, GameViewerRole } from "@call-break/shared";
import { apiGameRepository } from "@/lib/repositories/ApiGameRepository";

export default function JoinGamePage() {
  const [gameCode, setGameCode] = useState("");
  const [game, setGame] = useState<GameView | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const findGame = async (event: FormEvent) => {
    event.preventDefault();
    const code = gameCode.replace(/\s/g, "").toUpperCase();
    setError(null);
    if (!/^[A-Z0-9]{8}$/.test(code)) { setError("Enter the 8-character game code."); return; }
    setLoading(true);
    try {
      setGame(await apiGameRepository.getGameView(code));
      setGameCode(code);
    } catch {
      setError("Game not found. Check the code and try again.");
    } finally {
      setLoading(false);
    }
  };

  const join = async (role: GameViewerRole) => {
    setError(null);
    setLoading(true);
    try {
      await apiGameRepository.joinGame(gameCode, role, role === GameViewerRole.PLAYER ? selectedPlayerId ?? undefined : undefined);
      window.location.assign(`/game/live/?code=${gameCode}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join this game.");
      setLoading(false);
    }
  };

  const claimed = new Set(game?.claimedPlayerIds ?? []);

  return (
    <main className="app-shell">
      <div className="app-container max-w-md">
        <Link className="text-sm font-semibold text-[var(--muted)]" href="/">Home</Link>

        {!game && (
          <>
            <header className="mt-10">
              <Spade className="text-[var(--primary)]" fill="currentColor" />
              <p className="eyebrow mt-5">Join game</p>
              <h1 className="mt-2 font-display text-4xl font-bold">Enter game code</h1>
            </header>
            <form className="mt-8" onSubmit={findGame}>
              <label className="block">
                <span className="sr-only">Game code</span>
                <input className="input-base score-number text-center text-2xl font-bold uppercase tracking-[0.2em]" maxLength={8} autoComplete="off" value={gameCode} onChange={(event) => setGameCode(event.target.value.toUpperCase())} />
              </label>
              {error && <p className="status-alert mt-3" role="alert">{error}</p>}
              <button className="btn-primary min-h-14 mt-6 w-full" disabled={loading}>{loading ? "Looking for game..." : <>Continue <ArrowRight size={18} /></>}</button>
            </form>
          </>
        )}

        {game && (
          <section className="mt-10">
            <p className="eyebrow">Game found</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[0.15em]">{game.gameCode}</h1>
            <p className="mt-2 text-[var(--muted)]">Round {game.rounds.filter((round) => round.revealed).length + 1} of {game.rules.rounds}</p>

            <fieldset className="card mt-6">
              <legend className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Choose your player</legend>
              <div className="mt-3 space-y-2">
                {game.players.map((player) => {
                  const taken = claimed.has(player.id);
                  return (
                    <label key={player.id} className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 ${taken ? "opacity-60" : "cursor-pointer"} ${selectedPlayerId === player.id ? "border-[var(--primary)]" : "border-[var(--border)]"}`}>
                      <input type="radio" name="player" className="h-5 w-5" disabled={taken} checked={selectedPlayerId === player.id} onChange={() => setSelectedPlayerId(player.id)} />
                      <span className="font-semibold">{player.name}</span>
                      {taken && <span className="ml-auto text-xs font-semibold uppercase text-[var(--muted)]">Connected</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {error && <p className="status-alert mt-4" role="alert">{error}</p>}

            <div className="mt-6 space-y-3">
              <button className="btn-primary min-h-14 w-full" disabled={loading || !selectedPlayerId} onClick={() => join(GameViewerRole.PLAYER)}><Users size={18} /> Join as player</button>
              <button className="btn-secondary min-h-14 w-full" disabled={loading} onClick={() => join(GameViewerRole.VIEWER)}><Eye size={18} /> Watch game</button>
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">Anyone with this code can watch this game.</p>
          </section>
        )}
      </div>
    </main>
  );
}