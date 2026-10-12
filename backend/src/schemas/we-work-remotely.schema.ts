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

  // rss-parser maps RSS <description> into content.
  content: z.string().nullish().catch(null),

  // Some feeds provide richer text in this field.
  "content:encoded": z.string().nullish().catch(null),
});

export const weWorkRemotelyResponseSchema = z.object({
  items: z.array(weWorkRemotelyJobSchema),
});
