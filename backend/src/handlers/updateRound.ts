/**
 * Lambda handler for updating a round
 * PUT /games/{gameId}/rounds/{roundNumber}
 */

import { APIGatewayProxyHandler } from "aws-lambda";
import { gameService } from "../services/GameService";
import { validateUpdateRound, ValidationError } from "../validation";
import { createLambdaResponse, createErrorLambdaResponse, successResponse } from "../utils/responses";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const gameId = event.pathParameters?.gameId;
    const roundNumber = event.pathParameters?.roundNumber
      ? parseInt(event.pathParameters.roundNumber)
      : null;

    if (!gameId || !roundNumber) {
      return createErrorLambdaResponse(
        400,
        "Game ID and round number are required",
        "MISSING_PARAMETERS"
      );
    }
    const hostToken = event.headers["x-host-token"] || event.headers["X-Host-Token"];

    // Parse request body
    const body = JSON.parse(event.body || "{}");

    // Validate input
    validateUpdateRound(body, roundNumber);

    // Update round
    const game = await gameService.updateRound(
      gameId,
      roundNumber,
      body.players,
      hostToken
    );

    return createLambdaResponse(200, successResponse(game));
  } catch (error) {
    console.error("Error updating round:", error);

    if (error instanceof ValidationError) {
      return createErrorLambdaResponse(error.code === "UNAUTHORIZED" ? 403 : 400, error.message, error.code);
    }

    return createErrorLambdaResponse(
      500,
      "Failed to update round",
      "INTERNAL_ERROR"
    );
  }
};
