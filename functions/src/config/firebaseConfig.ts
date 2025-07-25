import * as admin from "firebase-admin";
import serviceAccount from "@/serviceAccountKey.json";
import dotenv from "dotenv";

dotenv.config();

console.log("process.env.DATABASE_URL",
    process.env.DATABASE_URL);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        databaseURL: process.env.DATABASE_URL,
    });
}

const firestoreDb = admin.firestore();
const realtimeDb = admin.database();
const auth = admin.auth();

export {firestoreDb, realtimeDb, auth};
