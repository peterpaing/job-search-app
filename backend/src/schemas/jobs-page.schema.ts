import { z } from "zod";
import { jobsQuerySchema } from "./jobs-query.schema.js";

const pageSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Page must be a positive whole number.")
  .default("1")
  .transform(Number)
  .pipe(z.number().int().min(1).max(1_000_000));

export const jobsPageQuerySchema = jobsQuerySchema.and(
  z.object({
    page: pageSchema,
  }),
);
