/**
 * Validation utilities for backend
 * Ensures strict validation of all input data
 */

import { PunishmentReason, CreateGameRequest, UpdateRoundRequest } from "@call-break/shared";

export class ValidationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateCreateGame(data: unknown): CreateGameRequest {
  try {
    // Validate exactly 4 players
    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray((data as { players?: unknown }).players) ||
      (data as { players: unknown[] }).players.length !== 4
    ) {
      throw new ValidationError(
        "Game must have exactly 4 players",
        "INVALID_PLAYER_COUNT"
      );
    }

    // Validate player names
    const players = (data as any).players;
    for (let i = 0; i < players.length; i++) {
      if (!players[i].name || typeof players[i].name !== "string") {
        throw new ValidationError(
          `Player ${i + 1} must have a valid name`,
          "INVALID_PLAYER_NAME"
        );
      }
      if (players[i].name.length === 0 || players[i].name.length > 50) {
        throw new ValidationError(
          `Player ${i + 1} name must be between 1 and 50 characters`,
          "INVALID_PLAYER_NAME_LENGTH"
        );
      }
    }

    // Validate rules
    const rules = (data as any).rules;
    if (!rules || typeof rules !== "object") {
      throw new ValidationError("Rules must be provided", "INVALID_RULES");
    }

    if (typeof rules.rounds !== "number" || rules.rounds !== 5) {
      throw new ValidationError(
        "Game must have exactly 5 rounds",
        "INVALID_ROUND_COUNT"
      );
    }

    if (typeof rules.baseBid !== "number" || rules.baseBid < 1) {
      throw new ValidationError("Base bid must be a positive number", "INVALID_BASE_BID");
    }

    return data as CreateGameRequest;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(
      "Invalid create game request",
      "VALIDATION_ERROR"
    );
  }
}

export function validateUpdateRound(data: unknown, roundNumber: number): UpdateRoundRequest {
  try {
    const roundData = data as any;
    
    if (!Array.isArray(roundData.players) || roundData.players.length !== 4) {
      throw new ValidationError(
        "Round must have exactly 4 players",
        "INVALID_PLAYER_COUNT"
      );
    }

    // Validate each player's data
    const players: Array<{ bid: number; tricksWon: number }> = [];
    for (let i = 0; i < roundData.players.length; i++) {
      const p = roundData.players[i];
      
      if (typeof p.bid !== "number" || p.bid < 1 || p.bid > 13) {
        throw new ValidationError(
          `Player ${i + 1} bid must be between 1 and 13`,
          "INVALID_BID"
        );
      }

      if (typeof p.tricksWon !== "number" || p.tricksWon < 0 || p.tricksWon > 13) {
        throw new ValidationError(
          `Player ${i + 1} tricks must be between 0 and 13`,
          "INVALID_TRICKS"
        );
      }

      if (p.punished !== undefined && typeof p.punished !== "boolean") {
        throw new ValidationError(`Player ${i + 1} punishment status is invalid`, "INVALID_PUNISHMENT");
      }

      if (p.punishmentReason !== undefined && !Object.values(PunishmentReason).includes(p.punishmentReason)) {
        throw new ValidationError(`Player ${i + 1} punishment reason is invalid`, "INVALID_PUNISHMENT");
      }

      players.push({ bid: p.bid, tricksWon: p.tricksWon });
    }

    // Validate tricks total
    const totalTricks = players.reduce((sum, p) => sum + p.tricksWon, 0);
    if (totalTricks !== 13) {
      throw new ValidationError(
        `Total tricks must equal 13 (got ${totalTricks})`,
        "INVALID_TRICKS_TOTAL"
      );
    }

    return roundData as UpdateRoundRequest;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(
      "Invalid round data",
      "VALIDATION_ERROR"
    );
  }
}

export function validateMarkPunished(data: unknown): {
  reason: PunishmentReason;
  note?: string;
} {
  try {
    const punishmentData = data as any;

    if (!punishmentData.reason) {
      throw new ValidationError(
        "Punishment reason is required",
        "MISSING_REASON"
      );
    }

    const validReasons = Object.values(PunishmentReason);
    if (!validReasons.includes(punishmentData.reason)) {
      throw new ValidationError(
        "Invalid punishment reason",
        "INVALID_REASON"
      );
    }

    if (
      punishmentData.note &&
      typeof punishmentData.note !== "string"
    ) {
      throw new ValidationError("Note must be a string", "INVALID_NOTE");
    }

    if (punishmentData.note && punishmentData.note.length > 500) {
      throw new ValidationError(
        "Note must be less than 500 characters",
        "NOTE_TOO_LONG"
      );
    }

    return {
      reason: punishmentData.reason,
      note: punishmentData.note,
    };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(
      "Invalid punishment data",
      "VALIDATION_ERROR"
    );
  }
}
