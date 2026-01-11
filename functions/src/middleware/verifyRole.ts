import { NextFunction, Request, Response } from "express";

export const verifyRole = (requiredRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ error: "Unauthorized. No user context found." });
      }
      if (!requiredRoles.includes(req.user.role)) {
        return res
          .status(403)
          .json({
            error: "Forbidden. You don’t have access to this resource.",
          });
      }
      console.log("did run in verifyRole");
      return next();
    } catch (error) {
      console.error("verifyRole Error:", error);
      return res.status(500).json({
        error: "Role verification failed. Please try again later.",
      });
    }
  };
};
