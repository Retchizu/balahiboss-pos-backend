import { firestoreDb, realtimeDb } from "@/config/firebaseConfig";
import recordLog from "@/utils/recordLog";
import { transactionSchema } from "@/zod-schemas/transactionSchema";
import { endOfDay, startOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { Request, Response } from "express";

export const addTransaction = async (req: Request, res: Response) => {
    try {
        const transactionBody = transactionSchema.parse(req.body);
        const transactionRef = firestoreDb.collection("transactions");
        const transaction = await transactionRef.add(transactionBody);

        // product logic after transaction
        const updatePromises = transactionBody.items.map(async (item) => {
            const productId = item.productId;
            const productRef = realtimeDb.ref(`products/${productId}`);
            const productSnapshot = await productRef.get();
            const product = productSnapshot.val();

            if (!product) throw new Error(`Product ${productId} not found`);

            const newQuantity = product.stock - item.quantity;
            if (newQuantity < 0) throw new Error(`Insufficient stock for product ${productId}`);

            await productRef.update({ stock: newQuantity });
        });

        await Promise.all(updatePromises);

        // if sending to an employee in pending orders
        if (transactionBody.pending) {
            const pendingOrderRef = realtimeDb.ref(`pendingOrders/${transaction.id}`);
            await pendingOrderRef.set({
                transaction: transactionBody,
                orderInformation: transactionBody.orderInformation || "",
                complete: false,
                date: new Date().toISOString(),
            });
        }

        await recordLog(
            "transaction",
            transaction.id,
            "CREATE",
            req.user!.uid,
            null,
            transactionBody
        );
        return res.status(200).json({message: "Transaction added successfully"});
    } catch (error) {
        return res.status(500).json({message: "Invalid transaction", error: (error as Error).message});
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

        const transactionRef = firestoreDb.collection("transactions").doc(transactionId);
        const existingDoc = await transactionRef.get();

        if (!existingDoc.exists) {
            return res.status(404).json({ message: "Transaction not found" });
        }

        const existingData = existingDoc.data();
        const oldItems: Item[] = existingData?.items || [];

        const oldItemMap = getItemMap(oldItems);
        const newItemMap = getItemMap(newItems);

        // Set of all involved productIds
        const productIds = new Set<string>([
            ...oldItemMap.keys(),
            ...newItemMap.keys(),
        ]);

        const updates = [];

        for (const productId of productIds) {
            const oldQty = oldItemMap.get(productId) || 0;
            const newQty = newItemMap.get(productId) || 0;
            const diff = newQty - oldQty;

            if (diff !== 0) {
                const productStockRef = realtimeDb.ref(`products/${productId}/stock`);

                updates.push(
                    productStockRef.transaction((currentStock: number) => {
                        if (typeof currentStock !== "number") currentStock = 0;
                        return currentStock - diff;
                    })
                );
            }
        }

        await Promise.all(updates);
        const beforeSnapshot = existingData;

        await transactionRef.update(transactionBody);

        await recordLog(
            "transaction",
            transactionId,
            "UPDATE",
            req.user!.uid,
            beforeSnapshot,
            transactionBody // after snapshot
        );

        // if sending to an employee in pending orders
        if (transactionBody.pending) {
            const pendingOrderRef = realtimeDb.ref(`pendingOrders/${transactionId}`);
            const pendingOrder = await pendingOrderRef.get();

            if (!pendingOrder.exists()) {
                return res.status(404).json({message: "pendingOrder not found"});
            }
            await pendingOrderRef.set({
                transaction: transactionBody,
                orderInformation: transactionBody.orderInformation || "",
                complete: pendingOrder.val().complete,
                date: new Date().toISOString(),
            });
        }

        return res
            .status(200)
            .json({ message: "Transaction updated successfully" });
    } catch (error) {
        return res.status(500).json({message: "Failed to update transaction", error: (error as Error).message});
    }
};


export const deleteTransaction = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.params;
        if (!transactionId) {
            return res.status(400).json({ message: "transactionId is required" });
        }
        const transactionRef = firestoreDb.collection("transactions").doc(transactionId);

        const existingDoc = await transactionRef.get();
        if (!existingDoc.exists) {
            return res.status(404).json({message: "Transaction does not exists"});
        }
        const existingData = existingDoc.data();
        const items: Item[] = existingData?.items || [];
        const itemMap = getItemMap(items);
        const productIds = itemMap.keys();

        const updates = [];
        for (const productId of productIds) {
            const productQty = itemMap.get(productId) || 0;
            const productStockRef = realtimeDb.ref(`products/${productId}/stock`);
            updates.push(
                productStockRef.transaction((currentStock: number) => {
                    return currentStock + productQty;
                })
            );
        }

        const pendingOrderRef = realtimeDb.ref(`pendingOrders/${transactionId}`);
        const pendingOrder = await pendingOrderRef.get();

        if (pendingOrder.exists()) {
            await pendingOrderRef.remove();
        }

        await Promise.all(updates);

        await recordLog(
            "transaction",
            transactionId,
            "DELETE",
            req.user!.uid,
            existingData,
            null
        );
        await transactionRef.delete();
        return res.status(200).json({message: "Transaction deleted successfully"});
    } catch (error) {
        return res.status(500).json({message: "Failed to delete transaction", error: (error as Error).message});
    }
};
