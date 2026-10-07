import type { Request, Response } from "express";
import { getJobs } from "../services/jobs.service.js";

export async function jobsRouteController(_req: Request, res: Response) {
  try {
    const jobs = await getJobs();

    res.json({
      jobs,
      total: jobs.length,
    });
  } catch (error) {
    console.error("Failed to fetch jobs:", error);

    res.status(502).json({
      message: "Unable to fetch jobs. Please try again later.",
    });
  }
}
