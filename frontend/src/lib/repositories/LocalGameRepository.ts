/**
 * Local game repository using IndexedDB
 * Provides offline-first persistence for active games
 */

import { Game } from "@call-break/shared";

const DB_NAME = "CallBreakDB";
const DB_VERSION = 1;
const STORE_NAME = "games";

export interface IGameRepository {
  createGame(game: Game): Promise<void>;
  getGame(gameId: string): Promise<Game | undefined>;
  updateGame(game: Game): Promise<void>;
  listGames(): Promise<Game[]>;
  deleteGame(gameId: string): Promise<void>;
  getActiveGame(): Promise<Game | null>;
  setActiveGame(gameId: string | null): Promise<void>;
}

class LocalGameRepository implements IGameRepository {
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
    });
  }

  async createGame(game: Game): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(game);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getGame(gameId: string): Promise<Game | undefined> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(gameId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async updateGame(game: Game): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(game);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async listGames(): Promise<Game[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteGame(gameId: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(gameId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getActiveGame(): Promise<Game | null> {
    const games = await this.listGames();
    // Return the first non-completed game
    const activeGame = games.find((g) => g.status === "ACTIVE");
    return activeGame || null;
  }

  async setActiveGame(gameId: string | null): Promise<void> {
    // For now, this is handled by the game status
    // A more sophisticated implementation could track this separately
    void gameId;
  }

  private async getDb(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error("IndexedDB not initialized");
    }
    return this.db;
  }
}

export const localGameRepository = new LocalGameRepository();
