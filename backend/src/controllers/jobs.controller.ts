import type { Request, Response } from "express";
import { jobsQuerySchema } from "../schemas/jobs-query.schema.js";
import { getStoredJobs } from "../services/database-jobs.service.js";

export async function jobsRouteController(req: Request, res: Response) {
  const result = jobsQuerySchema.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({
      message: "Invalid job search parameters.",
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });

    return;
  }

  try {
    const jobs = await getStoredJobs(result.data);

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
