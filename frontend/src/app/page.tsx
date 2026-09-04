"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, MoreHorizontal, Plus, Spade, Users } from "lucide-react";
import { Game } from "@call-break/shared";
import { apiGameRepository, forgetGameCode, getRememberedGameCodes } from "@/lib/repositories/ApiGameRepository";
import { useGameStore } from "@/lib/hooks/useGameStore";

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteCandidate, setDeleteCandidate] = useState<Game | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteGame = useGameStore((state) => state.deleteGame);

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    try {
      const codes = getRememberedGameCodes();
      const results = await Promise.allSettled(codes.map((code) => apiGameRepository.getGameByCode(code)));
      const allGames = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const active = allGames.find((game) => game.status === "ACTIVE") || null;
      setGames(allGames);
      setActiveGame(active);
    } catch (error) {
      console.error("Failed to load games:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    setDeleteError(null);
    setDeletingId(deleteCandidate.id);
    try {
      await deleteGame(deleteCandidate.id);
      forgetGameCode(deleteCandidate.gameCode);
      setGames((current) => current.filter((game) => game.id !== deleteCandidate.id));
      setActiveGame((current) => current?.id === deleteCandidate.id ? null : current);
      setDeleteCandidate(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete game. Try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="app-shell">
      <div className="app-container">
        <header className="flex items-center gap-2 text-sm font-bold tracking-wide text-[var(--primary)]"><Spade aria-hidden="true" size={20} fill="currentColor" /> CALL BREAK</header>
        <section className="pb-10 pt-12 sm:pt-16">
          <p className="eyebrow">Scorekeeper</p>
          <h1 className="mt-3 max-w-xl font-display text-4xl font-bold leading-tight sm:text-5xl">Keep score. Stay in the game.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-[var(--muted)]">Five rounds, one clear score.</p>
          <div className="mt-7 flex gap-3"><Link href="/game/setup/" className="btn-primary flex-1 sm:flex-none"><Plus size={19} /> Create game</Link><Link href="/join/" className="btn-secondary flex-1 sm:flex-none"><Users size={19} /> Join game</Link></div>
        </section>

        {/* Active Game */}
        {activeGame && (
          <div className="card mb-10 border-l-4 border-l-[var(--gold)] p-5">
            <p className="eyebrow">Active game</p>
            <p className="mt-2 font-display text-2xl font-bold">{activeGame.players.map((player) => player.name).join(" · ")}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Round {activeGame.rounds.filter((round) => round.status === "COMPLETED").length + 1} / {activeGame.rules.rounds}</p>
            <Link href={`/game/?id=${activeGame.id}`} className="btn-primary mt-5 w-full">Continue game <ChevronRight size={18} /></Link>
          </div>
        )}

        {/* Game History */}
        {!isLoading && games.length > 0 && (
          <section id="history" className="mb-8">
            <h2 className="font-display text-2xl font-bold">Game history</h2>
            <div className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              {games
                .filter((g) => g.status === "COMPLETED")
                .map((game) => (
                  <div key={game.id} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                    <Link href={`/game/results/?code=${game.gameCode}`} className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">
                            {game.players.map((p) => p.name).join(" • ")}
                          </div>
                          <div className="mt-1 text-sm text-[var(--muted)]">
                            {new Date(game.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <ChevronRight className="shrink-0 text-[var(--gold)]" size={18} />
                      </div>
                  </Link>
                  <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" type="button" aria-label={`Delete game with ${game.players.map((player) => player.name).join(", ")}`} onClick={() => { setDeleteCandidate(game); setDeleteError(null); }}><MoreHorizontal size={20} /></button>
                </div>
                ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {!isLoading && games.length === 0 && !activeGame && (
          <div className="surface-tint py-10 text-center">
            <p className="font-display text-2xl font-bold">No games yet</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Create a game above to get started.</p>
          </div>
        )}
        {deleteCandidate && <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/30 px-4 pb-4 sm:items-center" role="presentation"><div className="card w-full max-w-sm" role="dialog" aria-modal="true" aria-labelledby="delete-game-title"><h2 id="delete-game-title" className="font-display text-2xl font-bold">Delete this game?</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">This game and its score history will be permanently removed.</p>{deleteError && <p role="alert" className="status-alert mt-4">{deleteError}</p>}<div className="mt-6 flex justify-end gap-3"><button className="btn-secondary" type="button" disabled={deletingId !== null} onClick={() => setDeleteCandidate(null)}>Cancel</button><button className="btn-danger" type="button" disabled={deletingId !== null} onClick={confirmDelete}>{deletingId ? "Deleting..." : "Delete"}</button></div></div></div>}
      </div>
    </main>
  );
}
