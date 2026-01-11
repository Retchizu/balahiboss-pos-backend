/* eslint-disable max-len */
import { addProduct, addStock, deleteProduct, getProducts, updateProduct } from "@/controllers/productController";
import { Router } from "express";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";

// eslint-disable-next-line new-cap
const router:Router = Router();

router.post("/add", verifyAuthToken, verifyRole(["admin"]), addProduct);
router.get("/", verifyAuthToken, verifyRole(["admin", "user"]), getProducts);
router.put("/update/:productId", verifyAuthToken, verifyRole(["admin"]), updateProduct);
router.patch("/add-stock/:productId", verifyAuthToken, verifyRole(["admin"]), addStock);
router.delete("/delete/:productId", verifyAuthToken, verifyRole(["admin"]), deleteProduct);


export default router;
