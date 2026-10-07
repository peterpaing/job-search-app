import type { Request, Response } from "express";

export function jobsRouteController(_req: Request, res: Response) {
  res.json({ message: "Hello from Jobs route!" });
}
