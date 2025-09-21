import { object, string, number } from "zod";

export const productSchema = object({
    productName: string().min(1, { message: "Product name is required" }),
    stockPrice: number().min(0, { message: "Stock price cannot be negative" }),
    sellPrice: number().min(0, { message: "Sell price cannot be negative" }),
    stock: number().min(0, { message: "Stock cannot be negative" }),
    base64Image: string().optional(),
});
