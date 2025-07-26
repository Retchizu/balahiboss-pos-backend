
import { auth } from "@/config/firebaseConfig";
import { NextFunction, Request, Response } from "express";
import { FirebaseAuthError } from "firebase-admin/auth";


export const verifyAuthToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({message: "Unauthorized"});
        }
        const decodedToken = await auth.verifyIdToken(token);
        req.user = {...decodedToken, role: decodedToken.role};
        return next();
    } catch (error) {
        switch ((error as FirebaseAuthError).code) {
        case "auth/id-token-expired":
            return res.status(401).json({ message: "Token expired. Please sign in again." });

        case "auth/argument-error":
            return res.status(400).json({ message: "Invalid token format." });
        case "auth/user-disabled":
            return res.status(403).json({ message: "User account is disabled." });
        case "auth/user-not-found":
            return res.status(404).json({ message: "User not found." });
        default:
            return res.status(500).json({ message: `Authentication failed: ${(error as Error).message}`});
        }
    }
};
