import { z } from "zod";

export const remoteOkJobSchema = z.object({
  id: z.string(),
  position: z.string(),
  company: z.string(),
  company_logo: z.string().optional(),
  location: z.string().optional(),
  tags: z.array(z.string()).optional(),
  url: z.string().url(),
  date: z.string(),
});

export const remoteOkResponseSchema = z
  .array(z.unknown())
  .transform((entries) => entries.slice(1))
  .pipe(z.array(remoteOkJobSchema));
