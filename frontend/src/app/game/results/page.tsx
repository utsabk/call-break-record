"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Trophy } from "lucide-react";
import Link from "next/link";
import { calculateFinalSettlement, calculateGameTotals, calculateRankings, hasRankingTie } from "@call-break/shared";
import { useGameStore } from "@/lib/hooks/useGameStore";

const formatScore = (scoreTenths: number): string => (scoreTenths / 10).toFixed(1);

export default function GameResultsPage() {
  const currentGame = useGameStore((state) => state.currentGame);
  const isLoading = useGameStore((state) => state.isLoading);
  const error = useGameStore((state) => state.error);
  const loadGame = useGameStore((state) => state.loadGame);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gameCode = params.get("code");
    const gameId = params.get("id");
    if (gameCode) void useGameStore.getState().loadGameByCode(gameCode).catch(() => undefined).finally(() => setIsReady(true));
    else if (gameId) void loadGame(gameId).catch(() => undefined).finally(() => setIsReady(true));
    else setIsReady(true);
  }, [loadGame]);

  if (!isReady || isLoading) return <main className="min-h-screen px-4 py-10"><p className="mx-auto max-w-xl text-[var(--muted)]">Loading results...</p></main>;
  if (!currentGame) return <main className="min-h-screen px-4 py-10"><div className="mx-auto max-w-xl"><p role="alert" className="text-[var(--danger)]">{error || "Game not found."}</p><Link className="btn-secondary mt-5" href="/"><ArrowLeft size={18} /> Home</Link></div></main>;

  const totals = calculateGameTotals(currentGame.rounds.flatMap((round) => round.players.map(({ playerId, scoreTenths }) => ({ playerId, scoreTenths }))));
  const rankings = calculateRankings(currentGame.players, totals);
  const tied = hasRankingTie(rankings);
  const settlement = tied ? null : calculateFinalSettlement(rankings, currentGame.rules.baseBid);

  return (
    <main className="app-shell">
      <div className="app-container max-w-2xl">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--primary)]">
          <ArrowLeft size={18} /> Home
        </Link>
        <header className="surface-tint mt-8 p-6">
          <Trophy className="text-[var(--gold)]" size={32} />
          <p className="eyebrow mt-5">Game complete</p>
          <h1 className="mt-2 font-display text-3xl font-bold">{tied ? "This game ends in a tie." : `${settlement?.winner.playerName} takes the table.`}</h1>
          <div className="final-base-bid mt-5">
            <span className="text-xs font-bold uppercase tracking-wide">Base bid</span>
            <span className="score-number text-2xl font-bold">{currentGame.rules.baseBid}</span>
          </div>
        </header>

        <section className="card mt-6 overflow-hidden p-0">
          <div className="grid grid-cols-[3rem_minmax(0,1fr)_5rem_5rem] gap-2 border-b border-[var(--border)] bg-[var(--surface-tint)] px-5 py-3 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
            <span>Rank</span><span>Player</span><span className="text-right">Score</span><span className="text-right">Settle</span>
          </div>
          {rankings.map((ranking, index) => {
            const settlementLine = settlement?.lines.find((line) => line.playerId === ranking.playerId);
            const medal = ["🥇", "🥈", "🥉", "4️⃣"][index] ?? "";
            return (
              <div key={ranking.playerId} className={`grid grid-cols-[3rem_minmax(0,1fr)_5rem_5rem] items-center gap-2 border-b border-[var(--border)] px-5 py-4 last:border-b-0 ${typeof ranking.rank === "number" ? `rank-${ranking.rank}` : ""}`}>
                <span className="flex items-center gap-1 font-bold text-[var(--gold)]"><span aria-hidden="true">{medal}</span>{ranking.rank}</span>
                <span className="min-w-0"><span className="block truncate font-semibold">{ranking.playerName}</span>{settlementLine?.doubledForNegativeScore && <span className="text-xs font-semibold text-[var(--danger)]">Doubled: below zero</span>}</span>
                <span className="score-number text-right">{formatScore(ranking.totalScoreTenths)}</span>
                <span className={`score-number text-right font-bold ${settlementLine && settlementLine.settlementAmountTenths < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{settlementLine ? formatScore(settlementLine.settlementAmountTenths) : "-"}</span>
              </div>
            );
          })}
        </section>

        {settlement?.winnerBonusApplied && <p className="surface-tint mt-5 p-4 text-sm">🔥 {settlement.winner.playerName} finished on 20 or more, so every payment is doubled.</p>}
        {tied && <p className="status-alert mt-5">Settlement is not calculated while players are tied. Resolve the tie manually, then update the relevant round.</p>}
      </div>
    </main>
  );
}