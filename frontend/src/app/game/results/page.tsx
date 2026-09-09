"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Club, Heart, Spade, Trophy } from "lucide-react";
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

  if (!isReady || isLoading) return <main className="app-shell px-4 py-10"><p className="table-note mx-auto max-w-xl">Loading results...</p></main>;
  if (!currentGame) return <main className="app-shell px-4 py-10"><div className="panel mx-auto max-w-xl"><p role="alert" className="text-[var(--danger)]">{error || "Game not found."}</p><Link className="btn-secondary mt-5" href="/"><ArrowLeft size={18} /> Home</Link></div></main>;

  const totals = calculateGameTotals(currentGame.rounds.flatMap((round) => round.players.map(({ playerId, scoreTenths }) => ({ playerId, scoreTenths }))));
  const rankings = calculateRankings(currentGame.players, totals);
  const tied = hasRankingTie(rankings);
  const settlement = tied ? null : calculateFinalSettlement(rankings, currentGame.rules.baseBid);

  return (
    <main className="app-shell">
      <div className="app-container wide-container">
        <Link href="/" className="table-nav inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
          <ArrowLeft size={18} /> Home
        </Link>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="kicker-pill"><Heart size={14} fill="currentColor" /> Game complete</p>
          <p className="results-base-bid-chip"><span>Base bid</span><span className="score-number">{currentGame.rules.baseBid}</span></p>
        </div>
        <h1 className="mt-4 text-center font-display text-2xl font-black sm:text-3xl">{tied ? "This game ends in a tie." : `${settlement?.winner.playerName} takes the table.`}</h1>

        {!tied && rankings.length >= 3 && (
          <section className="podium mt-8" aria-label="Top three standings">
            <div className="podium-card podium-card-2">
              <Heart className="player-suit-watermark" data-suit="heart" aria-hidden="true" fill="currentColor" size={56} />
              <span className="podium-medal">🥈</span>
              <p className="podium-name">{rankings[1].playerName}</p>
              <p className="podium-score">{formatScore(rankings[1].totalScoreTenths)}</p>
              <span className="podium-rank-chip podium-rank-chip-2">2nd</span>
            </div>
            <div className="podium-card podium-card-1">
              <Spade className="player-suit-watermark" data-suit="spade" aria-hidden="true" fill="currentColor" size={64} />
              <Trophy className="podium-trophy" size={20} />
              <span className="podium-medal">🥇</span>
              <p className="podium-name">{rankings[0].playerName}</p>
              <p className="podium-score">{formatScore(rankings[0].totalScoreTenths)}</p>
              <span className="podium-rank-chip podium-rank-chip-1">Winner</span>
            </div>
            <div className="podium-card podium-card-3">
              <Club className="player-suit-watermark" data-suit="club" aria-hidden="true" fill="currentColor" size={48} />
              <span className="podium-medal">🥉</span>
              <p className="podium-name">{rankings[2].playerName}</p>
              <p className="podium-score">{formatScore(rankings[2].totalScoreTenths)}</p>
              <span className="podium-rank-chip podium-rank-chip-3">3rd</span>
            </div>
          </section>
        )}

        <section className="panel mt-6 overflow-hidden p-0">
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

        {settlement?.winnerBonusApplied && <p className="soft-panel mt-5 p-4 text-sm">🔥 {settlement.winner.playerName} finished on 20 or more, so every payment is doubled.</p>}
        {tied && <p className="status-alert mt-5">Settlement is not calculated while players are tied. Resolve the tie manually, then update the relevant round.</p>}
      </div>
    </main>
  );
}