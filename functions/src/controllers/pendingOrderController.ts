import { realtimeDb } from "@/config/firebaseConfig";
import { Request, Response } from "express";
import { FirebaseError } from "firebase-admin";

export const setPendingOrderStatus = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.query;
        const {status} = req.body;

        if (!transactionId || !status) {
            return res.status(400).json({error: "transactionId and status are required"});
        }
        const pendingOrderRef = realtimeDb.ref(`pendingOrders/${transactionId}`);
        const pendingOrder = await pendingOrderRef.get();

        if (!pendingOrder.exists()) {
            return res.status(404).json({ error: "Pending Order does not exist" });
        }

        await pendingOrderRef.update({ status });
        return res.status(200).json({ message: "Pending order status updated" });
    } catch (error) {
        console.error("setPendingOrderStatus error:", error);

        if ((error as FirebaseError).code === "permission-denied") {
            return res.status(403).json({ error: "You don’t have permission to update pending orders." });
        }
        if ((error as FirebaseError).code === "unavailable") {
            return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
        }
        if ((error as FirebaseError).code === "resource-exhausted") {
            return res.status(507).json({ error: "Database quota exceeded. Please contact support." });
        }

        return res.status(500).json({
            error: "Failed to update pending order. Please try again later.",
        });
    }
};


export const readNewPendingOrder = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.query;
        const uid = req.user?.uid;
        if (!transactionId || !uid) {
            return res.status(400).json({error: "transactionId and uid is required"});
        }

        const pendingOrderRef = realtimeDb.ref(`pendingOrders/${transactionId}/checkedBy`);

        const result = await pendingOrderRef.transaction((currentData) => {
            const usersThatChecked: string[] = currentData ?? [];

            if (!usersThatChecked.includes(uid)) {
                currentData = [...usersThatChecked, uid];
            }

            return currentData; // commit changes
        });

        if (!result.committed) {
            return res.status(404).json({ error: "Pending Order does not exist" });
        }

        return res.status(200).json({ message: "Pending order status updated" });
    } catch (error) {
        console.error("readNewPendingOrder error:", error);

        if ((error as FirebaseError).code === "permission-denied") {
            return res.status(403).json({ error: "You don’t have permission to update this pending order." });
        }
        if ((error as FirebaseError).code === "unavailable") {
            return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
        }
        if ((error as FirebaseError).code === "resource-exhausted") {
            return res.status(507).json({ error: "Database quota exceeded. Please contact support." });
        }

        return res.status(500).json({
            error: "Failed to update pending order. Please try again later.",
        });
    }
};
