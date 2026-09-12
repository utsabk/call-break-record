/**
 * Ranking and tie-breaking logic
 */

export interface RankingResult {
  playerId: string;
  playerName: string;
  totalScoreTenths: number;
  rank: number | "TIE";
  isTied?: boolean; // true if this player is tied with another at the same position
}

export type TieBreakStrategy = "NONE" | "MANUAL";

export type TieScenario = "FIRST_SECOND" | "SECOND_THIRD" | "THIRD_FOURTH" | null;

/**
 * Calculate final rankings from game totals
 * @param players - Player list with IDs and names
 * @param gameTotals - Cumulative score for each player (in tenths)
 * @param tieBreakStrategy - How to handle ties (preserved for compatibility; ties are always detected)
 * @returns Array of rankings sorted by score descending
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

  for (let i = 0; i < playerScores.length; i++) {
    const current = playerScores[i];
    const rank = i + 1;

    // Check if tied with previous player
    const isTiedWithPrevious = i > 0 && current.totalScoreTenths === playerScores[i - 1].totalScoreTenths;

    rankings.push({
      ...current,
      rank, // Always numeric, even if tied
      isTied: isTiedWithPrevious,
    });

    // Also mark previous player as tied if this is the first time we detect a tie
    if (isTiedWithPrevious && !rankings[i - 1].isTied) {
      rankings[i - 1].isTied = true;
    }
  }

  return rankings;
}

/**
 * Identify the specific tie scenario from rankings
 * @param rankings - Array of rankings
 * @returns The tie scenario: "FIRST_SECOND", "SECOND_THIRD", "THIRD_FOURTH", or null
 *
 * Assumes ties are only between adjacent positions (as per requirements).
 */
export function getTieScenario(rankings: RankingResult[]): TieScenario {
  if (rankings.length < 4) return null;

  // Check for 1st + 2nd tied
  if (rankings[0].isTied && rankings[0].totalScoreTenths === rankings[1].totalScoreTenths) {
    return "FIRST_SECOND";
  }

  // Check for 2nd + 3rd tied
  if (rankings[1].isTied && rankings[1].totalScoreTenths === rankings[2].totalScoreTenths) {
    return "SECOND_THIRD";
  }

  // Check for 3rd + 4th tied
  if (rankings[2].isTied && rankings[2].totalScoreTenths === rankings[3].totalScoreTenths) {
    return "THIRD_FOURTH";
  }

  return null;
}

/**
 * Check if final rankings have a tie
 */
export function hasRankingTie(rankings: RankingResult[]): boolean {
  return rankings.some((r) => r.isTied);
}

/**
 * Get only the players with numeric ranks (exclude TIE)
 */
export function getNumericRankings(
  rankings: RankingResult[]
): RankingResult[] {
  return rankings.filter((r) => typeof r.rank === "number") as RankingResult[];
}
