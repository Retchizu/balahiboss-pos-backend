import {
  addTransaction,
  deleteTransaction,
  getTransactions,
  updateTransaction,
} from "@/controllers/transactionController";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";
import { Router } from "express";

// eslint-disable-next-line new-cap
const router: Router = Router();

router.post(
  "/add",
  verifyAuthToken,
  verifyRole(["admin", "user"]),
  addTransaction
);
router.get(
  "/",
  verifyAuthToken,
  verifyRole(["admin", "user"]),
  getTransactions
);
router.put(
  "/update/:transactionId",
  verifyAuthToken,
  verifyRole(["admin"]),
  updateTransaction
);
router.delete(
  "/delete/:transactionId",
  verifyAuthToken,
  verifyRole(["admin"]),
  deleteTransaction
);

export default router;
