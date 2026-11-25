import type { Request, Response } from "express";
import { getNumberOfRenders } from "./store.js";

export const dashboardEndpoint = async (request: Request, response: Response) => {
  if (request.method === "OPTIONS") {
    return response.end();
  }

  const nrOfRenders = await Promise.resolve(getNumberOfRenders());

  return response.json({ nrOfRenders });
};
