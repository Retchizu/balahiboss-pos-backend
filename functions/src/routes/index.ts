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


router.use("/products", productRoutes);
router.use("/customers", customerRoutes);
router.use("/transactions", transactionRoutes);
router.use("/users", userRoutes);
router.use("/orders", pendingOrderRoutes);
router.use("/activities", activityRoutes);
router.use("/employees", employeeRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/categories", productCategoryRoutes);

export default router;
