
import { NextFunction, Request, Response } from "express";

export const verifyRole = (requiredRoles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                return res.status(401).json({message: "Unauthorized"});
            }
            if (!requiredRoles.includes(req.user.role)) {
                return res.status(403).json({message: "Forbidden"});
            }
            console.log("did run in verifyRole");
            return next();
        } catch (error) {
            return res.status(500).json({message: `Authentication failed ${(error as Error).message}`});
        }
    };
};
