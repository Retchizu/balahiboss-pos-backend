import { firestoreDb, storage } from "@/config/firebaseConfig";
import recordLog, { prepareLog } from "@/utils/recordLog";
import { productSchema } from "@/zod-schemas/productSchema";
import { Request, Response } from "express";
import { getDownloadURL } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import {format} from "date-fns";
import { FirebaseError } from "firebase-admin";
import { ZodError } from "zod";
import Product from "@/types/Product";


export const addProduct = async (req: Request, res: Response) => {
    try {
        const { productName, stockPrice, sellPrice, stock, base64Image } =
         productSchema.parse(req.body);

        let imageUrl = "";
        if (base64Image) {
            const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({ error: "Invalid base64 image" });
            }

            const contentType = matches[1];

            if (!["image/jpeg", "image/png"].includes(contentType)) {
                return res.status(400).json({ error: "Only JPEG and PNG images are allowed" });
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

        const productRef = firestoreDb.collection("products");
        const existingProductRef = productRef.where("productName", "==", productName);

        // activity log
        const afterSnapshot = { productName, stockPrice, sellPrice, stock, imageUrl };
        const newProductRef = productRef.doc();
        const log = await prepareLog("product", newProductRef.id, "CREATE", req.user!.uid, null, afterSnapshot);


        await firestoreDb.runTransaction(async (transaction) => {
            const product = await transaction.get(existingProductRef);

            if (!product.empty) {
                const conflict = product.docs.some((doc) => doc.data().deleted !== true);
                if (conflict) throw new Error("PRODUCT_CONFLICT");
            }

            transaction.set(newProductRef, {
                productName,
                stockPrice,
                sellPrice,
                stock,
                imageUrl,
            });
            recordLog(transaction, log);
        });
        return res.status(201).json({message: `${productName} added successfully`});
    } catch (error) {
        console.error("AddProduct Error:", error); // full log for devs

        if (error instanceof ZodError) {
            return res.status(400).json({ error: "Invalid product data. Please check your inputs." });
        }

        if ((error as FirebaseError).code === "storage/unauthorized") {
            return res.status(403).json({ error: "You don’t have permission to upload this image." });
        }

        if ((error as FirebaseError).code === "storage/quota-exceeded") {
            return res.status(507).json({ error: "Storage limit reached. Please try again later." });
        }
        if ((error as Error).message === "PRODUCT_CONFLICT") {
            return res.status(409).json({ error: `${req.body.productName} already exists` });
        }
        console.error("AddProduct Error:", error); // full log for devs

        return res.status(500).json({
            error: "Something went wrong while adding the product. Please try again later.",
        });
    }
};

export const getProducts = async (req: Request, res: Response) => {
    try {
        const productsRef = firestoreDb.collection("products");
        const products = await productsRef.get();
        const productRecord: Record<string, Product> = {};
        products.docs.forEach((product) => {
            productRecord[product.id] = product.data() as Product;
        });
        return res.status(200).json({items: productRecord});
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
            return res.status(400).json({ error: "Product ID is required" });
        }

        // 2. Get product reference from Realtime DB
        const productRef = firestoreDb.collection("products").doc(productId);
        const product = await productRef.get();

        if (!product.exists) {
            return res.status(404).json({ error: "Product not found" });
        }

        // Snapshot of current product before update
        const currentProduct = product.data();

        // 3. Validate request body against schema
        const updateProductBody = productSchema.parse(req.body);

        // Separate image from other updatable fields
        const { base64Image, ...rest } = updateProductBody;

        // Track image changes
        const currentImageUrl: string | null = currentProduct!.imageUrl ?? null;
        let newImageUrl: string | null = currentImageUrl;
        let oldImageUrl: string | null = currentImageUrl;

        // 4. Handle image replacement (if base64 provided)
        if (base64Image) {
            // Only replace if actually different
            if (currentImageUrl || base64Image.startsWith("data:")) {
                // Upload new base64 image
                const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    return res.status(400).json({ error: "Invalid base64 image" });
                }

                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], "base64");
                const fileExtension = contentType.split("/")[1];
                const fileName = `products/${uuidv4()}.${fileExtension}`;

                const file = storage.file(fileName);

                await file.save(buffer, { metadata: { contentType } });
                const uploadedUrl = await getDownloadURL(file);

                // Only do history + update if uploadedUrl is different
                if (uploadedUrl !== currentImageUrl) {
                    if (currentImageUrl) {
                        try {
                            const url = new URL(currentImageUrl);
                            const oldPath = decodeURIComponent(
                                url.pathname.split("/o/")[1].split("?")[0]
                            );

                            const oldExt = oldPath.split(".").pop() || "jpg";
                            const timestamp = format(new Date(), "yyyyMMdd_HHmmss");
                            const historyPath = `products/history/${productId}/${timestamp}.${oldExt}`;

                            await storage.file(oldPath).copy(storage.file(historyPath));
                            oldImageUrl = await getDownloadURL(storage.file(historyPath));
                            await storage.file(oldPath).delete();
                        } catch (err) {
                            console.warn("History move failed:", (err as Error).message);
                        }
                    }

                    newImageUrl = uploadedUrl;
                }
            }
        }

        const beforeSnapshot = {
            ...currentProduct,
            imageUrl: oldImageUrl,
        };

        const afterSnapshot = {
            ...currentProduct, // start with old
            ...rest, // override with updates
            imageUrl: newImageUrl,
        };

        const log = await prepareLog("product", productId, "UPDATE", req.user!.uid, beforeSnapshot, afterSnapshot);

        await firestoreDb.runTransaction(async (transaction) => {
            const doc = await transaction.get(productRef);

            if (!doc.exists) {
                throw new Error("PRODUCT_NOT_FOUND");
            }

            transaction.update(productRef, {
                ...rest,
                imageUrl: newImageUrl,
            });

            recordLog(transaction, log);
        });

        return res.status(200).json({
            message: `${updateProductBody.productName} updated successfully`,
        });
    } catch (error) {
        console.error("UpdateProduct Error:", error);

        if (error instanceof ZodError) {
            return res.status(400).json({ error: "Invalid product data. Please check your inputs." });
        }

        if ((error as FirebaseError).code === "storage/unauthorized") {
            return res.status(403).json({ error: "You don’t have permission to upload this image." });
        }

        if ((error as FirebaseError).code === "storage/quota-exceeded") {
            return res.status(507).json({ error: "Storage limit reached. Please try again later." });
        }

        if ((error as Error).message === "PRODUCT_CONFLICT") {
            return res.status(409).json({ error: `${req.body.productName} already exists` });
        }
        return res.status(500).json({
            error: `Something went wrong while updating the product. Please try again later. 
            ${(error as Error).message}`,
        });
    }
};


export const deleteProduct = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        if (!productId) {
            return res.status(400).json({
                error: "Product ID is required",
            });
        }

        const productRef = firestoreDb.collection("products").doc(productId);
        const snapshot = await productRef.get();

        if (!snapshot.exists) {
            return res.status(404).json({
                error: "Product not found",
            });
        }

        const product = snapshot.data();

        //  Delete image from storage if it exists
        if (product!.imageUrl) {
            try {
                const url = new URL(product!.imageUrl);
                const encodedPath = url.pathname.split("/o/")[1]?.split("?")[0];
                if (encodedPath) {
                    const storagePath = decodeURIComponent(encodedPath);
                    await storage.file(storagePath).delete();
                }
            } catch (err) {
                throw new Error(`Failed to delete image from storage: ${(err as Error).message}`);
            }
        }


        const beforeSnapshot = {
            ...product,
        };

        const log = await prepareLog("product", snapshot.id, "DELETE", req.user!.uid, beforeSnapshot, null);
        await firestoreDb.runTransaction(async (transaction) => {
            transaction.update(productRef, {deleted: true});
            recordLog(transaction, log);
        });

        return res.status(200).json({
            message: `${product!.productName} deleted successfully`,
        });
    } catch (error) {
        console.error("DeleteProduct Error:", error);

        if ((error as FirebaseError).code === "storage/unauthorized") {
            return res.status(403).json({ error: "You don’t have permission to delete this product image." });
        }

        if ((error as FirebaseError).code === "storage/object-not-found") {
            return res.status(404).json({ error: "Product image not found in storage." });
        }

        return res.status(500).json({
            error: "Something went wrong while deleting the product. Please try again later.",
        });
    }
};

export const addStock = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        const { additionalStock } = req.body;

        if (!productId) {
            return res.status(400).json({ error: "Product ID is required" });
        }
        if (parseFloat(additionalStock) <= 0) {
            return res.status(400).json({ error: "Additional stock must be a positive number" });
        }

        const productRef = firestoreDb.collection("products").doc(productId);
        const productSnap = await productRef.get();

        if (!productSnap.exists) {
            return res.status(404).json({ error: "Product not found" });
        }

        const currentProduct = productSnap.data();
        const newStock = (parseFloat(currentProduct!.stock) || 0) + parseFloat(additionalStock);

        const beforeSnapshot = { ...currentProduct };
        const afterSnapshot = { ...currentProduct, stock: newStock };
        const log = await prepareLog("product", productId, "UPDATE", req.user!.uid, beforeSnapshot, afterSnapshot);

        await firestoreDb.runTransaction(async (transaction) => {
            transaction.update(productRef, { stock: newStock });
            recordLog(transaction, log);
        });

        return res.status(200).json({ message: `Stock updated successfully. New stock: ${newStock}` });
    } catch (error) {
        console.error("AddStock Error:", error);

        if (error instanceof ZodError) {
            return res.status(400).json({ error: "Invalid data. Please check your inputs." });
        }
        if ((error as FirebaseError).code === "permission-denied") {
            return res.status(403).json({ error: "You don’t have permission to update product stock." });
        }
        if ((error as FirebaseError).code === "unavailable") {
            return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
        }
        if ((error as FirebaseError).code === "resource-exhausted") {
            return res.status(507).json({ error: "Database quota exceeded. Please contact support." });
        }

        return res.status(500).json({
            error: "Failed to update stock. Please try again later.",
        });
    }
};
