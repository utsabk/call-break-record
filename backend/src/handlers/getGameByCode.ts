import { APIGatewayProxyHandler } from "aws-lambda";
import { gameService } from "../services/GameService";
import { ValidationError } from "../validation";
import { createErrorLambdaResponse, createLambdaResponse, successResponse } from "../utils/responses";
import { readHostToken, readSessionId } from "../utils/requestContext";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const gameCode = event.pathParameters?.gameCode?.trim().toUpperCase();
    if (!gameCode || !/^[A-Z0-9]{8}$/.test(gameCode)) return createErrorLambdaResponse(400, "Enter a valid game code", "INVALID_CODE");
    const view = await gameService.getGameViewByCode(gameCode, readSessionId(event.headers), readHostToken(event.headers));
    return createLambdaResponse(200, successResponse(view));
  } catch (error) {
    if (error instanceof ValidationError) return createErrorLambdaResponse(error.code === "NOT_FOUND" ? 404 : 400, error.message, error.code);
    return createErrorLambdaResponse(500, "Failed to join game", "INTERNAL_ERROR");
  }
};