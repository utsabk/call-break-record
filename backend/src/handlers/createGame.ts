/**
 * Lambda handler for creating a new game
 * POST /games
 */

import { APIGatewayProxyHandler } from "aws-lambda";
import { gameService } from "../services/GameService";
import { validateCreateGame, ValidationError } from "../validation";
import { createLambdaResponse, createErrorLambdaResponse, successResponse } from "../utils/responses";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // Parse request body
    const body = JSON.parse(event.body || "{}");

    // Validate input
    const validatedData = validateCreateGame(body);

    // Create game
    const createdGame = await gameService.createGame(
      validatedData.players as any,
      validatedData.rules
    );

    return createLambdaResponse(201, successResponse(createdGame));
  } catch (error) {
    console.error("Error creating game:", error);

    if (error instanceof ValidationError) {
      return createErrorLambdaResponse(400, error.message, error.code);
    }

    return createErrorLambdaResponse(
      500,
      "Failed to create game",
      "INTERNAL_ERROR"
    );
  }
};
