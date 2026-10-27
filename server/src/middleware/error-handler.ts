import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "./http-error.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Please check the submitted fields.",
        details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        requestId: req.requestId,
      },
    });
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, requestId: req.requestId },
    });
  }

  const status = error instanceof Error && "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
  const message = status === 413 ? "The request body is too large." : "The request could not be completed.";
  console.error(`[request ${req.requestId}] ${error instanceof Error ? error.name : "UnknownError"}`);
  return res.status(status).json({
    error: { code: status === 413 ? "PAYLOAD_TOO_LARGE" : "INTERNAL_ERROR", message, requestId: req.requestId },
  });
};
