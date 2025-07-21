import { realtimeDb } from "@/config/firebaseConfig";
import { customerSchema } from "@/zod-schemas/customerSchema";
import { Request, Response } from "express";

export const addCustomer = async (req: Request, res: Response) => {
    try {
        const customerBody = customerSchema.parse(req.body);
        const customer = await realtimeDb.ref("customers").push(customerBody);
        return res.status(201).json({message: "Customer added successfully", customer});
    } catch (error) {
        return res.status(500).json({message: "Failed to add customer", error: (error as Error).message});
    }
};

export const getCustomers = async (req: Request, res: Response) => {
    try {
        const customers = await realtimeDb.ref("customers").get();
        return res.status(200).json({items: customers.val()});
    } catch (error) {
        return res.status(500).json({message: "Failed to get customers", error: (error as Error).message});
    }
};

export const updateCustomer = async (req: Request, res: Response) => {
    try {
        const {customerId} = req.params;
        const customerBody = customerSchema.parse(req.body);
        const customerRef = realtimeDb.ref(`customers/${customerId}`);
        const customer = await customerRef.get();
        if (!customer.exists()) {
            return res.status(404).json({message: "Customer not found"});
        }
        await customerRef.update(customerBody);
        return res.status(200).json({message: "Customer updated successfully", customer});
    } catch (error) {
        return res.status(500).json({message: "Failed to update customer", error: (error as Error).message});
    }
};

export const deleteCustomer = async (req: Request, res: Response) => {
    try {
        const {customerId} = req.params;
        const customerRef = realtimeDb.ref(`customers/${customerId}`);
        const customer = await customerRef.get();
        if (!customer.exists()) {
            return res.status(404).json({message: "Customer not found"});
        }
        await customerRef.remove();
        return res.status(200).json({message: "Customer deleted successfully"});
    } catch (error) {
        return res.status(500).json({message: "Failed to delete customer", error: (error as Error).message});
    }
};
