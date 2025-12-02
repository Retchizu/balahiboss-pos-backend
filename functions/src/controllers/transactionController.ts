import { firestoreDb } from "@/config/firebaseConfig";
import recordLog, { prepareLog } from "@/utils/recordLog";
import { transactionSchema } from "@/zod-schemas/transactionSchema";
import { endOfDay, startOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { Request, Response } from "express";
import { FirebaseError } from "firebase-admin";
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
            for (const item of transactionBody.items) {
                const productRef = productsRef.doc(item.productId);
                const productSnap = await transaction.get(productRef);
                if (!productSnap.exists) throw new Error(`Product ${item.productId} not found`);

                const productData = productSnap.data();
                const newStock = productData!.stock - item.quantity;
                if (newStock < 0) {
                    throw new Error(`INSUFFICIENT_STOCK:${item.productId}`);
                }
                transaction.update(productRef, {stock: newStock});
            }
            transaction.set(newTransactionRef, transactionBody);
            // if sending to an employee in pending orders
            if (transactionBody.pending) {
                const pendingRef = pendingOrdersCol.doc(newTransactionId);
                transaction.set(pendingRef, {
                    transaction: transactionBody,
                    orderInformation: transactionBody.orderInformation || "",
                    status: "pending",
                    date: new Date().toISOString(),
                });
            }

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

export const toPHTRange = (start?: string, end?: string) => {
    const timeZone = "Asia/Manila"; // PHT

    let startDate: Date;
    let endDate: Date;

    if (start && end) {
        startDate = new Date(start);
        endDate = new Date(end);
    } else {
        const now = new Date();
        startDate = now;
        endDate = now;
    }

    // Step 1: Convert to PHT time
    const startInPht = toZonedTime(startDate, timeZone);
    const endInPht = toZonedTime(endDate, timeZone);

    // Step 2: Get start/end of the PHT day
    const startPhtDay = startOfDay(startInPht);
    const endPhtDay = endOfDay(endInPht);

    // Step 3: Convert back to UTC for Firestore queries
    const startUtc = fromZonedTime(startPhtDay, timeZone);
    const endUtc = fromZonedTime(endPhtDay, timeZone);

    return {
        startIso: startUtc.toISOString(),
        endIso: endUtc.toISOString(),
    };
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

            for (const productId of productIds) {
                const oldQty = oldItemMap.get(productId) || 0;
                const newQty = newItemMap.get(productId) || 0;
                const diff = newQty - oldQty;
                if (diff !== 0) {
                    const productRef = productsRef.doc(productId);
                    const productSnap = await transaction.get(productRef);
                    if (!productSnap.exists) throw new Error(`PRODUCT_NOT_FOUND:${productId}`);

                    const productData = productSnap.data()!;
                    const newStock = (productData.stock || 0) - diff;

                    if (newStock < 0) throw new Error(`INSUFFICIENT_STOCK:${productId}`);

                    transaction.update(productRef, { stock: newStock });
                }
            }

            transaction.update(transactionRef, transactionBody);

            if (transactionBody.pending) {
                const pendingRef = pendingOrdersRef.doc(transactionId);
                const pendingSnap = await transaction.get(pendingRef);

                const newPendingData = {
                    transaction: transactionBody,
                    orderInformation: transactionBody.orderInformation || "",
                    status: pendingSnap.exists ? pendingSnap.data()?.status : "pending",
                    date: new Date().toISOString(),
                    checkedBy: pendingSnap.exists ?
                        Array.from(new Set([...(pendingSnap.data()?.checkedBy || []), req.user!.uid])):
                        [req.user!.uid],
                };

                transaction.set(pendingRef, newPendingData, { merge: true });
            }
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
            const existingDoc = await transaction.get(transactionRef);
            if (!existingDoc.exists) throw new Error("TRANSACTION_NOT_FOUND");
            const existingData = existingDoc.data()!;
            const items: Item[] = existingData.items || [];
            const itemMap = getItemMap(items);

            const pendingRef = pendingOrdersRef.doc(transactionId);
            const pendingSnap = await transaction.get(pendingRef);

            for (const [productId, qty] of itemMap.entries()) {
                const productRef = productsRef.doc(productId);
                const productSnap = await transaction.get(productRef);

                if (!productSnap.exists) throw new Error(`PRODUCT_NOT_FOUND:${productId}`);

                const productData = productSnap.data()!;
                const newStock = (productData.stock || 0) + qty;

                transaction.update(productRef, { stock: newStock });
            }

            if (pendingSnap.exists) {
                transaction.delete(pendingRef);
            }
            transaction.delete(transactionRef);
            const log = await prepareLog("transaction", transactionId, "DELETE", req.user!.uid, existingData, null);
            recordLog(transaction, log);
        });

        return res.status(200).json({message: "Transaction deleted successfully"});
    } catch (error) {
        return res.status(500).json({message: "Failed to delete transaction", error: (error as Error).message});
    }
};
