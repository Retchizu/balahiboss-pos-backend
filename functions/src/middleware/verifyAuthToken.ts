import { auth } from "@/config/firebaseConfig";
import { NextFunction, Request, Response } from "express";
import { FirebaseAuthError } from "firebase-admin/auth";

export const verifyAuthToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Unauthorized. No token provided" });
    }
    const decodedToken = await auth.verifyIdToken(token);
    req.user = { ...decodedToken, role: decodedToken.role };
    return next();
  } catch (error) {
    switch ((error as FirebaseAuthError).code) {
    case "auth/id-token-expired":
      return res
        .status(401)
        .json({ error: "Your session has expired. Please sign in again." });

    case "auth/argument-error":
      return res.status(400).json({ error: "Invalid token format." });

    case "auth/user-disabled":
      return res
        .status(403)
        .json({ error: "Your account has been disabled." });

    case "auth/user-not-found":
      return res.status(404).json({ error: "User not found." });

    default:
      return res.status(500).json({
        error: "Authentication failed. Please try again later.",
      });
    }
  }
};
