import { realtimeDb } from "@/config/firebaseConfig";
import { Request, Response } from "express";

export const setPendingOrderStatus = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.query;
        const {status} = req.body;

        if (!transactionId || !status) {
            return res.status(400).json({message: "transactionId and status are required"});
        }
        const pendingOrderRef = realtimeDb.ref(`pendingOrders/${transactionId}`);
        const pendingOrder = await pendingOrderRef.get();

        if (!pendingOrder.exists()) {
            return res.status(404).json({ message: "Pending Order does not exist" });
        }

        await pendingOrderRef.update({ status });
        return res.status(200).json({ message: "Pending order status updated" });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update pending order",
            error: (error as Error).message,
        });
    }
};


export const readNewPendingOrder = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.query;
        const uid = req.user?.uid;
        if (!transactionId || !uid) {
            return res.status(400).json({message: "transactionId and uid is required"});
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
            return res.status(404).json({ message: "Pending Order does not exist" });
        }

        return res.status(200).json({ message: "Pending order status updated" });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update pending order",
            error: (error as Error).message,
        });
    }
};
