import { realtimeDb } from "@/config/firebaseConfig";
import { productSchema } from "@/zod-schemas/productSchema";
import { Request, Response } from "express";

export const addProduct = async (req: Request, res: Response) => {
    try {
        const addProductBody = productSchema.parse(req.body);
        const productRef = realtimeDb.ref("products");

        await productRef.push(addProductBody);

        return res.status(201).json({message: `${addProductBody.productName} added successfully`});
    } catch (error) {
        return res.status(500).json({
            message: `Failed to add products: ${(error as Error).message}`,
        });
    }
};

export const getProducts = async (req: Request, res: Response) => {
    try {
        const productsRef = realtimeDb.ref("products");
        const products = await productsRef.get();
        console.log("get products");
        return res.status(200).json({items: products.val()});
    } catch (error) {
        return res.status(500).json({
            message: `Failed to get products: ${(error as Error).message}`,
        });
    }
};

export const updateProduct = async (req: Request, res: Response) => {
    try {
        const {productId} = req.params;

        if (!productId) {
            return res.status(400).json({
                message: "Product ID is required",
            });
        }

        const productRef = realtimeDb.ref(`products/${productId}`);
        const product = await productRef.get();

        if (!product.exists()) {
            return res.status(404).json({
                message: "Product not found",
            });
        }

        const updateProductBody = productSchema.parse(req.body);
        await productRef.update(updateProductBody);

        return res.status(200).json({message: `${updateProductBody.productName} updated successfully`});
    } catch (error) {
        return res.status(500).json({
            message: `Failed to update product: ${(error as Error).message}`,
        });
    }
};

export const deleteProduct = async (req: Request, res: Response) => {
    try {
        const {productId} = req.params;
        if (!productId) {
            return res.status(400).json({
                message: "Product ID is required",
            });
        }

        const productRef = realtimeDb.ref(`products/${productId}`);
        const product = await productRef.get();

        if (!product.exists()) {
            return res.status(404).json({
                message: "Product not found",
            });
        }

        await productRef.remove();

        return res.status(200).json({message: `${product.val().productName} deleted successfully`});
    } catch (error) {
        return res.status(500).json({
            message: `Failed to delete product: ${(error as Error).message}`,
        });
    }
};
