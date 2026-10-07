import { z } from "zod";

export const himalayasJobSchema = z.object({
  guid: z.string().url(),
  title: z.string(),
  companyName: z.string(),
  companyLogo: z.string().nullish(),
  locationRestrictions: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  applicationLink: z.string().url(),
  pubDate: z.number(),
});

export const himalayasResponseSchema = z.object({
  jobs: z.array(himalayasJobSchema),
});
