import allowedEmails from "@/types/allowedEmails";
import { Request, Response} from "express";

export const signInUser = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({message: "Unauthorized"});
        }
        if (req.user.email && !allowedEmails.includes(req.user.email)) {
            return res.status(403).json({message: "Forbidden"});
        }

        return res.status(200).json({user: req.user});
    } catch (error) {
        return res.status(500).json({message: (error as Error).message});
    }
};
