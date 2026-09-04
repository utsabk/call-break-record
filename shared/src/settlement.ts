/**
 * Final settlement calculator for Call Break
 *
 * Base stakes: rank 2 pays 1x, rank 3 pays 2x, rank 4 pays 3x the base bid,
 * and the winner collects the pot.
 *
 * Two penalties double a payment, and they stack:
 * - the payer finished below zero
 * - the winner reached 20 points or more
 *
 * Total always equals zero
 */

export interface SettlementLine {
  playerId: string;
  playerName: string;
  rank: number;
  settlementAmountTenths: number; // integer tenths
  finalScoreTenths: number; // game total, in tenths
  /** True when this player's payment was doubled for finishing below zero. */
  doubledForNegativeScore: boolean;
}

export interface FinalSettlement {
  baseBid: number;
  lines: SettlementLine[];
  /** True when the winner reached the bonus threshold and every payment doubled. */
  winnerBonusApplied: boolean;
  winner: {
    playerId: string;
    playerName: string;
  };
}

/** Rank 2, 3 and 4 pay these multiples of the base bid. The winner collects. */
const PAY_MULTIPLIERS = [0, 1, 2, 3];

/** A winner on 20.0 points or more doubles what everyone else pays. */
export const WINNER_BONUS_THRESHOLD_TENTHS = 200;

/**
 * Calculate final settlement amounts based on ranking
 * @param rankings - Array of players sorted by score descending
 * @param baseBid - Settlement base bid value
 * @returns Settlement with amounts for each player
 *
 * Examples with baseBid=2:
 * Rank 1: +12
 * Rank 2: -2
 * Rank 3: -4 (-8 if that player finished below zero)
 * Rank 4: -6 (-12 if that player finished below zero)
 */
export function calculateFinalSettlement(
  rankings: Array<{
    playerId: string;
    playerName: string;
    totalScoreTenths: number;
  }>,
  baseBid: number
): FinalSettlement {
  const winnerBonusApplied = (rankings[0]?.totalScoreTenths ?? 0) >= WINNER_BONUS_THRESHOLD_TENTHS;

  const payments = rankings.map((ranking, index) => {
    if (index === 0) return { amountTenths: 0, doubledForNegativeScore: false };

    const doubledForNegativeScore = ranking.totalScoreTenths < 0;
    let amountTenths = (PAY_MULTIPLIERS[index] ?? 0) * baseBid * 10;
    if (doubledForNegativeScore) amountTenths *= 2;
    if (winnerBonusApplied) amountTenths *= 2;

    return { amountTenths, doubledForNegativeScore };
  });

  // The winner collects exactly what the others pay, so the settlement still nets to zero.
  const potTenths = payments.reduce((total, payment) => total + payment.amountTenths, 0);

  const lines: SettlementLine[] = rankings.map((ranking, index) => ({
    playerId: ranking.playerId,
    playerName: ranking.playerName,
    rank: index + 1,
    settlementAmountTenths: index === 0 ? potTenths : -payments[index].amountTenths,
    finalScoreTenths: ranking.totalScoreTenths,
    doubledForNegativeScore: payments[index].doubledForNegativeScore,
  }));

  return {
    baseBid,
    lines,
    winnerBonusApplied,
    winner: {
      playerId: rankings[0].playerId,
      playerName: rankings[0].playerName,
    },
  };
}

/**
 * Verify that settlement is balanced (sums to zero)
 */
export function verifySettlementBalance(settlement: FinalSettlement): boolean {
  const sum = settlement.lines.reduce(
    (acc, line) => acc + line.settlementAmountTenths,
    0
  );
  return sum === 0;
}

/**
 * Format settlement amount for display
 * @param amountTenths - Amount in tenths
 * @returns Formatted string like "+12.0" or "-2.0"
 */
export function formatSettlementAmount(amountTenths: number): string {
  const whole = Math.floor(Math.abs(amountTenths) / 10);
  const decimal = Math.abs(amountTenths) % 10;
  const sign = amountTenths >= 0 ? "+" : "-";
  return `${sign}${whole}.${decimal}`;
}
