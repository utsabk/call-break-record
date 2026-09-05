import { APIGatewayProxyHandler } from "aws-lambda";
import { gameService } from "../services/GameService";
import { ValidationError } from "../validation";
import { createErrorLambdaResponse, createLambdaResponse, successResponse } from "../utils/responses";
import { readHostToken, readSessionId } from "../utils/requestContext";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const gameId = event.pathParameters?.gameId;
    const roundNumber = Number(event.pathParameters?.roundNumber);
    if (!gameId || !Number.isInteger(roundNumber)) {
      return createErrorLambdaResponse(400, "Game and round are required", "MISSING_PARAMETERS");
    }

    const body = JSON.parse(event.body || "{}") as {
      playerId?: string;
      bid?: number;
      tricksWon?: number;
      punished?: boolean;
    };

    const view = await gameService.setRoundEntry(
      gameId,
      roundNumber,
      {
        ...(typeof body.playerId === "string" ? { playerId: body.playerId } : {}),
        ...(body.bid === undefined || body.bid === null ? {} : { bid: Number(body.bid) }),
        ...(body.tricksWon === undefined || body.tricksWon === null ? {} : { tricksWon: Number(body.tricksWon) }),
        ...(typeof body.punished === "boolean" ? { punished: body.punished } : {}),
      },
      readSessionId(event.headers),
      readHostToken(event.headers)
    );

    return createLambdaResponse(200, successResponse(view));
  } catch (error) {
    console.error("Error saving round entry:", error);
    if (error instanceof ValidationError) {
      const unauthorised = error.code === "NOT_A_PLAYER" || error.code === "NOT_YOUR_SEAT" || error.code === "UNAUTHORIZED";
      const statusCode = unauthorised ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return createErrorLambdaResponse(statusCode, error.message, error.code);
    }
    return createErrorLambdaResponse(500, "Could not save your entry", "INTERNAL_ERROR");
  }
};
