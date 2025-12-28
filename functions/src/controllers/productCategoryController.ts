import { firestoreDb } from "@/config/firebaseConfig";
import { Category } from "@/types/Category";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { ZodError } from "zod";
import {
    categorySchema,
    categoryUpdateSchema,
    assignCategoryToProductsSchema,
} from "@/zod-schemas/categorySchema";

const COLLECTION_NAME = "categories";

export const getAllCategories = async (req: Request, res: Response) => {
    try {
        const snapshot = await firestoreDb
            .collection(COLLECTION_NAME)
            .orderBy("categoryName", "asc")
            .orderBy("displayOrder", "asc")
            .get();

        const categories = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Category[];

        return res.status(200).json({ categories });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch categories",
            error: (error as Error).message,
        });
    }
};

export const getCategoryById = async (req: Request, res: Response) => {
    try {
        const categoryId =
            typeof req.params.id === "string" ? req.params.id : undefined;

        if (!categoryId) {
            return res.status(400).json({
                message: "Category ID is required",
            });
        }

        const doc = await firestoreDb
            .collection(COLLECTION_NAME)
            .doc(categoryId)
            .get();

        if (!doc.exists) {
            return res.status(404).json({
                message: "Category not found",
            });
        }

        const data = doc.data();
        if (data?.deleted) {
            return res.status(404).json({
                message: "Category not found",
            });
        }

        const category = {
            id: doc.id,
            ...data,
        } as Category;

        return res.status(200).json({ category });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch category",
            error: (error as Error).message,
        });
    }
};

export const createCategory = async (req: Request, res: Response) => {
    try {
        const categoryBody = categorySchema.parse(req.body);

        const now = FieldValue.serverTimestamp();
        const categoryData = {
            categoryName: categoryBody.categoryName,
            displayOrder: categoryBody.displayOrder ?? 0,
            color: categoryBody.color || undefined,
            updatedAt: now,
        };

        const docRef = await firestoreDb
            .collection(COLLECTION_NAME)
            .add(categoryData);

        const category = {
            id: docRef.id,
            ...categoryData,
        } as Category;

        return res.status(201).json({
            category,
            message: "Category created successfully",
        });
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                message: "Invalid category data. Please check the inputs.",
            });
        }

        return res.status(500).json({
            message: "Failed to create category",
            error: (error as Error).message,
        });
    }
};

export const updateCategory = async (req: Request, res: Response) => {
    try {
        const categoryId =
            typeof req.params.id === "string" ? req.params.id : undefined;

        if (!categoryId) {
            return res.status(400).json({
                message: "Category ID is required",
            });
        }

        const categoryBody = categoryUpdateSchema.parse(req.body);

        const categoryRef = firestoreDb
            .collection(COLLECTION_NAME)
            .doc(categoryId);
        const categoryDoc = await categoryRef.get();

        if (!categoryDoc.exists) {
            return res.status(404).json({
                message: "Category not found",
            });
        }

        const currentData = categoryDoc.data();
        if (currentData?.deleted) {
            return res.status(400).json({
                message: "Cannot update deleted category",
            });
        }

        const updateData: Partial<Category> = {};

        if (categoryBody.categoryName !== undefined) {
            updateData.categoryName = categoryBody.categoryName;
        }

        if (categoryBody.displayOrder !== undefined) {
            updateData.displayOrder = categoryBody.displayOrder;
        }

        if (categoryBody.color !== undefined) {
            updateData.color = categoryBody.color || undefined;
        }

        await categoryRef.update({
            ...updateData,
            updateAt: FieldValue.serverTimestamp(),
        });

        const updatedDoc = await categoryRef.get();
        const category = {
            id: updatedDoc.id,
            ...updatedDoc.data(),
        } as Category;

        return res.status(200).json({
            category,
            message: "Category updated successfully",
        });
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                message: "Invalid category data. Please check the inputs.",
            });
        }

        return res.status(500).json({
            message: "Failed to update category",
            error: (error as Error).message,
        });
    }
};

export const deleteCategory = async (req: Request, res: Response) => {
    try {
        const categoryId =
            typeof req.params.id === "string" ? req.params.id : undefined;

        if (!categoryId) {
            return res.status(400).json({
                message: "Category ID is required",
            });
        }

        const categoryRef = firestoreDb.collection(COLLECTION_NAME).doc(categoryId);
        const categoryDoc = await categoryRef.get();

        if (!categoryDoc.exists) {
            return res.status(404).json({
                message: "Category not found",
            });
        }

        // Find all products that have this categoryId in their categoryIds array
        const productsCollection = firestoreDb.collection("products");
        const productsSnapshot = await productsCollection
            .where("categoryIds", "array-contains", categoryId)
            .get();

        let updatedProductCount = 0;

        // Remove categoryId from all products that have it
        if (!productsSnapshot.empty) {
            // Firestore batch limit is 500 operations
            const BATCH_LIMIT = 500;
            const productDocs = productsSnapshot.docs;
            const totalProducts = productDocs.length;

            // Process in batches if needed
            for (let i = 0; i < totalProducts; i += BATCH_LIMIT) {
                const batch = firestoreDb.batch();
                const batchDocs = productDocs.slice(i, i + BATCH_LIMIT);

                for (const productDoc of batchDocs) {
                    const productRef = productsCollection.doc(productDoc.id);
                    batch.update(productRef, {
                        categoryIds: FieldValue.arrayRemove(categoryId),
                    });
                }

                await batch.commit();
                updatedProductCount += batchDocs.length;
            }
        }

        // Delete the category
        await categoryRef.delete();

        return res.status(200).json({
            message: "Category deleted successfully",
            productsUpdated: updatedProductCount,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to delete category",
            error: (error as Error).message,
        });
    }
};

export const assignCategoryToProducts = async (req: Request, res: Response) => {
    try {
        const categoryId =
            typeof req.params.id === "string" ? req.params.id : undefined;

        if (!categoryId) {
            return res.status(400).json({
                message: "Category ID is required",
            });
        }

        const { productIds } = assignCategoryToProductsSchema.parse(req.body);

        // Verify category exists
        const categoryRef = firestoreDb
            .collection(COLLECTION_NAME)
            .doc(categoryId);
        const categoryDoc = await categoryRef.get();

        if (!categoryDoc.exists) {
            return res.status(404).json({
                message: "Category not found",
            });
        }

        const productsCollection = firestoreDb.collection("products");
        const batch = firestoreDb.batch();
        const updatedProductIds: string[] = [];
        const notFoundProductIds: string[] = [];

        // Process each product
        for (const productId of productIds) {
            const productRef = productsCollection.doc(productId);
            const productDoc = await productRef.get();

            if (!productDoc.exists) {
                notFoundProductIds.push(productId);
                continue;
            }

            const productData = productDoc.data();
            const currentCategoryIds = productData?.categoryIds || [];

            // Only update if category is not already assigned
            if (!currentCategoryIds.includes(categoryId)) {
                batch.update(productRef, {
                    categoryIds: FieldValue.arrayUnion(categoryId),
                });
                updatedProductIds.push(productId);
            }
        }

        // Commit batch update
        if (updatedProductIds.length > 0) {
            await batch.commit();
        }

        return res.status(200).json({
            message: "Category assigned to products successfully",
            updatedProductIds,
            alreadyAssignedCount:
                productIds.length -
                updatedProductIds.length -
                notFoundProductIds.length,
            notFoundProductIds:
                notFoundProductIds.length > 0 ? notFoundProductIds : undefined,
        });
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                message: "Invalid request data. Please check the inputs.",
            });
        }

        return res.status(500).json({
            message: "Failed to assign category to products",
            error: (error as Error).message,
        });
    }
};
