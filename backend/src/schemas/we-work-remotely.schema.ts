import { z } from "zod";

export const weWorkRemotelyJobSchema = z.object({
  title: z.string().trim().min(1),
  link: z.string().url(),
  guid: z.string().optional(),
  region: z.string().optional(),
  categories: z.array(z.string()).optional(),
  pubDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid publication date",
  }),
});

export const weWorkRemotelyResponseSchema = z.object({
  items: z.array(weWorkRemotelyJobSchema),
});
