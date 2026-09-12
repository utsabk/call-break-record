"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Club, Heart, Spade } from "lucide-react";
import Link from "next/link";
import { calculateFinalSettlement, calculateGameTotals, calculateRankings, getTieScenario } from "@call-break/shared";
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
  // Cast rankings to settlement input type (rank may be "TIE" in RankingResult, but settlement doesn't use it)
  const settlement = calculateFinalSettlement(
    rankings.map(r => ({ playerId: r.playerId, playerName: r.playerName, totalScoreTenths: r.totalScoreTenths, isTied: r.isTied })),
    currentGame.rules.baseBid
  );
  const tieScenario = getTieScenario(rankings);

  return (
    <main className="app-shell">
      <div className="app-container wide-container">
        <Link href="/" className="table-nav inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
          <ArrowLeft size={18} /> Home
        </Link>

        {rankings.length >= 3 && (
          <section className="podium mt-8" aria-label="Top three standings">
            {/* No tie: standard 3-card podium */}
            {!tieScenario && (
              <>
                <div className="podium-suit-card podium-suit-card-2" data-suit="heart">
                  <span className="podium-suit-corner" data-suit="heart" aria-hidden="true"><strong>A</strong><Heart size={12} fill="currentColor" /></span>
                  <Heart className="podium-suit-center" data-suit="heart" fill="currentColor" size={48} aria-hidden="true" />
                  <span className="podium-suit-corner podium-suit-corner-bottom" data-suit="heart" aria-hidden="true"><strong>A</strong><Heart size={12} fill="currentColor" /></span>
                  <div className="podium-suit-info">
                    <p className="podium-name">{rankings[1].playerName}</p>
                    <p className="podium-score">{formatScore(rankings[1].totalScoreTenths)}</p>
                  </div>
                </div>
                <div className="podium-suit-card podium-suit-card-1" data-suit="spade">
                  <span className="podium-suit-corner" data-suit="spade" aria-hidden="true"><strong>A</strong><Spade size={12} fill="currentColor" /></span>
                  <Spade className="podium-suit-center" data-suit="spade" fill="currentColor" size={56} aria-hidden="true" />
                  <span className="podium-suit-corner podium-suit-corner-bottom" data-suit="spade" aria-hidden="true"><strong>A</strong><Spade size={12} fill="currentColor" /></span>
                  <div className="podium-suit-info">
                    <p className="podium-name podium-name-winner">{rankings[0].playerName}</p>
                    <p className="podium-score">{formatScore(rankings[0].totalScoreTenths)}</p>
                  </div>
                </div>
                <div className="podium-suit-card podium-suit-card-3" data-suit="club">
                  <span className="podium-suit-corner" data-suit="club" aria-hidden="true"><strong>A</strong><Club size={12} fill="currentColor" /></span>
                  <Club className="podium-suit-center" data-suit="club" fill="currentColor" size={42} aria-hidden="true" />
                  <span className="podium-suit-corner podium-suit-corner-bottom" data-suit="club" aria-hidden="true"><strong>A</strong><Club size={12} fill="currentColor" /></span>
                  <div className="podium-suit-info">
                    <p className="podium-name">{rankings[2].playerName}</p>
                    <p className="podium-score">{formatScore(rankings[2].totalScoreTenths)}</p>
                  </div>
                </div>
              </>
            )}

            {/* 1st + 2nd tie: one gold card with two names */}
            {tieScenario === "FIRST_SECOND" && (
              <>
                <div className="podium-suit-card podium-suit-card-1" data-suit="spade">
                  <span className="podium-suit-corner" data-suit="spade" aria-hidden="true"><strong>A</strong><Spade size={12} fill="currentColor" /></span>
                  <Spade className="podium-suit-center" data-suit="spade" fill="currentColor" size={56} aria-hidden="true" />
                  <span className="podium-suit-corner podium-suit-corner-bottom" data-suit="spade" aria-hidden="true"><strong>A</strong><Spade size={12} fill="currentColor" /></span>
                  <div className="podium-suit-info">
                    <p className="podium-name podium-name-winner">{rankings[0].playerName}</p>
                    <p className="podium-name podium-name-winner">{rankings[1].playerName}</p>
                    <p className="podium-score">{formatScore(rankings[0].totalScoreTenths)}</p>
                  </div>
                </div>
                <div className="podium-suit-card podium-suit-card-3" data-suit="club">
                  <span className="podium-suit-corner" data-suit="club" aria-hidden="true"><strong>A</strong><Club size={12} fill="currentColor" /></span>
                  <Club className="podium-suit-center" data-suit="club" fill="currentColor" size={42} aria-hidden="true" />
                  <span className="podium-suit-corner podium-suit-corner-bottom" data-suit="club" aria-hidden="true"><strong>A</strong><Club size={12} fill="currentColor" /></span>
                  <div className="podium-suit-info">
                    <p className="podium-name">{rankings[2].playerName}</p>
                    <p className="podium-score">{formatScore(rankings[2].totalScoreTenths)}</p>
                  </div>
                </div>
              </>
            )}

            {/* 2nd + 3rd tie: gold card, silver card with two names */}
            {tieScenario === "SECOND_THIRD" && (
              <>
                <div className="podium-suit-card podium-suit-card-1" data-suit="spade">
                  <span className="podium-suit-corner" data-suit="spade" aria-hidden="true"><strong>A</strong><Spade size={12} fill="currentColor" /></span>
                  <Spade className="podium-suit-center" data-suit="spade" fill="currentColor" size={56} aria-hidden="true" />
                  <span className="podium-suit-corner podium-suit-corner-bottom" data-suit="spade" aria-hidden="true"><strong>A</strong><Spade size={12} fill="currentColor" /></span>
                  <div className="podium-suit-info">
                    <p className="podium-name podium-name-winner">{rankings[0].playerName}</p>
                    <p className="podium-score">{formatScore(rankings[0].totalScoreTenths)}</p>
                  </div>
                </div>
                <div className="podium-suit-card podium-suit-card-2" data-suit="heart">
                  <span className="podium-suit-corner" data-suit="heart" aria-hidden="true"><strong>A</strong><Heart size={12} fill="currentColor" /></span>
                  <Heart className="podium-suit-center" data-suit="heart" fill="currentColor" size={48} aria-hidden="true" />
                  <span className="podium-suit-corner podium-suit-corner-bottom" data-suit="heart" aria-hidden="true"><strong>A</strong><Heart size={12} fill="currentColor" /></span>
                  <div className="podium-suit-info">
                    <p className="podium-name">{rankings[1].playerName}</p>
                    <p className="podium-name">{rankings[2].playerName}</p>
                    <p className="podium-score">{formatScore(rankings[1].totalScoreTenths)}</p>
                  </div>
                </div>
              </>
            )}

            {/* 3rd + 4th tie: gold card, silver card, bronze card with two names */}
            {tieScenario === "THIRD_FOURTH" && (
              <>
                <div className="podium-suit-card podium-suit-card-1" data-suit="spade">
                  <span className="podium-suit-corner" data-suit="spade" aria-hidden="true"><strong>A</strong><Spade size={12} fill="currentColor" /></span>
                  <Spade className="podium-suit-center" data-suit="spade" fill="currentColor" size={56} aria-hidden="true" />
                  <span className="podium-suit-corner podium-suit-corner-bottom" data-suit="spade" aria-hidden="true"><strong>A</strong><Spade size={12} fill="currentColor" /></span>
                  <div className="podium-suit-info">
                    <p className="podium-name podium-name-winner">{rankings[0].playerName}</p>
                    <p className="podium-score">{formatScore(rankings[0].totalScoreTenths)}</p>
                  </div>
                </div>
                <div className="podium-suit-card podium-suit-card-2" data-suit="heart">
                  <span className="podium-suit-corner" data-suit="heart" aria-hidden="true"><strong>A</strong><Heart size={12} fill="currentColor" /></span>
                  <Heart className="podium-suit-center" data-suit="heart" fill="currentColor" size={48} aria-hidden="true" />
                  <span className="podium-suit-corner podium-suit-corner-bottom" data-suit="heart" aria-hidden="true"><strong>A</strong><Heart size={12} fill="currentColor" /></span>
                  <div className="podium-suit-info">
                    <p className="podium-name">{rankings[1].playerName}</p>
                    <p className="podium-score">{formatScore(rankings[1].totalScoreTenths)}</p>
                  </div>
                </div>
                <div className="podium-suit-card podium-suit-card-3" data-suit="club">
                  <span className="podium-suit-corner" data-suit="club" aria-hidden="true"><strong>A</strong><Club size={12} fill="currentColor" /></span>
                  <Club className="podium-suit-center" data-suit="club" fill="currentColor" size={42} aria-hidden="true" />
                  <span className="podium-suit-corner podium-suit-corner-bottom" data-suit="club" aria-hidden="true"><strong>A</strong><Club size={12} fill="currentColor" /></span>
                  <div className="podium-suit-info">
                    <p className="podium-name">{rankings[2].playerName}</p>
                    <p className="podium-name">{rankings[3]?.playerName}</p>
                    <p className="podium-score">{formatScore(rankings[2].totalScoreTenths)}</p>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        <p className="results-base-bid-bar mt-4"><span>Base bid</span><span className="score-number">{currentGame.rules.baseBid}</span></p>

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
        {tieScenario && <p className="status-alert mt-5">Tied players split the pot equally at their position.</p>}
      </div>
    </main>
  );
}