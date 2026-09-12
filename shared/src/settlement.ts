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
 * Tie support:
 * - 1st + 2nd tied: both are winners, split the pot equally
 * - 2nd + 3rd tied: 1st is sole winner, 2nd and 3rd split their combined costs
 * - 3rd + 4th tied: 1st is sole winner, 2nd is sole 2nd, 3rd and 4th split their combined costs
 *
 * Total always equals zero
 */

import type { RankingResult, TieScenario } from "./ranking";
import { getTieScenario } from "./ranking";

export interface SettlementLine {
  playerId: string;
  playerName: string;
  rank: number | "TIE";
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
  /** The winners when there's a tie. For a 1st/2nd tie, this contains both. */
  winners?: Array<{
    playerId: string;
    playerName: string;
  }>;
  /** The detected tie scenario, if any */
  tieScenario?: TieScenario;
}

/** Rank 2, 3 and 4 pay these multiples of the base bid. The winner collects. */
const PAY_MULTIPLIERS = [0, 1, 2, 3];

/** A winner on 20.0 points or more doubles what everyone else pays. */
export const WINNER_BONUS_THRESHOLD_TENTHS = 200;

/**
 * Calculate final settlement amounts based on ranking
 * @param rankings - Array of players sorted by score descending (can be from calculateRankings)
 * @param baseBid - Settlement base bid value
 * @returns Settlement with amounts for each player
 *
 * Supports three tie scenarios:
 * 1. 1st + 2nd tied: both winners split the pot collected from ranks 3 and 4 half/half
 * 2. 2nd + 3rd tied: 1st is sole winner, tied pair splits their combined cost
 * 3. 3rd + 4th tied: 1st is sole winner, tied pair splits their combined cost
 *
 * Examples with baseBid=2 (no doubling):
 * No tie: Rank 1: +120, Rank 2: -20, Rank 3: -40, Rank 4: -60
 * 1st+2nd tied: Rank 1: +50, Rank 2: +50, Rank 3: -40, Rank 4: -60
 * 2nd+3rd tied: Rank 1: +240 (bonus), Rank 2: -60, Rank 3: -60, Rank 4: -120 (bonus)
 * 3rd+4th tied: Rank 1: +240 (bonus), Rank 2: -40, Rank 3: -100, Rank 4: -100
 */
export function calculateFinalSettlement(
  rankings: Array<{
    playerId: string;
    playerName: string;
    totalScoreTenths: number;
    rank?: number; // optional, added by calculateRankings
    isTied?: boolean; // optional, added by calculateRankings
  }>,
  baseBid: number
): FinalSettlement {
  // Detect tie scenario
  const rankingsWithTies = rankings as any[] as RankingResult[];
  const tieScenario = getTieScenario(rankingsWithTies);

  // Determine if anyone qualifies for the winner bonus
  const winnerScoreTenths = rankings[0]?.totalScoreTenths ?? 0;
  const winnerBonusApplied = winnerScoreTenths >= WINNER_BONUS_THRESHOLD_TENTHS;

  // Helper to apply doubling rules
  const applyDoublingRules = (amount: number, playerScoreTenths: number, winnerBonus: boolean): { amount: number; doubled: boolean } => {
    let result = amount;
    let doubled = false;
    if (playerScoreTenths < 0) {
      result *= 2;
      doubled = true;
    }
    if (winnerBonus) {
      result *= 2;
    }
    return { amount: result, doubled };
  };

  let lines: SettlementLine[] = [];

  if (tieScenario === "FIRST_SECOND") {
    // 1st and 2nd are tied, both are 1st-place winners sharing the pot equally
    // Calculate what ranks 3 and 4 pay (with doubling rules applied if negative score or winner bonus)
    
    let rank3CostTenths = (PAY_MULTIPLIERS[2] ?? 0) * baseBid * 10;
    if (rankings[2].totalScoreTenths < 0) rank3CostTenths *= 2;
    if (winnerBonusApplied) rank3CostTenths *= 2;
    
    let rank4CostTenths = (PAY_MULTIPLIERS[3] ?? 0) * baseBid * 10;
    if (rankings[3].totalScoreTenths < 0) rank4CostTenths *= 2;
    if (winnerBonusApplied) rank4CostTenths *= 2;
    
    // Total pot collected from ranks 3 and 4
    const totalPotTenths = rank3CostTenths + rank4CostTenths;
    const player1Collection = Math.floor(totalPotTenths / 2);
    const player2Collection = totalPotTenths - player1Collection;

    lines = [
      {
        playerId: rankings[0].playerId,
        playerName: rankings[0].playerName,
        rank: "TIE",
        settlementAmountTenths: player1Collection,
        finalScoreTenths: rankings[0].totalScoreTenths,
        doubledForNegativeScore: false,
      },
      {
        playerId: rankings[1].playerId,
        playerName: rankings[1].playerName,
        rank: "TIE",
        settlementAmountTenths: player2Collection,
        finalScoreTenths: rankings[1].totalScoreTenths,
        doubledForNegativeScore: false,
      },
      {
        playerId: rankings[2].playerId,
        playerName: rankings[2].playerName,
        rank: 3,
        settlementAmountTenths: -rank3CostTenths,
        finalScoreTenths: rankings[2].totalScoreTenths,
        doubledForNegativeScore: rankings[2].totalScoreTenths < 0,
      },
      {
        playerId: rankings[3].playerId,
        playerName: rankings[3].playerName,
        rank: 4,
        settlementAmountTenths: -rank4CostTenths,
        finalScoreTenths: rankings[3].totalScoreTenths,
        doubledForNegativeScore: rankings[3].totalScoreTenths < 0,
      },
    ];
  } else if (tieScenario === "SECOND_THIRD") {
    // 2nd and 3rd are tied, 1st is sole winner
    // 1st collects all payments from ranks 2, 3, 4
    // 2nd and 3rd each pay half of their combined rank payment
    
    // Calculate rank 2 payment (what tied players 2&3 each split)
    let rank2CostTenths = (PAY_MULTIPLIERS[1] ?? 0) * baseBid * 10;
    if (winnerBonusApplied) rank2CostTenths *= 2;
    
    // Calculate rank 3 payment (what tied players 2&3 each split)
    let rank3CostTenths = (PAY_MULTIPLIERS[2] ?? 0) * baseBid * 10;
    if (winnerBonusApplied) rank3CostTenths *= 2;
    
    // Calculate rank 4 payment (what sole rank 4 pays)
    let rank4CostTenths = (PAY_MULTIPLIERS[3] ?? 0) * baseBid * 10;
    if (rankings[3].totalScoreTenths < 0) rank4CostTenths *= 2;
    if (winnerBonusApplied) rank4CostTenths *= 2;
    
    // Tied players 2&3 split their combined cost
    const tiedCombinedCost = rank2CostTenths + rank3CostTenths;
    const tiedIndividualCost = Math.floor(tiedCombinedCost / 2);
    
    // Winner collects from all three payers
    const winnerCollection = tiedIndividualCost + tiedIndividualCost + rank4CostTenths;

    lines = [
      {
        playerId: rankings[0].playerId,
        playerName: rankings[0].playerName,
        rank: 1,
        settlementAmountTenths: winnerCollection,
        finalScoreTenths: rankings[0].totalScoreTenths,
        doubledForNegativeScore: false,
      },
      {
        playerId: rankings[1].playerId,
        playerName: rankings[1].playerName,
        rank: "TIE",
        settlementAmountTenths: -tiedIndividualCost,
        finalScoreTenths: rankings[1].totalScoreTenths,
        doubledForNegativeScore: false,
      },
      {
        playerId: rankings[2].playerId,
        playerName: rankings[2].playerName,
        rank: "TIE",
        settlementAmountTenths: -tiedIndividualCost,
        finalScoreTenths: rankings[2].totalScoreTenths,
        doubledForNegativeScore: false,
      },
      {
        playerId: rankings[3].playerId,
        playerName: rankings[3].playerName,
        rank: 4,
        settlementAmountTenths: -rank4CostTenths,
        finalScoreTenths: rankings[3].totalScoreTenths,
        doubledForNegativeScore: rankings[3].totalScoreTenths < 0,
      },
    ];
  } else if (tieScenario === "THIRD_FOURTH") {
    // 3rd and 4th are tied, 1st is sole winner, 2nd is sole rank 2
    // 1st collects all payments from ranks 2, 3, 4
    // 3rd and 4th each pay half of their combined rank payment
    
    // Calculate rank 2 payment (what sole rank 2 pays)
    let rank2CostTenths = (PAY_MULTIPLIERS[1] ?? 0) * baseBid * 10;
    if (winnerBonusApplied) rank2CostTenths *= 2;
    
    // Calculate rank 3 payment (what tied players 3&4 each split)
    let rank3CostTenths = (PAY_MULTIPLIERS[2] ?? 0) * baseBid * 10;
    if (winnerBonusApplied) rank3CostTenths *= 2;
    
    // Calculate rank 4 payment (what tied players 3&4 each split)
    let rank4CostTenths = (PAY_MULTIPLIERS[3] ?? 0) * baseBid * 10;
    if (winnerBonusApplied) rank4CostTenths *= 2;
    
    // Tied players 3&4 split their combined cost
    const tiedCombinedCost = rank3CostTenths + rank4CostTenths;
    const tiedIndividualCost = Math.floor(tiedCombinedCost / 2);
    
    // Winner collects from all three payers
    const winnerCollection = rank2CostTenths + tiedIndividualCost + tiedIndividualCost;

    lines = [
      {
        playerId: rankings[0].playerId,
        playerName: rankings[0].playerName,
        rank: 1,
        settlementAmountTenths: winnerCollection,
        finalScoreTenths: rankings[0].totalScoreTenths,
        doubledForNegativeScore: false,
      },
      {
        playerId: rankings[1].playerId,
        playerName: rankings[1].playerName,
        rank: 2,
        settlementAmountTenths: -rank2CostTenths,
        finalScoreTenths: rankings[1].totalScoreTenths,
        doubledForNegativeScore: false,
      },
      {
        playerId: rankings[2].playerId,
        playerName: rankings[2].playerName,
        rank: "TIE",
        settlementAmountTenths: -tiedIndividualCost,
        finalScoreTenths: rankings[2].totalScoreTenths,
        doubledForNegativeScore: false,
      },
      {
        playerId: rankings[3].playerId,
        playerName: rankings[3].playerName,
        rank: "TIE",
        settlementAmountTenths: -tiedIndividualCost,
        finalScoreTenths: rankings[3].totalScoreTenths,
        doubledForNegativeScore: false,
      },
    ];
  } else {
    // No tie - use standard settlement
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

    lines = rankings.map((ranking, index) => ({
      playerId: ranking.playerId,
      playerName: ranking.playerName,
      rank: index + 1,
      settlementAmountTenths: index === 0 ? potTenths : -payments[index].amountTenths,
      finalScoreTenths: ranking.totalScoreTenths,
      doubledForNegativeScore: payments[index].doubledForNegativeScore,
    }));
  }

  return {
    baseBid,
    lines,
    winnerBonusApplied,
    winner: {
      playerId: rankings[0].playerId,
      playerName: rankings[0].playerName,
    },
    tieScenario,
    winners: tieScenario === "FIRST_SECOND" 
      ? [
          { playerId: rankings[0].playerId, playerName: rankings[0].playerName },
          { playerId: rankings[1].playerId, playerName: rankings[1].playerName },
        ]
      : undefined,
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
