import { getEmployees,
    getEmployeeTimesheet,
    getEmployeeTimesheets,
    setEmployeeRate,
    updateEmployeeTimeSheet,
} from "@/controllers/employeeController";
import { verifyAuthToken } from "@/middleware/verifyAuthToken";
import { verifyRole } from "@/middleware/verifyRole";
import { Router } from "express";

// eslint-disable-next-line new-cap
const router: Router = Router();

router.post("/set-rate", verifyAuthToken, verifyRole(["admin"]), setEmployeeRate);
router.get("/list", verifyAuthToken, verifyRole(["admin"]), getEmployees);
router.get("/timesheet/list", verifyAuthToken, verifyRole(["admin"]), getEmployeeTimesheets);
router.get("/timesheet", verifyAuthToken, verifyRole(["admin"]), getEmployeeTimesheet);
router.patch("/timesheet/update", verifyAuthToken, verifyRole(["admin"]), updateEmployeeTimeSheet);


export default router;
