import { Router } from "express";
import { jobsRouteController } from "../controllers/jobs.controller.js";

export const router = Router();

router.get("/jobs", jobsRouteController);
