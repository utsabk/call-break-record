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
    if (!gameId) {
      return createErrorLambdaResponse(400, "Game ID is required", "MISSING_GAME_ID");
    }
    const hostToken = event.headers["x-host-token"] || event.headers["X-Host-Token"];

    const game = await gameService.completeGame(gameId, hostToken);
    return createLambdaResponse(200, successResponse(game));
  } catch (error) {
    console.error("Error completing game:", error);
    if (error instanceof ValidationError) {
      return createErrorLambdaResponse(error.code === "UNAUTHORIZED" ? 403 : 400, error.message, error.code);
    }
    return createErrorLambdaResponse(500, "Failed to complete game", "INTERNAL_ERROR");
  }
};
