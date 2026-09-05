import { APIGatewayProxyHandler } from "aws-lambda";
import { gameService } from "../services/GameService";
import { ValidationError } from "../validation";
import { createErrorLambdaResponse, createLambdaResponse, successResponse } from "../utils/responses";
import { readHostToken } from "../utils/requestContext";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const gameId = event.pathParameters?.gameId;
    const roundNumber = Number(event.pathParameters?.roundNumber);
    if (!gameId || !Number.isInteger(roundNumber)) {
      return createErrorLambdaResponse(400, "Game and round are required", "MISSING_PARAMETERS");
    }

    const view = await gameService.completeRound(gameId, roundNumber, readHostToken(event.headers));
    return createLambdaResponse(200, successResponse(view));
  } catch (error) {
    console.error("Error completing round:", error);
    if (error instanceof ValidationError) {
      const statusCode = error.code === "UNAUTHORIZED" ? 403 : error.code === "NOT_FOUND" ? 404 : 409;
      return createErrorLambdaResponse(statusCode, error.message, error.code);
    }
    return createErrorLambdaResponse(500, "Could not score the round", "INTERNAL_ERROR");
  }
};
