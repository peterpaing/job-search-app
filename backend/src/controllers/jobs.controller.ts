import type { Request, Response } from "express";
import { getStoredJobs } from "../services/database-jobs.service.js";

export async function jobsRouteController(_req: Request, res: Response) {
  try {
    const jobs = await getStoredJobs();

    res.json({
      jobs,
      total: jobs.length,
    });
  } catch (error) {
    console.error("Failed to read stored jobs:", error);

    res.status(500).json({
      message: "Unable to fetch jobs. Please try again later.",
    });
  }
}
