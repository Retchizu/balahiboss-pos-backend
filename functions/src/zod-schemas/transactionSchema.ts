import { object, string, number, array } from "zod";

const productTransactionSchema = object({
    productId: string().min(1, {message: "Product ID is required"}),
    quantity: number().min(1, {message: "Quantity is required"}),
});


export const transactionSchema = object({
    customerId: string().min(1, {message: "Customer ID is required"}),
    items: array(productTransactionSchema),
    onlinePayment: number().min(0, {message: "Online Payment Fee cannot be negative"}),
    cashPayment: number().min(0, {message: "Cash Payment cannot be negative"}),
    date: string({error: "Date should not be empty"}),
    deliveryFee: number().min(0, {message: "Delivery fee cannot be negative"}).nullable(),
    discount: number().min(0, {message: "Discount cannot be negative"}).nullable(),
});

