/**
 * Core scoring engine for Call Break
 * All calculations use integer tenths internally
 * Score = bid + (tricksWon - bid) * 0.1 = bid + (tricksWon - bid) / 10
 * In tenths: scoreTenths = bid * 10 + (tricksWon - bid)
 */

export type RoundScoreReason = "SUCCESS" | "FAILED_BID" | "PUNISHED";

export interface RoundScoreResult {
  scoreTenths: number;
  reason: RoundScoreReason;
  explanation: string;
}

/**
 * Calculate the score for a single player in a round
 * @param bid - Player's bid (1-13)
 * @param tricksWon - Tricks player actually won (0-13)
 * @param punished - Whether player was punished for rule violation
 * @returns Score in tenths and explanation
 *
 * Examples:
 * bid=4, tricks=4, punished=false -> 40 (4.0 success)
 * bid=4, tricks=5, punished=false -> 41 (4.1 success with bonus)
 * bid=4, tricks=3, punished=false -> -40 (-4.0 failed)
 * bid=5, tricks=7, punished=true -> -50 (-5.0 punished override)
 */
export function calculateRoundScore(
  bid: number,
  tricksWon: number,
  punished: boolean
): RoundScoreResult {
  if (punished) {
    return {
      scoreTenths: -bid * 10,
      reason: "PUNISHED",
      explanation: `Punished: ${-bid}.0`,
    };
  }

  if (tricksWon >= bid) {
    // Success: bid + (tricksWon - bid) * 0.1
    // In tenths: bid * 10 + (tricksWon - bid)
    const scoreTenths = bid * 10 + (tricksWon - bid);
    const displayScore = (scoreTenths / 10).toFixed(1);
    return {
      scoreTenths,
      reason: "SUCCESS",
      explanation: `Success: ${bid} + ${tricksWon - bid} * 0.1 = ${displayScore}`,
    };
  }

  // Failed: -bid
  return {
    scoreTenths: -bid * 10,
    reason: "FAILED_BID",
    explanation: `Failed bid: -${bid}.0`,
  };
}

/**
 * Calculate cumulative scores for all players across all completed rounds
 */
export function calculateGameTotals(
  roundScores: Array<{ playerId: string; scoreTenths: number }>
): { [playerId: string]: number } {
  const totals: { [playerId: string]: number } = {};

  for (const { playerId, scoreTenths } of roundScores) {
    totals[playerId] = (totals[playerId] ?? 0) + scoreTenths;
  }

  return totals;
}

/**
 * Validate round data before saving
 */
export interface RoundValidationError {
  field: string;
  message: string;
}

export function validateRound(
  players: Array<{ bid: number; tricksWon: number }>
): RoundValidationError[] {
  const errors: RoundValidationError[] = [];

  if (players.length !== 4) {
    errors.push({ field: "players", message: "Must have exactly 4 players" });
    return errors; // Return early if player count is wrong
  }

  let totalTricks = 0;
  for (let i = 0; i < players.length; i++) {
    const { bid, tricksWon } = players[i];

    if (bid < 1 || bid > 13) {
      errors.push({
        field: `players[${i}].bid`,
        message: "Bid must be between 1 and 13",
      });
    }

    if (tricksWon < 0 || tricksWon > 13) {
      errors.push({
        field: `players[${i}].tricksWon`,
        message: "Tricks must be between 0 and 13",
      });
    }

    totalTricks += tricksWon;
  }

  if (totalTricks !== 13) {
    errors.push({
      field: "tricks",
      message: `Total tricks must equal 13 (got ${totalTricks})`,
    });
  }

  return errors;
}
