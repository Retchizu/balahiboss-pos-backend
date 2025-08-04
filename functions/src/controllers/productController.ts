import { realtimeDb, storage } from "@/config/firebaseConfig";
import { productSchema } from "@/zod-schemas/productSchema";
import { Request, Response } from "express";
import { getDownloadURL } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";


export const addProduct = async (req: Request, res: Response) => {
    try {
        const { productName, stockPrice, sellPrice, stock, lowStockThreshold, base64Image } =
         productSchema.parse(req.body);
        const productRef = realtimeDb.ref("products");

        let imageUrl = "";
        if (base64Image) {
            const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({ message: "Invalid base64 image" });
            }

            const contentType = matches[1];
            console.log("content type", contentType); // image/jpeg or image/png
            const buffer = Buffer.from(matches[2], "base64");
            const fileExtension = contentType.split("/")[1];
            const fileName = `products/${uuidv4()}.${fileExtension}`;

            const file = storage.file(fileName);

            await file.save(buffer, {
                metadata: { contentType },
            });
            imageUrl = await getDownloadURL(file);
        }


        await productRef.push({
            productName,
            stockPrice,
            sellPrice,
            stock,
            lowStockThreshold,
            imageUrl,
        });

        return res.status(201).json({message: `${productName} added successfully`});
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

        const currentProduct = product.val();
        const updateProductBody = productSchema.parse(req.body);
        const { base64Image, ...rest } = updateProductBody;

        let imageUrl = currentProduct.imageUrl || "";
        if (base64Image) {
            if (currentProduct.imageUrl) {
                const url = new URL(currentProduct.imageUrl);
                const path = decodeURIComponent(url.pathname.split("/o/")[1].split("?")[0]);
                await storage.file(path).delete().catch((error) => {
                    return res.status(500).json({
                        message: `Failed to delete old image: ${(error as Error).message}`,
                    });
                });
            }

            const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({ message: "Invalid base64 image" });
            }
            const contentType = matches[1];
            const buffer = Buffer.from(matches[2], "base64");
            const fileExtension = contentType.split("/")[1];
            const fileName = `products/${uuidv4()}.${fileExtension}`;

            const file = storage.file(fileName);

            await file.save(buffer, {
                metadata: { contentType },
            });
            imageUrl = await getDownloadURL(file);
            console.log(imageUrl);
        }
        await productRef.update({...rest, imageUrl});

        return res.status(200).json({message: `${updateProductBody.productName} updated successfully`});
    } catch (error) {
        return res.status(500).json({
            message: `Failed to update product: ${(error as Error).message}`,
        });
    }
};

export const deleteProduct = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        if (!productId) {
            return res.status(400).json({
                message: "Product ID is required",
            });
        }

        const productRef = realtimeDb.ref(`products/${productId}`);
        const snapshot = await productRef.get();

        if (!snapshot.exists()) {
            return res.status(404).json({
                message: "Product not found",
            });
        }

        const product = snapshot.val();

        //  Delete image from storage if it exists
        if (product.imageUrl) {
            try {
                const url = new URL(product.imageUrl);
                const encodedPath = url.pathname.split("/o/")[1]?.split("?")[0];
                if (encodedPath) {
                    const storagePath = decodeURIComponent(encodedPath);
                    await storage.file(storagePath).delete();
                }
            } catch (err) {
                console.warn("Failed to delete image from storage:", (err as Error).message);
                // Optionally, include this in the response but don't block the delete
            }
        }

        //  Delete product from database
        await productRef.remove();

        return res.status(200).json({
            message: `${product.productName} deleted successfully`,
        });
    } catch (error) {
        return res.status(500).json({
            message: `Failed to delete product: ${(error as Error).message}`,
        });
    }
};
