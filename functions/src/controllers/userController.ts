import allowedEmails from "@/types/allowedEmails";
import { Request, Response} from "express";

export const signInUser = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized. Please sign in." });
        }

        // 🟢 Check allowed emails
        if (req.user.email && !allowedEmails.includes(req.user.email)) {
            return res.status(403).json({ error: "Forbidden. You don’t have access." });
        }

        return res.status(200).json({ user: req.user });
    } catch (error) {
        console.error("signInUser error:", error);

        return res.status(500).json({
            error: "Failed to sign in. Please try again later.",
        });
    }
};
