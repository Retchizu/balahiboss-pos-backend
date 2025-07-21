
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
            return next();
        } catch (error) {
            res.status(500).json({message: `Authentication failed ${(error as Error).message}`});
        }
    };
};
