import { markCompleteThePendingOrder, markIncompleteThePendingOrder } from "@/controllers/pendingOrderController";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";
import { Router } from "express";

// eslint-disable-next-line new-cap
const router: Router = Router();

router.post("/complete", verifyAuthToken, verifyRole(["admin", "user"]), markCompleteThePendingOrder);
router.post("/incomplete", verifyAuthToken, verifyRole(["admin", "user"]), markIncompleteThePendingOrder);

export default router;
