import { addCustomer, deleteCustomer, getCustomers, updateCustomer } from "@/controllers/customerController";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";
import { Router } from "express";

// eslint-disable-next-line new-cap
const router: Router = Router();

router.post("/add", verifyAuthToken, verifyRole(["admin"]), addCustomer);
router.get("/list", verifyAuthToken, verifyRole(["admin", "user"]), getCustomers);
router.put("/update/:customerId", verifyAuthToken, verifyRole(["admin"]), updateCustomer);
router.delete("/delete/:customerId", verifyAuthToken, verifyRole(["admin"]), deleteCustomer);

export default router;
