import { object, string } from "zod";

export const timesheetSchema = object({
  id: string(),
  date: string().optional(),
  loginTime: string().optional(),
  logoutTime: string().optional(),
  reason: string().optional(),
});
