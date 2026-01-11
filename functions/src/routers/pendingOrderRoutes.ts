import { readNewPendingOrder, setPendingOrderStatus } from "@/controllers/ordersController";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";
import { Router } from "express";

// eslint-disable-next-line new-cap
const router: Router = Router();

router.post("/status", verifyAuthToken, verifyRole(["admin", "user"]), setPendingOrderStatus);
router.post("/view", verifyAuthToken, verifyRole(["admin", "user"]), readNewPendingOrder);

export default router;
