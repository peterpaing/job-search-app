import { z } from "zod";

const jobSourceSchema = z.enum([
  "Remote OK",
  "We Work Remotely",
  "Himalayas",
  "Dev Global Jobs",
]);

export const jobsQuerySchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    location: z.string().trim().max(200).default(""),
    company: z.string().trim().max(200).default(""),

    source: z
      .union([jobSourceSchema, z.array(jobSourceSchema).max(4)])
      .optional()
      .transform((value) => {
        if (value === undefined) {
          return [];
        }

        return [...new Set(typeof value === "string" ? [value] : value)];
      }),

    postedWithin: z.enum(["", "1", "7", "30"]).default(""),
  })
  .transform(({ source, ...values }) => ({
    ...values,
    sources: source,
  }));

export type JobsQuery = z.infer<typeof jobsQuerySchema>;
