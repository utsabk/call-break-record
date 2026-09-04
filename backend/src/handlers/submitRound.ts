import { APIGatewayProxyHandler } from "aws-lambda";
import { gameService } from "../services/GameService";
import { ValidationError } from "../validation";
import { createErrorLambdaResponse, createLambdaResponse, successResponse } from "../utils/responses";
import { readSessionId } from "../utils/requestContext";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const gameId = event.pathParameters?.gameId;
    const roundNumber = Number(event.pathParameters?.roundNumber);
    if (!gameId || !Number.isInteger(roundNumber)) {
      return createErrorLambdaResponse(400, "Game and round are required", "MISSING_PARAMETERS");
    }

    const body = JSON.parse(event.body || "{}") as { bid?: number; tricksWon?: number };
    const view = await gameService.submitPlayerRound(
      gameId,
      readSessionId(event.headers),
      roundNumber,
      Number(body.bid),
      Number(body.tricksWon)
    );

    return createLambdaResponse(200, successResponse(view));
  } catch (error) {
    console.error("Error submitting round:", error);
    if (error instanceof ValidationError) {
      const statusCode = error.code === "NOT_A_PLAYER" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return createErrorLambdaResponse(statusCode, error.message, error.code);
    }
    return createErrorLambdaResponse(500, "Could not save your entry", "INTERNAL_ERROR");
  }
};
