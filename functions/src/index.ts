import "module-alias/register";
import * as v2 from "firebase-functions/v2";
import express, { Express } from "express";
import cors from "cors";
import routes from "@/routes";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { firestoreDb, realtimeDb, storage } from "./config/firebaseConfig";


const app: Express = express();

app.use(cors());

app.use(express.json());

app.use(routes);


export const balahiboss = v2.https.onRequest(app);

export const deletePendingOrders = onSchedule(
    {
        schedule: "0 0 * * *", // every day at midnight
        timeZone: "Asia/Manila", // optional
    },
    async () => {
        try {
            const pendingOrdersRef = realtimeDb.ref("/pendingOrders");
            const pendingOrders = await pendingOrdersRef.get();
            if (!pendingOrders.exists()) {
                return;
            }

            await pendingOrdersRef.remove();
            console.log("All pending orders deleted at midnight.");
        } catch (error) {
            console.error("Error deleting pending orders:", error);
        }
    }
);


export const deleteActivityLog = onSchedule(
    {
        schedule: "0 0 * * *", // Every midnight
        timeZone: "Asia/Manila",
    },
    async () => {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
        const cutoffISO = new Date(cutoff).toISOString();

        console.log(`Deleting activity logs older than: ${cutoffISO}`);

        let deletedCount = 0;

        // Paginate through logs in batches of 500
        const processLogs = async (query: FirebaseFirestore.Query) => {
            const snapshot = await query.get();

            if (snapshot.empty) {
                console.log("No more logs to delete.");
                return false; // stop loop
            }

            for (const doc of snapshot.docs) {
                try {
                    const activity = doc.data() as {
                        id: string;
                        entity: string;
                        entityId: string;
                };

                    // Delete activity log
                    await doc.ref.delete();
                    deletedCount++;

                    // If entity is product, clean up history images
                    if (activity.entity === "product") {
                        const prefix = `products/history/${activity.entityId}/`;
                        const [files] = await storage.getFiles({ prefix });

                        for (const file of files) {
                            const [metadata] = await file.getMetadata();
                            const lastUpdated = new Date(metadata.updated!).getTime();

                            // Delete only if file is older than cutoff
                            if (lastUpdated < cutoff) {
                                await file.delete();
                                console.log(`Deleted old file: ${file.name}`);
                            }
                        }
                    }
                } catch (err) {
                    console.error(`Error deleting log ${doc.id}:`, err);
                }
            }

            // Continue with next page
            const lastDoc = snapshot.docs[snapshot.docs.length - 1];
            const nextQuery = firestoreDb
                .collection("activities")
                .where("date", "<", cutoffISO)
                .orderBy("date")
                .startAfter(lastDoc)
                .limit(500);

            return await processLogs(nextQuery);
        };

        // Start first page
        await processLogs(
            firestoreDb
                .collection("activities")
                .where("date", "<", cutoffISO)
                .orderBy("date")
                .limit(500)
        );

        console.log(`Deleted ${deletedCount} old activity logs.`);
    }
);
