import { z } from "zod";

export const devGlobalJobSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  organization: z.string(),
  location: z.string().nullish(),
  country: z.string().nullish(),
  category: z.string().nullish(),
  jobType: z.string().nullish(),
  postedAt: z.string(),
  url: z.string().url(),

  // Collect only when the API actually supplies this field.
  description: z.string().nullish().catch(null),
});

export const devGlobalJobsResponseSchema = z.object({
  jobs: z.array(devGlobalJobSchema),
});
