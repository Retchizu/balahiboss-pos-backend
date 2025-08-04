import { firestoreDb, realtimeDb } from "@/config/firebaseConfig";
import { transactionSchema } from "@/zod-schemas/transactionSchema";
import { Request, Response } from "express";

export const addTransaction = async (req: Request, res: Response) => {
    try {
        const transactionBody = transactionSchema.parse(req.body);
        const transactionRef = firestoreDb.collection("transactions");
        await transactionRef.add(transactionBody);

        // product logic after transaction
        const updatePromises = transactionBody.items.map(async (transaction) => {
            const productId = transaction.productId;
            const productRef = realtimeDb.ref(`products/${productId}`);
            const productSnapshot = await productRef.get();
            const product = productSnapshot.val();

            if (!product) throw new Error(`Product ${productId} not found`);

            const newQuantity = product.stock - transaction.quantity;
            if (newQuantity < 0) throw new Error(`Insufficient stock for product ${productId}`);

            await productRef.update({ stock: newQuantity });
        });

        await Promise.all(updatePromises);
        return res.status(200).json({message: "Transaction added successfully"});
    } catch (error) {
        return res.status(400).json({message: "Invalid transaction body", error: (error as Error).message});
    }
};

export const getTransactions = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        let startObj: Date;
        let endObj: Date;

        if (startDate && endDate) {
            startObj = new Date(startDate as string);
            endObj = new Date(endDate as string);
            endObj.setHours(23, 59, 59, 999);
        } else {
            const now = new Date();
            startObj = new Date(now);
            startObj.setHours(0, 0, 0, 0);
            endObj = new Date(now);
            endObj.setHours(23, 59, 59, 999);
        }

        const startIso = startObj.toISOString();
        const endIso = endObj.toISOString();

        const transactionRef = firestoreDb
            .collection("transactions")
            .where("date", ">=", startIso)
            .where("date", "<=", endIso);

        const transactions = await transactionRef.get();
        return res.status(200).json({
            items: transactions.docs.map((doc) => doc.data()),
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to get transactions",
            error: (error as Error).message,
        });
    }
};

export const updateTransaction = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.params;
        const transactionBody = transactionSchema.parse(req.body);
        const transactionRef = firestoreDb.collection("transactions").doc(transactionId);
        await transactionRef.update(transactionBody);
        return res.status(200).json({message: "Transaction updated successfully"});
    } catch (error) {
        return res.status(500).json({message: "Failed to update transaction", error: (error as Error).message});
    }
};


export const deleteTransaction = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.params;
        const transactionRef = firestoreDb.collection("transactions").doc(transactionId);
        await transactionRef.delete();
        return res.status(200).json({message: "Transaction deleted successfully"});
    } catch (error) {
        return res.status(500).json({message: "Failed to delete transaction", error: (error as Error).message});
    }
};
