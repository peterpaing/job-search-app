import type { Request, Response } from "express";
import { jobsPageQuerySchema } from "../schemas/jobs-page.schema.js";
import { getStoredJobsPage } from "../services/database-jobs.service.js";

export async function jobsRouteController(req: Request, res: Response) {
  const result = jobsPageQuerySchema.safeParse(req.query);

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
    const { page, ...filters } = result.data;
    const data = await getStoredJobsPage(filters, page);

    res.json(data);
  } catch (error) {
    console.error("Failed to read stored jobs:", error);

    res.status(500).json({
      message: "Unable to fetch jobs. Please try again later.",
    });
  }
}
