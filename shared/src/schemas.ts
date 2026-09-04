import { z } from "zod";
import { PunishmentReason } from "./types";

/**
 * Validation schemas for Call Break Scorekeeper
 * Used by both frontend and backend
 */

export const PlayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50),
  seat: z.number().min(0).max(3),
});

export const GameRulesSchema = z.object({
  rounds: z.number().min(1).max(10),
  minimumCall: z.number().min(1),
  maximumCall: z.number().min(1),
  extraTrickBonus: z.number().min(0).max(1),
  punishmentMode: z.literal("NEGATIVE_CALL"),
  baseBid: z.number().min(1),
});

export const PlayerRoundSchema = z.object({
  playerId: z.string().min(1),
  bid: z.number().min(1).max(13),
  tricksWon: z.number().min(0).max(13),
  punished: z.boolean(),
  punishmentReason: z.nativeEnum(PunishmentReason).optional(),
  punishmentNote: z.string().max(500).optional(),
  scoreTenths: z.number().int(),
});

export const RoundSchema = z.object({
  roundNumber: z.number().min(1),
  players: z.array(PlayerRoundSchema),
  status: z.enum(["ACTIVE", "COMPLETED"]),
  completedAt: z.date().optional(),
});

export const CreateGameRequestSchema = z.object({
  players: z.array(PlayerSchema).length(4),
  rules: GameRulesSchema,
});

export const UpdateRoundRequestSchema = z.object({
  players: z.array(
    z.object({
      playerId: z.string().min(1),
      bid: z.number().min(1).max(13),
      tricksWon: z.number().min(0).max(13),
      punished: z.boolean().optional(),
      punishmentReason: z.nativeEnum(PunishmentReason).optional(),
    })
  ),
});

export const MarkPunishedRequestSchema = z.object({
  reason: z.nativeEnum(PunishmentReason),
  note: z.string().max(500).optional(),
});

export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>;
export type UpdateRoundRequest = z.infer<typeof UpdateRoundRequestSchema>;
export type MarkPunishedRequest = z.infer<typeof MarkPunishedRequestSchema>;
