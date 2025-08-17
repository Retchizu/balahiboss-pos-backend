import { setPendingOrderStatus } from "@/controllers/pendingOrderController";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";
import { Router } from "express";

// eslint-disable-next-line new-cap
const router: Router = Router();

router.post("/status", verifyAuthToken, verifyRole(["admin", "user"]), setPendingOrderStatus);

export default router;
