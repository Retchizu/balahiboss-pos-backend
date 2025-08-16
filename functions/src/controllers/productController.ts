import { realtimeDb, storage } from "@/config/firebaseConfig";
import recordLog from "@/utils/recordLog";
import { productSchema } from "@/zod-schemas/productSchema";
import { Request, Response } from "express";
import { getDownloadURL } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import {format} from "date-fns";


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

            if (!["image/jpeg", "image/png"].includes(contentType)) {
                return res.status(400).json({ message: "Only JPEG and PNG images are allowed" });
            }

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

        const productRefPush = await productRef.push({
            productName,
            stockPrice,
            sellPrice,
            stock,
            lowStockThreshold,
            imageUrl,
        });

        const newProductId = productRefPush.key!;
        const afterSnapshot = {
            productName,
            stockPrice,
            sellPrice,
            stock,
            lowStockThreshold,
            imageUrl,
        };

        await recordLog("product", newProductId, "CREATE", req.user!.uid, null, afterSnapshot);

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

// eslint-disable-next-line valid-jsdoc
/**
 * Updates an existing product in the Realtime Database.
 *
 * Main responsibilities:
 *  1. Validate request (ensure `productId` exists in params).
 *  2. Fetch current product from DB; return 404 if not found.
 *  3. Validate update payload with `productSchema`.
 *  4. If a new image is provided (base64):
 *     - Archive the old image into a "history" folder with timestamp.
 *     - Upload the new image to storage and get its download URL.
 *  5. Update the product record in the database with new values.
 *  6. Record a structured "before vs after" log entry.
 *  7. Return a success response.
 *
 * Error handling:
 *  - Returns 400 for missing productId or invalid image.
 *  - Returns 404 if product does not exist.
 *  - Returns 500 for unexpected server/storage errors.
 */

export const updateProduct = async (req: Request, res: Response) => {
    try {
        // 1. Extract productId from request params
        const { productId } = req.params;

        if (!productId) {
            return res.status(400).json({ message: "Product ID is required" });
        }

        // 2. Get product reference from Realtime DB
        const productRef = realtimeDb.ref(`products/${productId}`);
        const product = await productRef.get();

        if (!product.exists()) {
            return res.status(404).json({ message: "Product not found" });
        }

        // Snapshot of current product before update
        const currentProduct = product.val();

        // 3. Validate request body against schema
        const updateProductBody = productSchema.parse(req.body);

        // Separate image from other updatable fields
        const { base64Image, ...rest } = updateProductBody;

        // Track image changes
        const currentImageUrl = currentProduct.imageUrl;
        let newImageUrl = currentImageUrl;

        // 4. Handle image replacement (if base64 provided)
        if (base64Image) {
            // 4a. Move current image into history if it exists
            if (currentImageUrl) {
                try {
                    const url = new URL(currentProduct.imageUrl);
                    const oldPath = decodeURIComponent(
                        url.pathname.split("/o/")[1].split("?")[0]
                    );

                    const oldExt = oldPath.split(".").pop() || "jpg";
                    const timestamp = format(new Date(), "yyyyMMdd_HHmmss");
                    const historyPath = `products/history/${productId}/${timestamp}.${oldExt}`;

                    // Copy old file → history path
                    await storage.file(oldPath).copy(storage.file(historyPath));
                } catch (error) {
                    throw new Error(
                        `Failed to move old image to history: ${(error as Error).message}`
                    );
                }
            }

            // 4b. Validate and upload new base64 image
            const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({ message: "Invalid base64 image" });
            }

            const contentType = matches[1]; // e.g. "image/png"
            const buffer = Buffer.from(matches[2], "base64");
            const fileExtension = contentType.split("/")[1];
            const fileName = `products/${uuidv4()}.${fileExtension}`;

            const file = storage.file(fileName);

            // Upload to cloud storage
            await file.save(buffer, { metadata: { contentType } });
            newImageUrl = await getDownloadURL(file);
        }

        // 5. Apply updates to product in DB
        await productRef.update({ ...rest, imageUrl: newImageUrl });

        // 6. Prepare before/after snapshots for logging
        const beforeSnapshot = {
            ...currentProduct,
            imageUrl: currentImageUrl,
        };

        const afterSnapshot = {
            ...currentProduct, // start with old
            ...rest, // override with updates
            imageUrl: newImageUrl,
        };

        // Log structured update
        recordLog(
            "product",
            productId,
            "UPDATE",
            req.user!.uid,
            beforeSnapshot,
            afterSnapshot
        );

        // 7. Return success response
        return res.status(200).json({
            message: `${updateProductBody.productName} updated successfully`,
        });
    } catch (error) {
        // Catch-all error handling
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
                throw new Error(`Failed to delete image from storage: ${(err as Error).message}`);
            }
        }

        //  Delete product from database
        await productRef.remove();

        const beforeSnapshot = {
            ...product,
        };

        await recordLog("product", productId, "DELETE", req.user!.uid, beforeSnapshot, null);

        return res.status(200).json({
            message: `${product.productName} deleted successfully`,
        });
    } catch (error) {
        return res.status(500).json({
            message: `Failed to delete product: ${(error as Error).message}`,
        });
    }
};
