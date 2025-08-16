import { getActivityLogs } from "@/controllers/activityController";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";
import { Router } from "express";

// eslint-disable-next-line new-cap
const router: Router = Router();

router.get("/list", verifyAuthToken, verifyRole(["admin"]), getActivityLogs);

export default router;
