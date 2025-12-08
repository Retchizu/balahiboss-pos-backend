import { firestoreDb } from "@/config/firebaseConfig";
import Customer from "@/types/Customer";
import recordLog, { prepareLog } from "@/utils/recordLog";
import { customerSchema } from "@/zod-schemas/customerSchema";
import { Request, Response } from "express";
import { FirebaseError } from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { ZodError } from "zod";

export const addCustomer = async (req: Request, res: Response) => {
    try {
        const customerBody = customerSchema.parse(req.body);


        const customerRef = firestoreDb.collection("customers");
        const newCustomerRef = customerRef.doc();
        const log = await prepareLog("customer", newCustomerRef.id, "CREATE", req.user!.uid, null, customerBody);
        const existingCustomerRef = customerRef.where("customerName", "==", customerBody.customerName);
        await firestoreDb.runTransaction(async (transaction) => {
            const customer = await transaction.get(existingCustomerRef);
            if (!customer.empty) {
                const conflict = customer.docs.some((doc) => doc.data().deleted !== true);
                if (conflict) throw new Error("CUSTOMER_CONFLICT");
            }
            transaction.set(newCustomerRef, {...customerBody, updatedAt: FieldValue.serverTimestamp()});
            recordLog(transaction, log);
        });

        return res.status(201).json({message: "Customer added successfully"});
    } catch (error) {
        console.error("addCustomer error:", error);

        if (error instanceof ZodError) {
            return res.status(400).json({
                error: "Invalid customer data. Please check the inputs.",
            });
        }

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

        if ((error as Error).message === "CUSTOMER_CONFLICT") {
            return res.status(409).json({ error: `${req.body.customerName} already exists` });
        }

        return res.status(500).json({
            error: "Failed to add customer. Please try again later.",
        });
    }
};

export const getCustomers = async (req: Request, res: Response) => {
    try {
        const customers = await firestoreDb.collection("customers").get();
        const customerRecord: Record<string, Customer> = {};
        customers.docs.forEach((customer) => {
            customerRecord[customer.id] = customer.data() as Customer;
        });
        return res.status(200).json({items: customerRecord});
    } catch (error) {
        return res.status(500).json({message: "Failed to get customers", error: (error as Error).message});
    }
};

export const updateCustomer = async (req: Request, res: Response) => {
    try {
        const {customerId} = req.params;
        const customerBody = customerSchema.parse(req.body);
        const customerRef = firestoreDb.collection("customers").doc(customerId);

        const customer = await customerRef.get();
        if (!customer.exists) {
            return res.status(404).json({error: "Customer not found"});
        }

        const beforeSnapshot = customer.data();
        const afterSnapshot = { ...beforeSnapshot, ...customerBody };
        const log = await prepareLog("customer", customerId, "UPDATE", req.user!.uid, beforeSnapshot, afterSnapshot);
        await firestoreDb.runTransaction(async (transaction) => {
            transaction.update(customerRef, {...customerBody, updatedAt: FieldValue.serverTimestamp()});
            recordLog(transaction, log);
        });

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
        console.log("customerId", customerId);
        const customerRef = firestoreDb.collection("customers").doc(customerId);
        const customer = await customerRef.get();
        if (!customer.exists) {
            return res.status(404).json({error: "Customer not found"});
        }
        const beforeSnapshot = customer.data();
        const log = await prepareLog("customer", customerId, "DELETE", req.user!.uid, beforeSnapshot, null);
        await firestoreDb.runTransaction(async (transaction) => {
            transaction.update(customerRef, {deleted: true});
            recordLog(transaction, log);
        });

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
