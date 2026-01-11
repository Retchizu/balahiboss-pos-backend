import { object, string } from "zod";

export const customerSchema = object({
  customerName: string().min(3, {
    message: "Customer name must be at least 3 characters long",
  }),
  customerInfo: string().optional(),
});
