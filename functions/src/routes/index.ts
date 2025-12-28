import { Router } from "express";
import productRoutes from "@/routers/productRoutes";
import customerRoutes from "@/routers/customerRoutes";
import transactionRoutes from "@/routers/transactionRoutes";
import userRoutes from "@/routers/userRoutes";
import pendingOrderRoutes from "@/routers/pendingOrderRoutes";
import activityRoutes from "@/routers/activityRoutes";
import employeeRoutes from "@/routers/employeeRoutes";
import analyticsRoutes from "@/routers/analyticsRoutes";
import productCategoryRoutes from "@/routers/productCategoryRoutes";

// eslint-disable-next-line new-cap
const router = Router();


router.use("/product", productRoutes);
router.use("/customer", customerRoutes);
router.use("/transaction", transactionRoutes);
router.use("/user", userRoutes);
router.use("/pending-order", pendingOrderRoutes);
router.use("/activity", activityRoutes);
router.use("/employee", employeeRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/categories", productCategoryRoutes);

export default router;
