import { firestoreDb } from "@/config/firebaseConfig";
import { employeeRateSchema } from "@/zod-schemas/employeeRateSchema";
import { timesheetSchema } from "@/zod-schemas/timesheetSchema";
import { Request, Response } from "express";
import { getAuth, UserRecord } from "firebase-admin/auth";
import { ZodError } from "zod";
import { toPHTRange } from "./transactionController";

export const getEmployees = async (req: Request, res: Response) => {
    try {
        const auth = getAuth();
        const allUsers: UserRecord[] = [];

        let nextPageToken: string | undefined;
        do {
            const list = await auth.listUsers(1000, nextPageToken);
            allUsers.push(...list.users);
            nextPageToken = list.pageToken;
        } while (nextPageToken);

        const employees = allUsers
            .filter((user) => user.customClaims?.role === "user")
            .map((user) => ({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                role: user.customClaims?.role,
            }));

        const ratesSnap = await firestoreDb.collection("rates").get();
        const ratesMap = new Map<string, number>();
        ratesSnap.forEach((doc) => {
            const data = doc.data();
            ratesMap.set(doc.id, data.rate); // doc.id == uid
        });

        const employeesWithRates = employees.map((emp) => ({
            ...emp,
            rate: ratesMap.get(emp.uid) || 0,
        }));

        return res.status(200).json({ employees: employeesWithRates });
    } catch (error) {
        console.error("getEmployees error:", error);
        return res.status(500).json({ error: "Failed to fetch employees" });
    }
};


export const setEmployeeRate = async (req: Request, res: Response) => {
    try {
        const { uid, rate } = employeeRateSchema.parse(req.body);
        const ratesRef = firestoreDb.collection("rates").doc(uid);
        await ratesRef.set({
            rate,
        });
        return res.status(200).json({
            message: "Employee rate saved successfully.",
        });
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                error: "Invalid rate data. Please check your inputs.",
            });
        }

        console.error("setEmployeeRate error:", error);
        return res.status(500).json({
            error: "Failed to save employee rate. Please try again later.",
        });
    }
};

export const getEmployeeTimesheets = async (req: Request, res: Response) => {
    try {
        const { uid } = req.query;

        const startDate =
            typeof req.query.startDate === "string" ? req.query.startDate : undefined;
        const endDate =
            typeof req.query.endDate === "string" ? req.query.endDate : undefined;

        if (!uid || typeof uid !== "string") {
            return res.status(400).json({ error: "Employee UID is required." });
        }

        const { startIso, endIso } = toPHTRange(startDate, endDate);

        const timesheetsRef = firestoreDb.collection("timesheets");
        const snapshot = await timesheetsRef
            .where("uid", "==", uid)
            .where("loginTime", ">=", startIso)
            .where("loginTime", "<=", endIso)
            .get();

        const timesheets = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

        const rate = await firestoreDb.collection("rates").doc(uid).get();
        const rateData = rate.data();
        const hourlyRate: number = rateData ? rateData.rate : 0;

        if (snapshot.empty) {
            return res.status(200).json({ timesheets: [], rate: hourlyRate });
        }

        return res.status(200).json({ timesheets, rate: hourlyRate });
    } catch (error) {
        console.error("getEmployeeTimeSheet error:", error);
        return res.status(500).json({ error: "Failed to fetch employee timesheets." });
    }
};

export const getEmployeeTimesheet = async (req: Request, res: Response) => {
    try {
        const { id } = req.query;
        if (!id || typeof id !== "string") {
            return res.status(400).json({ error: "Timesheet Id is required." });
        }

        const timesheetsRef = firestoreDb.collection("timesheets").doc(id);
        const snapshot = await timesheetsRef
            .get();

        const timesheet = snapshot.data();

        return res.status(200).json({ timesheet });
    } catch (error) {
        console.error("getEmployeeTimeSheet error:", error);
        return res.status(500).json({ error: "Failed to fetch employee timesheets." });
    }
};

export const updateEmployeeTimeSheet = async (req: Request, res: Response) => {
    try {
        const { id, loginTime, logoutTime, reason } = timesheetSchema.parse(req.body);

        const timesheetRef = firestoreDb.collection("timesheets").doc(id);
        const docSnap = await timesheetRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ error: "Timesheet not found." });
        }

        const data = docSnap.data();
        if (!data) {
            return res.status(400).json({ error: "Invalid timesheet data." });
        }

        const updatedLogin = loginTime ? new Date(loginTime) : data.loginTime.toDate();
        const updatedLogout = logoutTime ? new Date(logoutTime) : data.logoutTime?.toDate();

        if (updatedLogout && updatedLogout < updatedLogin) {
            return res.status(400).json({
                error: "Logout time cannot be earlier than login time.",
            });
        }
        const durationMs = updatedLogout.getTime() - updatedLogin.getTime();

        await timesheetRef.update({
            loginTime: updatedLogin,
            logoutTime: updatedLogout || null,
            duration: durationMs,
            updatedAt: new Date(),
            reason: reason,
        });

        return res.status(200).json({ message: "Timesheet updated successfully." });
    } catch (error) {
        console.error("updateEmployeeTimeSheet error:", error);
        return res.status(500).json({ error: "Failed to update timesheet." });
    }
};
