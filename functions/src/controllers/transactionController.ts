import { firestoreDb } from "@/config/firebaseConfig";
import recordLog, { prepareLog } from "@/utils/recordLog";
import { toPHTRange } from "@/utils/toPHTRange";
import { transactionSchema } from "@/zod-schemas/transactionSchema";
import { Request, Response } from "express";
import { FirebaseError } from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { ZodError } from "zod";

export const addTransaction = async (req: Request, res: Response) => {
    try {
        const transactionBody = transactionSchema.parse(req.body);
        const transactionsRef = firestoreDb.collection("transactions");
        const productsRef = firestoreDb.collection("products");
        const pendingOrdersCol = firestoreDb.collection("pendingOrders");

        const newTransactionRef = transactionsRef.doc();
        const newTransactionId = newTransactionRef.id;

        const log = await prepareLog("transaction", newTransactionId, "CREATE", req.user!.uid, null, transactionBody);

        await firestoreDb.runTransaction(async (transaction) => {
            // Phase 1: Read all products first (all reads must come before writes)
            const productRefs: FirebaseFirestore.DocumentReference[] = [];
            const productSnaps: FirebaseFirestore.DocumentSnapshot[] = [];

            for (const item of transactionBody.items) {
                const productRef = productsRef.doc(item.productId);
                productRefs.push(productRef);
                const productSnap = await transaction.get(productRef);
                productSnaps.push(productSnap);
            }

            // Phase 2: Validate and calculate stock changes
            const stockUpdates: Array<{ ref: FirebaseFirestore.DocumentReference; newStock: number }> = [];
            for (let i = 0; i < transactionBody.items.length; i++) {
                const item = transactionBody.items[i];
                const productSnap = productSnaps[i];

                if (!productSnap.exists) {
                    throw new Error(`Product ${item.productId} not found`);
                }

                const productData = productSnap.data();
                const newStock = productData!.stock - item.quantity;

                if (newStock < 0) {
                    throw new Error(`INSUFFICIENT_STOCK:${item.productId}`);
                }

                stockUpdates.push({
                    ref: productRefs[i],
                    newStock,
                });
            }

            // Phase 3: Perform all writes (all reads are now complete)
            // Update product stocks
            for (const update of stockUpdates) {
                transaction.update(update.ref, { stock: update.newStock, updatedAt: FieldValue.serverTimestamp() });
            }

            // Create transaction document
            transaction.set(newTransactionRef, transactionBody);

            // Create pending order if needed
            if (transactionBody.pending) {
                const pendingRef = pendingOrdersCol.doc(newTransactionId);
                transaction.set(pendingRef, {
                    transaction: transactionBody,
                    orderInformation: transactionBody.orderInformation || "",
                    status: "pending",
                    date: new Date().toISOString(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }

            // Record activity log
            recordLog(transaction, log);
        });

        return res.status(200).json({message: "Transaction added successfully"});
    } catch (error) {
        console.error("addTransaction error:", error);

        if (error instanceof ZodError) {
            return res.status(400).json({
                error: "Invalid transaction data. Please check your inputs.",
            });
        }

        if ((error as Error).message.includes("not found")) {
            return res.status(404).json({ error: (error as Error).message });
        }
        if ((error as Error).message.includes("Insufficient stock")) {
            return res.status(409).json({ error: (error as Error).message });
        }

        if ((error as FirebaseError).code === "permission-denied") {
            return res.status(403).json({ error: "You don’t have permission to create this transaction." });
        }
        if ((error as FirebaseError).code === "unavailable") {
            return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
        }
        if ((error as FirebaseError).code === "resource-exhausted") {
            return res.status(507).json({ error: "Database quota exceeded. Please contact support." });
        }

        return res.status(500).json({
            error: "Failed to add transaction. Please try again later.",
        });
    }
};

export const getTransactions = async (req: Request, res: Response) => {
    try {
        const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
        const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

        const {startIso, endIso} = toPHTRange(startDate, endDate);
        console.log(startIso, endIso);

        const transactionRef = firestoreDb
            .collection("transactions")
            .where("date", ">=", startIso)
            .where("date", "<=", endIso);

        const transactions = await transactionRef.get();

        return res.status(200).json({
            items: transactions.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })),
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to get transactions",
            error: (error as Error).message,
        });
    }
};

type Item = {
  productId: string;
  quantity: number;
};

const getItemMap = (items: Item[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const item of items) {
        map.set(item.productId, item.quantity);
    }
    return map;
};

export const updateTransaction = async (req: Request, res: Response) => {
    try {
        const { transactionId } = req.params;
        if (!transactionId) {
            return res.status(400).json({ message: "transactionId is required" });
        }
        const transactionBody = transactionSchema.parse(req.body); // new transaction body
        const newItems: Item[] = transactionBody.items;


        const transactionsRef = firestoreDb.collection("transactions");
        const productsRef = firestoreDb.collection("products");
        const pendingOrdersRef = firestoreDb.collection("pendingOrders");

        const transactionRef = transactionsRef.doc(transactionId);

        await firestoreDb.runTransaction(async (transaction) => {
            // Phase 1: Read all documents first (all reads must come before writes)
            const existingTransaction = await transaction.get(transactionRef);
            if (!existingTransaction.exists) throw new Error("TRANSACTION_NOT_FOUND");
            const existingData = existingTransaction.data()!;

            const oldItems: Item[] = existingData.items || [];
            const oldItemMap = getItemMap(oldItems);
            const newItemMap = getItemMap(newItems);

            const productIds = new Set<string>([
                ...oldItemMap.keys(),
                ...newItemMap.keys(),
            ]);

            // Read all products
            const productRefs: FirebaseFirestore.DocumentReference[] = [];
            const productSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
            const productIdsArray = Array.from(productIds);

            for (const productId of productIdsArray) {
                const productRef = productsRef.doc(productId);
                productRefs.push(productRef);
                const productSnap = await transaction.get(productRef);
                productSnaps.push(productSnap);
            }

            // Read pending order if needed
            let pendingSnap: FirebaseFirestore.DocumentSnapshot | null = null;
            if (transactionBody.pending) {
                const pendingRef = pendingOrdersRef.doc(transactionId);
                pendingSnap = await transaction.get(pendingRef);
            }

            // Phase 2: Calculate all changes
            const stockUpdates: Array<{ ref: FirebaseFirestore.DocumentReference; newStock: number }> = [];
            for (let i = 0; i < productIdsArray.length; i++) {
                const productId = productIdsArray[i];
                const productSnap = productSnaps[i];

                const oldQty = oldItemMap.get(productId) || 0;
                const newQty = newItemMap.get(productId) || 0;
                const diff = newQty - oldQty;

                if (diff !== 0) {
                    if (!productSnap.exists) throw new Error(`PRODUCT_NOT_FOUND:${productId}`);

                    const productData = productSnap.data()!;
                    const newStock = (productData.stock || 0) - diff;

                    if (newStock < 0) throw new Error(`INSUFFICIENT_STOCK:${productId}`);

                    stockUpdates.push({
                        ref: productRefs[i],
                        newStock,
                    });
                }
            }

            // Phase 3: Perform all writes (all reads are now complete)
            // Update product stocks
            for (const update of stockUpdates) {
                transaction.update(update.ref, { stock: update.newStock, updatedAt: FieldValue.serverTimestamp() });
            }

            // Update transaction document
            transaction.update(transactionRef, {...transactionBody, updatedAt: FieldValue.serverTimestamp()});

            // Update/create pending order if needed
            if (transactionBody.pending) {
                const pendingRef = pendingOrdersRef.doc(transactionId);
                const newPendingData = {
                    transaction: transactionBody,
                    orderInformation: transactionBody.orderInformation || "",
                    status: pendingSnap?.exists ? pendingSnap.data()?.status : "pending",
                    date: new Date().toISOString(),
                    checkedBy: pendingSnap?.exists ?
                        Array.from(new Set([...(pendingSnap.data()?.checkedBy || []), req.user!.uid])):
                        [req.user!.uid],
                };

                transaction.set(pendingRef, newPendingData, { merge: true });
            }

            // Record activity log
            const log = await prepareLog(
                "transaction",
                transactionId,
                "UPDATE",
                req.user!.uid,
                existingData,
                transactionBody
            );
            recordLog(transaction, log);
        });

        return res
            .status(200)
            .json({ message: "Transaction updated successfully" });
    } catch (error) {
        if ((error as Error).message === "TRANSACTION_NOT_FOUND") {
            return res.status(404).json({ error: "Transaction not found" });
        }

        if ((error as Error).message.startsWith("PRODUCT_NOT_FOUND:")) {
            const id = (error as Error).message.split(":")[1];
            return res.status(404).json({ error: `Product ${id} not found` });
        }

        if ((error as Error).message.startsWith("INSUFFICIENT_STOCK:")) {
            const id = (error as Error).message.split(":")[1];
            return res.status(400).json({ error: `Insufficient stock for product ${id}` });
        }
        return res.status(500).json({message: "Failed to update transaction", error: (error as Error).message});
    }
};


export const deleteTransaction = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.params;
        if (!transactionId) {
            return res.status(400).json({ message: "transactionId is required" });
        }

        const transactionsRef = firestoreDb.collection("transactions");
        const productsRef = firestoreDb.collection("products");
        const pendingOrdersRef = firestoreDb.collection("pendingOrders");
        const transactionRef = transactionsRef.doc(transactionId);

        await firestoreDb.runTransaction(async (transaction) => {
            // Phase 1: Read all documents first (all reads must come before writes)
            const existingDoc = await transaction.get(transactionRef);
            if (!existingDoc.exists) throw new Error("TRANSACTION_NOT_FOUND");
            const existingData = existingDoc.data()!;
            const items: Item[] = existingData.items || [];
            const itemMap = getItemMap(items);

            const pendingRef = pendingOrdersRef.doc(transactionId);
            const pendingSnap = await transaction.get(pendingRef);

            // Read all products
            const productRefs: FirebaseFirestore.DocumentReference[] = [];
            const productSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
            const productIdsArray = Array.from(itemMap.keys());

            for (const productId of productIdsArray) {
                const productRef = productsRef.doc(productId);
                productRefs.push(productRef);
                const productSnap = await transaction.get(productRef);
                productSnaps.push(productSnap);
            }

            // Phase 2: Validate and calculate stock changes
            const stockUpdates: Array<{ ref: FirebaseFirestore.DocumentReference; newStock: number }> = [];
            for (let i = 0; i < productIdsArray.length; i++) {
                const productId = productIdsArray[i];
                const productSnap = productSnaps[i];
                const qty = itemMap.get(productId) || 0;

                if (!productSnap.exists) throw new Error(`PRODUCT_NOT_FOUND:${productId}`);

                const productData = productSnap.data()!;
                const newStock = (productData.stock || 0) + qty;

                stockUpdates.push({
                    ref: productRefs[i],
                    newStock,
                });
            }

            // Phase 3: Perform all writes (all reads are now complete)
            // Update product stocks
            for (const update of stockUpdates) {
                transaction.update(update.ref, { stock: update.newStock, updatedAt: FieldValue.serverTimestamp() });
            }

            // Delete pending order if it exists
            if (pendingSnap.exists) {
                transaction.delete(pendingRef);
            }

            // Delete transaction document
            transaction.delete(transactionRef);

            // Record activity log
            const log = await prepareLog("transaction", transactionId, "DELETE", req.user!.uid, existingData, null);
            recordLog(transaction, log);
        });

        return res.status(200).json({message: "Transaction deleted successfully"});
    } catch (error) {
        return res.status(500).json({message: "Failed to delete transaction", error: (error as Error).message});
    }
};

