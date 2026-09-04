/**
 * Game state management using Zustand
 * Handles game logic, scoring, and UI state
 */

import { create } from "zustand";
import { Game, Player, Round, PlayerRound, GameRules, GameStatus, PunishmentReason, calculateRoundScore, validateRound, calculateGameTotals } from "@call-break/shared";
import { apiGameRepository } from "../repositories/ApiGameRepository";

interface GameStore {
  // State
  currentGame: Game | null;
  isLoading: boolean;
  error: string | null;

  // Game setup
  createNewGame: (players: Player[], rules: GameRules) => Promise<Game>;
  loadGame: (gameId: string) => Promise<void>;
  loadGameByCode: (gameCode: string) => Promise<void>;
  loadActiveGame: () => Promise<void>;

  // Round management
  saveRound: (roundNumber: number, players: PlayerRound[]) => Promise<Game>;
  updateRound: (roundNumber: number, players: PlayerRound[]) => Promise<void>;
  markPunished: (roundNumber: number, playerId: string, reason: string, note?: string) => Promise<Game>;
  removePunishment: (roundNumber: number, playerId: string) => Promise<Game>;

  // Game completion
  completeGame: () => Promise<Game>;
  deleteGame: (gameId: string) => Promise<void>;

  // Calculated values
  getGameTotals: () => { [playerId: string]: number };
  getCurrentRound: () => Round | null;
}

export const useGameStore = create<GameStore>((set, get) => ({
  currentGame: null,
  isLoading: false,
  error: null,

  createNewGame: async (players: Player[], rules: GameRules) => {
    set({ isLoading: true, error: null });
    try {
      const newGame = await apiGameRepository.createGame(players, rules);
      set({ currentGame: newGame, isLoading: false });
      return newGame;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the game. Check your connection and try again.";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  loadGame: async (gameId: string) => {
    set({ isLoading: true, error: null });
    try {
      const game = await apiGameRepository.getGame(gameId);
      set({ currentGame: game, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load game",
        isLoading: false,
      });
    }
  },

  loadGameByCode: async (gameCode: string) => {
    set({ isLoading: true, error: null });
    try {
      const game = await apiGameRepository.getGameByCode(gameCode);
      set({ currentGame: game, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Game not found";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  loadActiveGame: async () => {
    set({ isLoading: true, error: null });
    try {
      const games = await apiGameRepository.listGames();
      const game = games.find((candidate) => candidate.status === GameStatus.ACTIVE) || null;
      set({ currentGame: game, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load active game",
        isLoading: false,
      });
    }
  },

  saveRound: async (roundNumber: number, players: PlayerRound[]) => {
    set({ isLoading: true, error: null });
    try {
      const game = get().currentGame;
      if (!game) throw new Error("No active game");

      // Validate round
      const validationErrors = validateRound(
        players.map((p) => ({ bid: p.bid, tricksWon: p.tricksWon }))
      );
      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0].message);
      }

      // Calculate scores
      const playerRounds: PlayerRound[] = players.map((p) => {
        const { scoreTenths } = calculateRoundScore(p.bid, p.tricksWon, p.punished);
        return {
          ...p,
          scoreTenths,
        };
      });

      const updatedGame = await apiGameRepository.updateRound(game.id, roundNumber, playerRounds);
      set({ currentGame: updatedGame, isLoading: false });
      return updatedGame;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save round. Try again.";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateRound: async (roundNumber: number, players: PlayerRound[]) => {
    // Similar to saveRound but for editing
    await get().saveRound(roundNumber, players);
  },

  markPunished: async (roundNumber: number, playerId: string, reason: string, note?: string) => {
    set({ isLoading: true, error: null });
    try {
      const game = get().currentGame;
      if (!game) throw new Error("No active game");

      const updatedGame = await apiGameRepository.markPunished(game.id, roundNumber, playerId, reason as PunishmentReason, note);
      set({ currentGame: updatedGame, isLoading: false });
      return updatedGame;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save punishment. Try again.";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  removePunishment: async (roundNumber: number, playerId: string) => {
    set({ isLoading: true, error: null });
    try {
      const game = get().currentGame;
      if (!game) throw new Error("No active game");

      const updatedGame = await apiGameRepository.removePunishment(game.id, roundNumber, playerId);
      set({ currentGame: updatedGame, isLoading: false });
      return updatedGame;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not remove punishment. Try again.";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  completeGame: async () => {
    set({ isLoading: true, error: null });
    try {
      const game = get().currentGame;
      if (!game) throw new Error("No active game");

      // Check all rounds are completed
      const allRoundsComplete = game.rounds.every((r) => r.status === "COMPLETED");
      if (!allRoundsComplete) {
        throw new Error("All rounds must be completed before finishing the game");
      }

      const updatedGame = await apiGameRepository.completeGame(game.id);
      set({ currentGame: updatedGame, isLoading: false });
      return updatedGame;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete game. Try again.";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  deleteGame: async (gameId: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiGameRepository.deleteGame(gameId);
      if (get().currentGame?.id === gameId) set({ currentGame: null, isLoading: false });
      else set({ isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete game. Try again.";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  getGameTotals: () => {
    const game = get().currentGame;
    if (!game) return {};

    const scores: Array<{ playerId: string; scoreTenths: number }> = [];
    for (const round of game.rounds) {
      for (const player of round.players) {
        scores.push({
          playerId: player.playerId,
          scoreTenths: player.scoreTenths,
        });
      }
    }

    return calculateGameTotals(scores);
  },

  getCurrentRound: () => {
    const game = get().currentGame;
    if (!game) return null;

    // Return the first active round, or the last completed round
    let currentRound = game.rounds.find((r) => r.status === "ACTIVE");
    if (!currentRound && game.rounds.length > 0) {
      currentRound = game.rounds[game.rounds.length - 1];
    }
    return currentRound || null;
  },
}));
