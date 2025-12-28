import { Router } from "express";
import {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory,
    assignCategoryToProducts,
} from "@/controllers/productCategoryController";


// eslint-disable-next-line new-cap
const router: Router = Router();

router.get("/list", getAllCategories);

router.get("/:id", getCategoryById);

router.post("/add", createCategory);

router.put("/update/:id", updateCategory);

router.delete("/delete/:id", deleteCategory);

router.post("/:id/products", assignCategoryToProducts);

export default router;
