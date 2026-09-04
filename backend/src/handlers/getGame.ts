/**
 * Lambda handler for getting a game
 * GET /games/{gameId}
 */

import { APIGatewayProxyHandler } from "aws-lambda";
import { gameService } from "../services/GameService";
import { ValidationError } from "../validation";
import { createLambdaResponse, createErrorLambdaResponse, successResponse } from "../utils/responses";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const gameId = event.pathParameters?.gameId;

    if (!gameId) {
      return createErrorLambdaResponse(400, "Game ID is required", "MISSING_GAME_ID");
    }

    // Get game
    const game = await gameService.getGame(gameId);

    return createLambdaResponse(200, successResponse(game));
  } catch (error) {
    console.error("Error getting game:", error);

    if (error instanceof ValidationError) {
      const statusCode = error.code === "NOT_FOUND" ? 404 : 400;
      return createErrorLambdaResponse(statusCode, error.message, error.code);
    }

    return createErrorLambdaResponse(
      500,
      "Failed to get game",
      "INTERNAL_ERROR"
    );
  }
};
