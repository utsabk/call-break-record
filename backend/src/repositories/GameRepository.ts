/**
 * DynamoDB Game Repository
 * Handles persistence of games in DynamoDB
 */

import { DynamoDB } from "aws-sdk";
import { EntrySource, Game, GameSession, GameStatus, RoundEntry } from "@call-break/shared";

type StoredGame = Game & { hostToken?: string };
export type StoredSession = GameSession;

const dynamodb = new DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const TABLE_NAME = process.env.DYNAMODB_TABLE || "CallBreakGames";
const GAME_RETENTION_HOURS = 24;

/** A code never moves to another game, so a resolved id is reusable for the container's life. */
const gameIdByCode = new Map<string, string>();

/** DynamoDB TTL expects epoch seconds; games are purged a day after they are created. */
function expiresAt(from: Date = new Date()): number {
  return Math.floor(from.getTime() / 1000) + GAME_RETENTION_HOURS * 60 * 60;
}

function toGame(item: DynamoDB.DocumentClient.AttributeMap): Game {
  return {
    id: item.gameId,
    gameCode: item.gameCode,
    players: item.players,
    rules: item.rules,
    rounds: item.rounds,
    status: item.status,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  };
}

function toRoundEntry(item: DynamoDB.DocumentClient.AttributeMap): RoundEntry {  return {
    playerId: item.playerId as string,
    ...(typeof item.bid === "number" ? { bid: item.bid } : {}),
    ...(typeof item.tricksWon === "number" ? { tricksWon: item.tricksWon } : {}),
    ...(typeof item.punished === "boolean" ? { punished: item.punished } : {}),
    ...(item.bidSource ? { bidSource: item.bidSource as EntrySource } : {}),
    ...(item.tricksSource ? { tricksSource: item.tricksSource as EntrySource } : {}),
    ...(item.updatedAt ? { updatedAt: new Date(item.updatedAt as string) } : {}),
  };
}

export interface IGameRepository {
  createGame(game: StoredGame): Promise<void>;
  getGame(gameId: string): Promise<Game | null>;
  updateGame(game: Game): Promise<void>;
  deleteGame(gameId: string): Promise<void>;
  listGames(limit?: number): Promise<Game[]>;
  listGamesByStatus(status: GameStatus, limit?: number): Promise<Game[]>;
  getGameByCode(gameCode: string): Promise<Game | null>;
  getHostToken(gameId: string): Promise<string | null>;
}

export class DynamoDBGameRepository implements IGameRepository {
  async createGame(game: StoredGame): Promise<void> {
    try {
      await dynamodb
        .put({
          TableName: TABLE_NAME,
          Item: {
            PK: `GAME#${game.id}`,
            SK: `METADATA#${game.id}`,
            entityType: "GAME",
            gameId: game.id,
            gameCode: game.gameCode,
            hostToken: game.hostToken,
            status: game.status,
            createdAt: game.createdAt.toISOString(),
            updatedAt: game.updatedAt.toISOString(),
            players: game.players,
            rules: game.rules,
            rounds: game.rounds,
            expiresAt: expiresAt(game.createdAt),
          },
        })
        .promise();
    } catch (error) {
      console.error("Error creating game:", error);
      throw error;
    }
  }

  async getGame(gameId: string): Promise<Game | null> {
    try {
      const result = await dynamodb
        .get({
          TableName: TABLE_NAME,
          Key: {
            PK: `GAME#${gameId}`,
            SK: `METADATA#${gameId}`,
          },
          // A game read straight after a round is saved must never be a stale copy.
          ConsistentRead: true,
        })
        .promise();

      if (!result.Item) {
        return null;
      }

      return toGame(result.Item);
    } catch (error) {
      console.error("Error getting game:", error);
      throw error;
    }
  }

  /**
   * Metadata and seat items are adjacent in the sort key, so one query returns the game and its
   * claimed seats. Session items sort after seats and are deliberately outside the range.
   */
  async getGameBundle(
    gameId: string,
    consistent: boolean
  ): Promise<{ game: Game; hostToken?: string; claimedPlayerIds: string[] } | null> {
    const result = await dynamodb.query({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
      ExpressionAttributeValues: { ":pk": `GAME#${gameId}`, ":from": "METADATA#", ":to": "SEAT#\uffff" },
      ConsistentRead: consistent,
    }).promise();

    const items = result.Items || [];
    const metadata = items.find((item) => String(item.SK).startsWith("METADATA#"));
    if (!metadata) return null;

    return {
      game: toGame(metadata),
      ...(typeof metadata.hostToken === "string" ? { hostToken: metadata.hostToken } : {}),
      claimedPlayerIds: items.filter((item) => String(item.SK).startsWith("SEAT#")).map((item) => item.playerId as string),
    };
  }

  /**
   * The index only resolves the code to an id. Round and status data is then read from the
   * base table, because a global secondary index lags behind writes and would otherwise serve
   * a finished game as though it were still in progress.
   */
  async getGameIdByCode(gameCode: string): Promise<string | null> {
    const cached = gameIdByCode.get(gameCode);
    if (cached) return cached;

    const result = await dynamodb.query({
      TableName: TABLE_NAME,
      IndexName: "GameCodeIndex",
      KeyConditionExpression: "gameCode = :gameCode",
      ExpressionAttributeValues: { ":gameCode": gameCode },
      ProjectionExpression: "gameId",
      Limit: 1,
    }).promise();

    const gameId = result.Items?.[0]?.gameId;
    if (typeof gameId !== "string") return null;

    if (gameIdByCode.size > 500) gameIdByCode.clear();
    gameIdByCode.set(gameCode, gameId);
    return gameId;
  }

  async getGameByCode(gameCode: string): Promise<Game | null> {
    const gameId = await this.getGameIdByCode(gameCode);
    if (!gameId) return null;
    return this.getGame(gameId);
  }

  async getHostToken(gameId: string): Promise<string | null> {
    const result = await dynamodb.get({ TableName: TABLE_NAME, Key: { PK: `GAME#${gameId}`, SK: `METADATA#${gameId}` }, ProjectionExpression: "hostToken" }).promise();
    return typeof result.Item?.hostToken === "string" ? result.Item.hostToken : null;
  }

  async updateGame(game: Game): Promise<void> {
    try {
      await dynamodb
        .update({
          TableName: TABLE_NAME,
          Key: {
            PK: `GAME#${game.id}`,
            SK: `METADATA#${game.id}`,
          },
          UpdateExpression:
            "SET #status = :status, #updatedAt = :updatedAt, #rounds = :rounds",
          ExpressionAttributeNames: {
            "#status": "status",
            "#updatedAt": "updatedAt",
            "#rounds": "rounds",
          },
          ExpressionAttributeValues: {
            ":status": game.status,
            ":updatedAt": game.updatedAt.toISOString(),
            ":rounds": game.rounds,
          },
        })
        .promise();
    } catch (error) {
      console.error("Error updating game:", error);
      throw error;
    }
  }

  /** Removes the game outright: metadata plus every seat, session and submission it owns. */
  async deleteGame(gameId: string): Promise<void> {
    const keys: DynamoDB.DocumentClient.Key[] = [];
    let startKey: DynamoDB.DocumentClient.Key | undefined;

    do {
      const page = await dynamodb.query({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `GAME#${gameId}` },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: startKey,
      }).promise();
      for (const item of page.Items || []) keys.push({ PK: item.PK, SK: item.SK });
      startKey = page.LastEvaluatedKey;
    } while (startKey);

    if (keys.length === 0) return;

    for (let index = 0; index < keys.length; index += 25) {
      let unprocessed: DynamoDB.DocumentClient.BatchWriteItemRequestMap = {
        [TABLE_NAME]: keys.slice(index, index + 25).map((Key) => ({ DeleteRequest: { Key } })),
      };
      // BatchWrite can decline items under throttling, so retry until the partition is clear.
      while (Object.keys(unprocessed).length > 0) {
        const result = await dynamodb.batchWrite({ RequestItems: unprocessed }).promise();
        unprocessed = result.UnprocessedItems || {};
      }
    }
  }

  /** Returns false when another device already holds the seat. */
  async claimSeat(gameId: string, playerId: string, sessionId: string): Promise<boolean> {
    try {
      await dynamodb.put({
        TableName: TABLE_NAME,
        Item: {
          PK: `GAME#${gameId}`,
          SK: `SEAT#${playerId}`,
          gameId,
          playerId,
          sessionId,
          claimedAt: new Date().toISOString(),
          expiresAt: expiresAt(),
        },
        ConditionExpression: "attribute_not_exists(PK) OR sessionId = :sessionId",
        ExpressionAttributeValues: { ":sessionId": sessionId },
      }).promise();
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === "ConditionalCheckFailedException") return false;
      throw error;
    }
  }

  async listClaimedPlayerIds(gameId: string): Promise<string[]> {
    const result = await dynamodb.query({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `GAME#${gameId}`, ":sk": "SEAT#" },
    }).promise();
    return (result.Items || []).map((item) => item.playerId as string);
  }

  async releaseSeat(gameId: string, playerId: string): Promise<void> {
    await dynamodb.delete({
      TableName: TABLE_NAME,
      Key: { PK: `GAME#${gameId}`, SK: `SEAT#${playerId}` },
    }).promise();
  }

  async putSession(session: StoredSession): Promise<void> {
    await dynamodb.put({
      TableName: TABLE_NAME,
      Item: {
        PK: `GAME#${session.gameId}`,
        SK: `SESSION#${session.sessionId}`,
        ...session,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt(),
      },
    }).promise();
  }

  async getSession(gameId: string, sessionId: string): Promise<StoredSession | null> {
    const result = await dynamodb.get({
      TableName: TABLE_NAME,
      Key: { PK: `GAME#${gameId}`, SK: `SESSION#${sessionId}` },
    }).promise();
    if (!result.Item) return null;
    return {
      sessionId: result.Item.sessionId,
      gameId: result.Item.gameId,
      role: result.Item.role,
      playerId: result.Item.playerId,
    };
  }

  /**
   * Each player's entry is its own item, written field by field, so a bid and a trick
   * arriving at the same moment from different devices cannot overwrite each other.
   */
  async saveEntry(
    gameId: string,
    roundNumber: number,
    playerId: string,
    patch: { bid?: number; tricksWon?: number; punished?: boolean; source: EntrySource }
  ): Promise<void> {
    const names: Record<string, string> = { "#updatedAt": "updatedAt" };
    const values: Record<string, unknown> = {
      ":updatedAt": new Date().toISOString(),
      ":gameId": gameId,
      ":roundNumber": roundNumber,
      ":playerId": playerId,
      ":expiresAt": expiresAt(),
    };
    const assignments = ["#updatedAt = :updatedAt", "gameId = :gameId", "roundNumber = :roundNumber", "playerId = :playerId", "expiresAt = :expiresAt"];

    if (patch.bid !== undefined) {
      names["#bid"] = "bid";
      values[":bid"] = patch.bid;
      values[":bidSource"] = patch.source;
      assignments.push("#bid = :bid", "bidSource = :bidSource");
    }
    if (patch.tricksWon !== undefined) {
      names["#tricksWon"] = "tricksWon";
      values[":tricksWon"] = patch.tricksWon;
      values[":tricksSource"] = patch.source;
      assignments.push("#tricksWon = :tricksWon", "tricksSource = :tricksSource");
    }
    if (patch.punished !== undefined) {
      names["#punished"] = "punished";
      values[":punished"] = patch.punished;
      assignments.push("#punished = :punished");
    }

    await dynamodb.update({
      TableName: TABLE_NAME,
      Key: { PK: `GAME#${gameId}`, SK: `SUB#${roundNumber}#${playerId}` },
      UpdateExpression: `SET ${assignments.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }).promise();
  }

  async listEntries(gameId: string, roundNumber: number): Promise<RoundEntry[]> {
    const result = await dynamodb.query({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `GAME#${gameId}`, ":sk": `SUB#${roundNumber}#` },
      ConsistentRead: true,
    }).promise();
    return (result.Items || []).map(toRoundEntry);
  }

  async listAllEntries(gameId: string, consistent = true): Promise<Map<number, RoundEntry[]>> {
    const result = await dynamodb.query({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `GAME#${gameId}`, ":sk": "SUB#" },
      ConsistentRead: consistent,
    }).promise();

    const byRound = new Map<number, RoundEntry[]>();
    for (const item of result.Items || []) {
      const roundNumber = item.roundNumber as number;
      const entries = byRound.get(roundNumber) || [];
      entries.push(toRoundEntry(item));
      byRound.set(roundNumber, entries);
    }
    return byRound;
  }

  /** Conditional so concurrent reveal attempts produce exactly one state transition. */
  async revealRound(game: Game, roundNumber: number): Promise<boolean> {
    try {
      await dynamodb.update({
        TableName: TABLE_NAME,
        Key: { PK: `GAME#${game.id}`, SK: `METADATA#${game.id}` },
        UpdateExpression: "SET #rounds = :rounds, #updatedAt = :updatedAt ADD revealedRounds :round",
        ConditionExpression: "attribute_not_exists(revealedRounds) OR NOT contains(revealedRounds, :roundValue)",
        ExpressionAttributeNames: { "#rounds": "rounds", "#updatedAt": "updatedAt" },
        ExpressionAttributeValues: {
          ":rounds": game.rounds,
          ":updatedAt": game.updatedAt.toISOString(),
          ":round": dynamodb.createSet([String(roundNumber)]),
          ":roundValue": String(roundNumber),
        },
      }).promise();
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === "ConditionalCheckFailedException") return false;
      throw error;
    }
  }


  async listGames(limit: number = 100): Promise<Game[]> {
    try {
      const result = await dynamodb
        .query({
          TableName: TABLE_NAME,
          IndexName: "AllGamesIndex",
          KeyConditionExpression: "entityType = :entityType",
          ExpressionAttributeValues: {
            ":entityType": "GAME",
          },
          Limit: limit,
          ScanIndexForward: false, // Most recent first
        })
        .promise();

      return (result.Items || []).map((item: any) => ({
        id: item.gameId,
        gameCode: item.gameCode,
        players: item.players,
        rules: item.rules,
        rounds: item.rounds,
        status: item.status,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }));
    } catch (error) {
      console.error("Error listing games:", error);
      return [];
    }
  }

  async listGamesByStatus(
    status: GameStatus,
    limit: number = 100
  ): Promise<Game[]> {
    try {
      const result = await dynamodb
        .query({
          TableName: TABLE_NAME,
          IndexName: "StatusIndex",
          KeyConditionExpression: "#status = :status",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": status,
          },
          Limit: limit,
          ScanIndexForward: false,
        })
        .promise();

      return (result.Items || []).map((item: any) => ({
        id: item.gameId,
        gameCode: item.gameCode,
        players: item.players,
        rules: item.rules,
        rounds: item.rounds,
        status: item.status,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }));
    } catch (error) {
      console.error("Error listing games by status:", error);
      return [];
    }
  }
}

export const gameRepository = new DynamoDBGameRepository();
