import { Router } from "express";
import productRoutes from "@/routers/productRoutes";
import customerRoutes from "@/routers/customerRoutes";
import transactionRoutes from "@/routers/transactionRoutes";
import userRoutes from "@/routers/userRoutes";

// eslint-disable-next-line new-cap
const router = Router();


router.use("/product", productRoutes);
router.use("/customer", customerRoutes);
router.use("/transaction", transactionRoutes);
router.use("/user", userRoutes);

export default router;
