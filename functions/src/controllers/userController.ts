import { firestoreDb } from "@/config/firebaseConfig";
import allowedEmails from "@/types/allowedEmails";
import { Request, Response } from "express";
import { endOfDay, isSameDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const timeZone = "Asia/Manila";

/**
 * Caps logout time at 11:59 PM of the login day if logout is on a different day
 * @param {Date} loginTime - The login time
 * @param {Date} logoutTime - The logout time
 * @return {string} The capped logout time in ISO string format
 */
const capLogoutAtEndOfLoginDay = (
  loginTime: Date,
  logoutTime: Date
): string => {
  const loginInPht = toZonedTime(loginTime, timeZone);
  const logoutInPht = toZonedTime(logoutTime, timeZone);

  // Check if login and logout are on the same day
  if (!isSameDay(loginInPht, logoutInPht)) {
    // Cap logout at 11:59:59.999 PM of the login day
    const endOfLoginDay = endOfDay(loginInPht);
    const endOfLoginDayUtc = fromZonedTime(endOfLoginDay, timeZone);
    return endOfLoginDayUtc.toISOString();
  }

  // Same day, return logout time as is
  return logoutTime.toISOString();
};

export const signInUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized. Please sign in." });
    }

    // Check allowed emails
    if (req.user.email && !allowedEmails.includes(req.user.email)) {
      return res
        .status(403)
        .json({ error: "Forbidden. You don’t have access." });
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

        // Cap logout at 11:59 PM of login day if on different days
        const logoutIso = capLogoutAtEndOfLoginDay(loginTime, logout);
        const cappedLogoutTime = new Date(logoutIso);
        const durationMs = cappedLogoutTime.getTime() - loginTime.getTime();

        if (durationMs < 0) {
          return res
            .status(400)
            .json({
              error: "Invalid logout time. Logout cannot be before login.",
            });
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
    return res
      .status(500)
      .json({ error: "Failed to sign out. Try again later." });
  }
};
