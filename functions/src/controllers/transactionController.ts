import { firestoreDb } from "@/config/firebaseConfig";
import { transactionArraySchema } from "@/zod-schemas/transactionSchema";
import { Request, Response } from "express";

export const addTransaction = async (req: Request, res: Response) => {
    try {
        const transactionBody = transactionArraySchema.parse(req.body);
        const transactionRef = firestoreDb.collection("transactions");
        await transactionRef.add(transactionBody);
        return res.status(200).json({message: "Transaction added successfully"});
    } catch (error) {
        return res.status(400).json({message: "Invalid transaction body", error: (error as Error).message});
    }
};

export const getTransactions = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        let start: Date;
        let end: Date;

        if (startDate && endDate) {
            // Use provided date range
            start = new Date(startDate as string);
            end = new Date(endDate as string);
            end.setHours(23, 59, 59, 999);
        } else {
            // Default to today
            const now = new Date();
            start = new Date(now);
            start.setHours(0, 0, 0, 0);
            end = new Date(now);
            end.setHours(23, 59, 59, 999);
        }
        const transactionRef = firestoreDb
            .collection("transactions")
            .where("date", ">=", start)
            .where("date", "<=", end);
        const transactions = await transactionRef.get();
        return res.status(200).json({items: transactions.docs.map((doc) => doc.data())});
    } catch (error) {
        return res.status(500).json({message: "Failed to get transactions", error: (error as Error).message});
    }
};

export const updateTransaction = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.params;
        const transactionBody = transactionArraySchema.parse(req.body);
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
