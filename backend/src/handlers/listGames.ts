import { APIGatewayProxyHandler } from "aws-lambda";
import { gameService } from "../services/GameService";
import {
  createErrorLambdaResponse,
  createLambdaResponse,
  successResponse,
} from "../utils/responses";

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const games = await gameService.listGames();
    return createLambdaResponse(200, successResponse(games));
  } catch (error) {
    console.error("Error listing games:", error);
    return createErrorLambdaResponse(500, "Failed to list games", "INTERNAL_ERROR");
  }
};
