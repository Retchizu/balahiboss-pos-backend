import { object, string, number, array, enum as enum_, date } from "zod";

const transactionSchema = object({
    customerId: string().min(1, {message: "Customer ID is required"}),
    productId: string().min(1, {message: "Product ID is required"}),
    quantity: number().min(1, {message: "Quantity is required"}),
});


export const transactionArraySchema = object({
    items: array(transactionSchema),
    paymentMethod: enum_(["cash", "online"]),
    paymentStatus: enum_(["paid", "unpaid"]),
    date: date().default(new Date()),
    deliveryFee: number().min(0, {message: "Delivery fee cannot be negative"}),
    discount: number().min(0, {message: "Discount cannot be negative"}),
});

