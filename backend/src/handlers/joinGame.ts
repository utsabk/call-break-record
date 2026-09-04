import { APIGatewayProxyHandler } from "aws-lambda";
import { GameViewerRole } from "@call-break/shared";
import { gameService } from "../services/GameService";
import { ValidationError } from "../validation";
import { createErrorLambdaResponse, createLambdaResponse, successResponse } from "../utils/responses";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}") as { gameCode?: string; role?: string; playerId?: string };

    if (!body.gameCode) {
      return createErrorLambdaResponse(400, "Enter a game code", "MISSING_GAME_CODE");
    }
    if (body.role !== GameViewerRole.PLAYER && body.role !== GameViewerRole.VIEWER) {
      return createErrorLambdaResponse(400, "Choose whether to play or watch", "INVALID_ROLE");
    }

    const { session, view } = await gameService.joinGame(body.gameCode, body.role, body.playerId);
    return createLambdaResponse(201, successResponse({ session, game: view }));
  } catch (error) {
    console.error("Error joining game:", error);
    if (error instanceof ValidationError) {
      const statusCode = error.code === "NOT_FOUND" ? 404 : error.code === "SEAT_TAKEN" ? 409 : 400;
      return createErrorLambdaResponse(statusCode, error.message, error.code);
    }
    return createErrorLambdaResponse(500, "Could not join the game", "INTERNAL_ERROR");
  }
};
