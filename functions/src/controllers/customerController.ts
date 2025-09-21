import { realtimeDb } from "@/config/firebaseConfig";
import recordLog from "@/utils/recordLog";
import { customerSchema } from "@/zod-schemas/customerSchema";
import { Request, Response } from "express";
import { FirebaseError } from "firebase-admin";
import { ZodError } from "zod";

export const addCustomer = async (req: Request, res: Response) => {
    try {
        const customerBody = customerSchema.parse(req.body);

        const customerRef = realtimeDb.ref("customers");
        const customer = await customerRef.orderByChild("customerName").equalTo(customerBody.customerName).get();

        if (customer.exists()) {
            let conflict = false;
            customer.forEach((c) => {
                if (c.val().deleted !== true) {
                    conflict = true;
                    return true; // Exit loop early
                }
                return false;
            });
            if (conflict) return res.status(409).json({error: `${customerBody.customerName} already exists`});
        }


        const newCustomer = await customerRef.push(customerBody);

        const {customerName, customerInfo} = customerBody;
        const afterSnapshot = {
            customerName,
            customerInfo,
        };

        await recordLog("customer", newCustomer.key!, "CREATE", req.user!.uid, null, afterSnapshot);
        return res.status(201).json({message: "Customer added successfully", newCustomer});
    } catch (error) {
        console.error("addCustomer error:", error);

        // 🟢 Input validation error
        if (error instanceof ZodError) {
            return res.status(400).json({
                error: "Invalid customer data. Please check the inputs.",
            });
        }

        // 🟢 Firebase specific errors
        if ((error as FirebaseError).code === "permission-denied") {
            return res.status(403).json({
                error: "You don’t have permission to add customers.",
            });
        }

        if ((error as FirebaseError).code === "unavailable") {
            return res.status(503).json({
                error: "Service temporarily unavailable. Please try again later.",
            });
        }

        if ((error as FirebaseError).code === "resource-exhausted") {
            return res.status(507).json({
                error: "Database quota exceeded. Please contact support.",
            });
        }

        return res.status(500).json({
            error: "Failed to add customer. Please try again later.",
        });
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
            return res.status(404).json({error: "Customer not found"});
        }

        const beforeSnapshot = customer.val();

        await customerRef.update(customerBody);

        const afterSnapshot = { ...beforeSnapshot, ...customerBody };

        await recordLog(
            "customer",
            customerId,
            "UPDATE",
            req.user!.uid,
            beforeSnapshot,
            afterSnapshot
        );
        return res.status(200).json({message: "Customer updated successfully", customer});
    } catch (error) {
        console.error("updateCustomer error:", error);

        if (error instanceof ZodError) {
            return res.status(400).json({
                error: "Invalid customer data. Please check the inputs.",
            });
        }

        if ((error as FirebaseError).code === "permission-denied") {
            return res.status(403).json({ error: "You don’t have permission to update customers." });
        }
        if ((error as FirebaseError).code === "unavailable") {
            return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
        }
        if ((error as FirebaseError).code === "resource-exhausted") {
            return res.status(507).json({ error: "Database quota exceeded. Please contact support." });
        }

        return res.status(500).json({
            error: "Failed to update customer. Please try again later.",
        });
    }
};

export const deleteCustomer = async (req: Request, res: Response) => {
    try {
        const {customerId} = req.params;
        const customerRef = realtimeDb.ref(`customers/${customerId}`);
        const customer = await customerRef.get();
        if (!customer.exists()) {
            return res.status(404).json({error: "Customer not found"});
        }

        const beforeSnapshot = customer.val();

        await customerRef.update({deleted: true});

        await recordLog(
            "customer",
            customerId,
            "DELETE",
            req.user!.uid,
            beforeSnapshot,
            null
        );

        return res.status(200).json({message: "Customer deleted successfully"});
    } catch (error) {
        console.error("deleteCustomer error:", error);

        if ((error as FirebaseError).code === "permission-denied") {
            return res.status(403).json({ error: "You don’t have permission to delete customers." });
        }
        if ((error as FirebaseError).code === "unavailable") {
            return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
        }
        if ((error as FirebaseError).code === "resource-exhausted") {
            return res.status(507).json({ error: "Database quota exceeded. Please contact support." });
        }

        return res.status(500).json({
            error: "Failed to delete customer. Please try again later.",
        });
    }
};
