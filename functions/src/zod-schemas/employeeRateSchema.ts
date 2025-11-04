import { number, object, string } from "zod";

export const employeeRateSchema = object({
    uid: string(),
    rate: number(),
});
