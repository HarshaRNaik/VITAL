import type { Request } from "express";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  goal: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthenticatedUser;
      coachUser?: { id: string; accessToken: string };
    }
  }
}

export {};
