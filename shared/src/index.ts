/**
 * Call Break Scorekeeper - Shared Module
 * Exports all types, schemas, and domain logic
 */

// Types
export * from "./types";

// Multi-device roles, submissions and redaction
export * from "./multiplayer";

// Validation
export * from "./schemas";

// Domain Logic
export * from "./scoring";
export * from "./settlement";
export * from "./ranking";

// Re-export commonly used items
export {
  calculateRoundScore,
  validateRound,
  calculateGameTotals,
} from "./scoring";

export {
  calculateFinalSettlement,
  verifySettlementBalance,
  formatSettlementAmount,
} from "./settlement";

export {
  calculateRankings,
  hasRankingTie,
  getNumericRankings,
} from "./ranking";
