import { object, string } from "zod";

export const timesheetSchema = object({
    id: string(),
    loginTime: string().optional(),
    logoutTime: string().optional(),
    reason: string().optional(),
});
