import { getProductMaxStock, getTopCustomers } from "@/controllers/analyticsController";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";
import { Router } from "express";

// eslint-disable-next-line new-cap
const router: Router = Router();


router.get("/top-customers", verifyAuthToken, verifyRole(["admin"]), getTopCustomers);
router.get("/product-max-stock", verifyAuthToken, verifyRole(["admin"]), getProductMaxStock);

export default router;
