/**
 * Ranking and tie-breaking logic
 */

export interface RankingResult {
  playerId: string;
  playerName: string;
  totalScoreTenths: number;
  rank: number | "TIE";
}

export type TieBreakStrategy = "NONE" | "MANUAL";

/**
 * Calculate final rankings from game totals
 * @param players - Player list with IDs and names
 * @param gameTotals - Cumulative score for each player (in tenths)
 * @param tieBreakStrategy - How to handle ties (NONE = mark as TIE, MANUAL = assign sequential ranks)
 * @returns Array of rankings sorted by score descending
 *
 * IMPORTANT: For V1, we do NOT automatically break ties.
 * If scores are equal, they are marked as "TIE"
 */
export function calculateRankings(
  players: Array<{ id: string; name: string }>,
  gameTotals: { [playerId: string]: number },
  tieBreakStrategy: TieBreakStrategy = "NONE"
): RankingResult[] {
  // Create list of players with scores, sorted descending
  const playerScores = players
    .map((player) => ({
      playerId: player.id,
      playerName: player.name,
      totalScoreTenths: gameTotals[player.id] ?? 0,
    }))
    .sort((a, b) => b.totalScoreTenths - a.totalScoreTenths);

  // Assign ranks, marking ties
  const rankings: RankingResult[] = [];
  let currentRank = 1;

  for (let i = 0; i < playerScores.length; i++) {
    const current = playerScores[i];

    if (i > 0 && current.totalScoreTenths === playerScores[i - 1].totalScoreTenths) {
      // Tied with previous player
      const prevRanking = rankings[rankings.length - 1];
      if (tieBreakStrategy === "MANUAL") {
        // Sequential ranking despite tie
        rankings.push({
          ...current,
          rank: i + 1,
        });
      } else {
        // Mark as tied
        rankings.push({
          ...current,
          rank: "TIE",
        });
        // Also mark previous player as tied if not already
        if (typeof prevRanking.rank === "number") {
          prevRanking.rank = "TIE";
        }
      }
    } else {
      // Not tied with previous
      currentRank = i + 1;
      rankings.push({
        ...current,
        rank: currentRank,
      });
    }
  }

  return rankings;
}

/**
 * Check if final rankings have a tie
 */
export function hasRankingTie(rankings: RankingResult[]): boolean {
  return rankings.some((r) => r.rank === "TIE");
}

/**
 * Get only the players with numeric ranks (exclude TIE)
 */
export function getNumericRankings(
  rankings: RankingResult[]
): RankingResult[] {
  return rankings.filter((r) => typeof r.rank === "number") as RankingResult[];
}
