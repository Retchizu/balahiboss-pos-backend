import { firestoreDb } from "@/config/firebaseConfig";
import allowedEmails from "@/types/allowedEmails";
import { Request, Response} from "express";

export const signInUser = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized. Please sign in." });
        }

        // Check allowed emails
        if (req.user.email && !allowedEmails.includes(req.user.email)) {
            return res.status(403).json({ error: "Forbidden. You don’t have access." });
        }
        if (req.user.role === "user") {
            const now = new Date().toISOString();
            const timesheetRef = firestoreDb.collection("timesheets");
            const activeSnap = await timesheetRef
                .where("uid", "==", req.user.uid)
                .where("status", "==", "active")
                .limit(1)
                .get();

            if (activeSnap.empty) {
                await timesheetRef.add({
                    uid: req.user.uid,
                    status: "active",
                    date: now,
                    duration: 0,
                    loginTime: now,
                    logoutTime: null,
                });
            }
        }
        return res.status(200).json({ user: req.user });
    } catch (error) {
        console.error("signInUser error:", error);

        return res.status(500).json({
            error: "Failed to sign in. Please try again later.",
        });
    }
};

export const signOutUser = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized." });
        }

        console.log(req.user.role, req.user.uid);
        if (req.user.role !== "admin") {
            const employeeId = req.user.uid;
            const timesheetRef = firestoreDb.collection("timesheets");
            const activeSnap = await timesheetRef
                .where("status", "==", "active")
                .where("uid", "==", employeeId)
                .limit(1)
                .get();
            if (!activeSnap.empty) {
                const doc = activeSnap.docs[0];
                const data = doc.data();

                const loginTime = new Date(data.loginTime);
                const logout = new Date();
                const durationMs = logout.getTime() - loginTime.getTime();
                const logoutIso = logout.toISOString();

                if (durationMs < 0) {
                    return res.status(400).json({ error: "Invalid logout time. Logout cannot be before login." });
                }

                await doc.ref.update({
                    logoutTime: logoutIso,
                    duration: durationMs,
                    status: "completed",
                });
            }
        }

        return res.status(200).json({
            message: "Signed Out successfully.",
        });
    } catch (error) {
        console.error("signOutUser error:", error);
        return res.status(500).json({ error: "Failed to sign out. Try again later." });
    }
};

