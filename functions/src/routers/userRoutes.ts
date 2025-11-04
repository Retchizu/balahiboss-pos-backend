import { signInUser, signOutUser } from "@/controllers/userController";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";
import { Router } from "express";

// eslint-disable-next-line new-cap
const router:Router = Router();

router.get("/sign-in", verifyAuthToken, verifyRole(["admin", "user"]), signInUser);
router.get("/sign-out", verifyAuthToken, verifyRole(["admin", "user"]), signOutUser);

export default router;
