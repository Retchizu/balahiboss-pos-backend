import { signInUser } from "@/controllers/userController";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";
import { Router } from "express";

// eslint-disable-next-line new-cap
const router:Router = Router();

router.get("/verify", verifyAuthToken, verifyRole, signInUser);

export default router;
