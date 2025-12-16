import { Request, Response } from "express";
import { toPHTRange } from "@/utils/toPHTRange";
import { firestoreDb } from "@/config/firebaseConfig";

export const getActivityLogs = async (req: Request, res: Response) => {
    try {
        const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
        const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
        const {startIso, endIso} = toPHTRange(startDate, endDate);

        const activitiesRef = firestoreDb
            .collection("activities")
            .where("date", ">=", startIso)
            .where("date", "<=", endIso);

        const activities = await activitiesRef.get();

        console.log("activities", activities);
        return res.status(200).json({
            items: activities.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })),
        });
    } catch (error) {
        console.error("getActivityLogs error:", error);

        return res.status(500).json({
            error: "Failed to fetch activity logs. Please try again later.",
        });
    }
};
