import { realtimeDb } from "@/config/firebaseConfig";
import { Request, Response } from "express";

export const setPendingOrderStatus = async (req: Request, res: Response) => {
    try {
        const {transactionId} = req.query;
        const {status} = req.body;
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
