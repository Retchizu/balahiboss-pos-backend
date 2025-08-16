import { realtimeDb } from "@/config/firebaseConfig";
import { Request, Response } from "express";

export const markCompleteThePendingOrder = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.query;
        const {complete}: {complete: boolean} = req.body;

        if (typeof complete !== "boolean") {
            return res.status(400).json({message: "'complete' must be a boolean"});
        }
        console.log(transactionId);
        const pendingOrderRef = realtimeDb.ref(`pendingOrders/${transactionId}`);
        const pendingOrder = await pendingOrderRef.get();
        if (!pendingOrder.exists()) {
            return res.status(404).json({message: "Pending Order does not exist"});
        }
        await pendingOrderRef.update({ complete });
        return res.status(200).json({ message: "Pending order status updated" });
    } catch (error) {
        return res.status(500).json({ message: "Failed to update pending order", error: (error as Error).message });
    }
};

export const markIncompleteThePendingOrder = async (req: Request, res: Response) => {
    try {
        const { transactionId } = req.query;

        const pendingOrderRef = realtimeDb.ref(`pendingOrders/${transactionId}`);
        const pendingOrder = await pendingOrderRef.get();

        if (!pendingOrder.exists()) {
            return res.status(404).json({ message: "Pending Order does not exist" });
        }

        await pendingOrderRef.update({ complete: false });

        return res.status(200).json({ message: "Pending order marked as incomplete" });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update pending order",
            error: (error as Error).message,
        });
    }
};
