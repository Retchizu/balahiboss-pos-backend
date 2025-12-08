import { firestoreDb } from "@/config/firebaseConfig";
import { Request, Response } from "express";
import { FirebaseError } from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const setPendingOrderStatus = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.query;
        const {status} = req.body;

        if (!transactionId || !status) {
            return res.status(400).json({error: "transactionId and status are required"});
        }
        const pendingOrderRef = firestoreDb.collection("pendingOrders").doc(`${transactionId}`);
        const pendingOrder = await pendingOrderRef.get();

        if (!pendingOrder.exists) {
            return res.status(404).json({ error: "Pending Order does not exist" });
        }

        await pendingOrderRef.update({ status: status, updatedAt: FieldValue.serverTimestamp() });
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

        const pendingOrderRef = firestoreDb.collection("pendingOrders").doc(`${transactionId}`);

        await firestoreDb.runTransaction(async (transaction) => {
            const pendingOrderSnap = await transaction.get(pendingOrderRef);

            if (!pendingOrderSnap.exists) {
                throw new Error("PENDING_ORDER_NOT_FOUND");
            }

            const pendingOrderData = pendingOrderSnap.data()!;
            const usersThatChecked: string[] = pendingOrderData.checkedBy || [];

            if (!usersThatChecked.includes(uid)) {
                const updatedCheckedBy = Array.from(new Set([...usersThatChecked, uid]));
                transaction.update(pendingOrderRef, { checkedBy: updatedCheckedBy });
            }
        });

        return res.status(200).json({ message: "Pending order status updated" });
    } catch (error) {
        console.error("readNewPendingOrder error:", error);

        if ((error as Error).message === "PENDING_ORDER_NOT_FOUND") {
            return res.status(404).json({ error: "Pending Order does not exist" });
        }

        if ((error as FirebaseError).code === "permission-denied") {
            return res.status(403).json({ error: "You don't have permission to update this pending order." });
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
