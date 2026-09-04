import { APIGatewayProxyHandler } from "aws-lambda";
import { gameService } from "../services/GameService";
import { ValidationError } from "../validation";
import {
  createErrorLambdaResponse,
  createLambdaResponse,
  successResponse,
} from "../utils/responses";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const gameId = event.pathParameters?.gameId;
    const playerId = event.pathParameters?.playerId;
    const roundNumber = Number(event.pathParameters?.roundNumber);

    if (!gameId || !playerId || !Number.isInteger(roundNumber)) {
      return createErrorLambdaResponse(400, "Game ID, round number, and player ID are required", "MISSING_PARAMETERS");
    }
    const hostToken = event.headers["x-host-token"] || event.headers["X-Host-Token"];

    const game = await gameService.removePunishment(gameId, roundNumber, playerId, hostToken);
    return createLambdaResponse(200, successResponse(game));
  } catch (error) {
    console.error("Error removing punishment:", error);
    if (error instanceof ValidationError) {
      return createErrorLambdaResponse(error.code === "UNAUTHORIZED" ? 403 : 400, error.message, error.code);
    }
    return createErrorLambdaResponse(500, "Failed to remove punishment", "INTERNAL_ERROR");
  }
};
