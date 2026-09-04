/**
 * API response utilities
 * Ensures consistent response format and error handling
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
  };
}

export function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

export function errorResponse(
  message: string,
  code: string
): ApiErrorResponse {
  return {
    success: false,
    error: {
      message,
      code,
    },
  };
}

export function createLambdaResponse(
  statusCode: number,
  body: any
): {
  statusCode: number;
  body: string;
  headers: { [key: string]: string };
} {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  };
}

export function createErrorLambdaResponse(
  statusCode: number,
  message: string,
  code: string
) {
  return createLambdaResponse(statusCode, errorResponse(message, code));
}
