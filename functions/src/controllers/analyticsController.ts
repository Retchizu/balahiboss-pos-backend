import { firestoreDb } from "@/config/firebaseConfig";
import { Request, Response } from "express";
import Transaction from "@/types/Transaction";
import TopCustomer from "@/types/metrics/TopCustomer";
import Customer from "@/types/Customer";
import { FieldPath } from "firebase-admin/firestore";
import { toPHTRange } from "@/utils/toPHTRange";
import Product from "@/types/Product";
import MaxStock from "@/types/metrics/MaxStock";

type SortBy = "totalPaid" | "purchaseCount";

export const getTopCustomers = async (req: Request, res: Response) => {
    try {
        const startDate =
            typeof req.query.startDate === "string"
                ? req.query.startDate
                : undefined;
        const endDate =
            typeof req.query.endDate === "string"
                ? req.query.endDate
                : undefined;
        const limit =
            typeof req.query.limit === "string"
                ? Math.max(0, Number(req.query.limit) || 0)
                : 20;
        const sortBy: SortBy =
            typeof req.query.sortBy === "string" &&
            req.query.sortBy === "purchaseCount"
                ? "purchaseCount"
                : "totalPaid";

        const { startIso, endIso } = toPHTRange(startDate, endDate);

        const snapshot = await firestoreDb
            .collection("transactions")
            .where("date", ">=", startIso)
            .where("date", "<=", endIso)
            .get();

        const agg = new Map<
            string,
            { purchaseCount: number; totalPaid: number }
        >();

        for (const doc of snapshot.docs) {
            const tx = doc.data() as Transaction;
            const customerId =
                typeof tx.customerId === "string" && tx.customerId.length > 0
                    ? tx.customerId
                    : "unknownCustomer";
            const cash =
                typeof tx.cashPayment === "number" ? tx.cashPayment : 0;
            const online =
                typeof tx.onlinePayment === "number" ? tx.onlinePayment : 0;
            const paid = cash + online;

            const cur = agg.get(customerId) ?? {
                purchaseCount: 0,
                totalPaid: 0,
            };
            cur.purchaseCount += 1;
            cur.totalPaid += paid;
            agg.set(customerId, cur);
        }

        const customerIds = [...agg.keys()].filter(
            (id) => id !== "unknownCustomer"
        );
        const customerNameById = new Map<string, string>();

        // Batch fetch customers. (Implementation detail: chunk to 10 for Firestore 'in' queries.)
        for (let i = 0; i < customerIds.length; i += 10) {
            const chunk = customerIds.slice(i, i + 10);
            const customersSnap = await firestoreDb
                .collection("customers")
                .where(FieldPath.documentId(), "in", chunk)
                .get();

            for (const cdoc of customersSnap.docs) {
                const c = cdoc.data() as Customer;
                if (c.deleted === true) continue;
                if (
                    typeof cdoc.id === "string" &&
                    typeof c.customerName === "string"
                ) {
                    customerNameById.set(cdoc.id, c.customerName);
                }
            }
        }
        const rows: TopCustomer[] = [...agg.entries()].map(
            ([customerId, value]) => ({
                customerId,
                customerName:
                    customerId === "unknownCustomer"
                        ? null
                        : customerNameById.get(customerId) ?? null,
                purchaseCount: value.purchaseCount,
                totalPaid: value.totalPaid,
            })
        );

        rows.sort((a, b) => {
            if (sortBy === "purchaseCount") {
                if (b.purchaseCount !== a.purchaseCount)
                    return b.purchaseCount - a.purchaseCount;
                if (b.totalPaid !== a.totalPaid)
                    return b.totalPaid - a.totalPaid;
                return 0;
            }
            // totalPaid
            if (b.totalPaid !== a.totalPaid) return b.totalPaid - a.totalPaid;
            if (b.purchaseCount !== a.purchaseCount)
                return b.purchaseCount - a.purchaseCount;
            return 0;
        });

        return res.status(200).json({
            range: { startIso, endIso },
            items: rows.slice(0, limit),
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to get top customers",
            error: (error as Error).message,
        });
    }
};


export const getProductMaxStock = async (req: Request, res: Response) => {
    try {
        const startDate =
            typeof req.query.startDate === "string"
                ? req.query.startDate
                : undefined;
        const endDate =
            typeof req.query.endDate === "string"
                ? req.query.endDate
                : undefined;
        const targetCoverDaysRaw =
            typeof req.query.targetCoverDays === "string"
                ? req.query.targetCoverDays
                : undefined;

        const targetCoverDays = targetCoverDaysRaw
            ? Math.max(0, Number(targetCoverDaysRaw) || 0)
            : 14;

        const { startIso, endIso, windowDays } = toPHTRange(startDate, endDate);

        const snap = await firestoreDb
            .collection("transactions")
            .where("date", ">=", startIso)
            .where("date", "<=", endIso)
            .get();

        const unitsSoldByProductId = new Map<string, number>();

        for (const doc of snap.docs) {
            const tx = doc.data() as Transaction;
            const items = Array.isArray(tx.items) ? tx.items : [];
            for (const it of items) {
                const productId =
                    typeof it?.productId === "string" ? it.productId : null;
                const qty = typeof it?.quantity === "number" ? it.quantity : 0;
                if (!productId) continue;
                unitsSoldByProductId.set(
                    productId,
                    (unitsSoldByProductId.get(productId) ?? 0) + qty
                );
            }
        }

        const productIds = [...unitsSoldByProductId.keys()];
        const productById = new Map<
            string,
            { productName: string | null; stock: number | null }
        >();

        for (let i = 0; i < productIds.length; i += 10) {
            const chunk = productIds.slice(i, i + 10);
            const productsSnap = await firestoreDb
                .collection("products")
                .where(FieldPath.documentId(), "in", chunk)
                .get();
            for (const pdoc of productsSnap.docs) {
                const p = pdoc.data() as Product;
                if (p.deleted === true) continue;
                if (typeof pdoc.id === "string") {
                    productById.set(pdoc.id, {
                        productName:
                            typeof p.productName === "string"
                                ? p.productName
                                : null,
                        stock: typeof p.stock === "number" ? p.stock : null,
                    });
                }
            }
        }

        const rows: MaxStock[] = productIds.map((productId) => {
            const unitsSold = unitsSoldByProductId.get(productId) ?? 0;
            const avgDailyUnits = windowDays > 0 ? unitsSold / windowDays : 0;
            const p = productById.get(productId);
            const stock = p?.stock ?? null;

            const maxStockLevel = Math.ceil(avgDailyUnits * targetCoverDays);
            const suggestedOrderQty =
                typeof stock === "number"
                    ? Math.max(0, maxStockLevel - stock)
                    : maxStockLevel;

            return {
                productId,
                productName: p?.productName ?? null,
                stock,
                unitsSold,
                windowDays,
                avgDailyUnits,
                targetCoverDays,
                maxStockLevel,
                suggestedOrderQty,
            };
        });

        // Highest suggestedOrderQty first
        rows.sort((a, b) => b.suggestedOrderQty - a.suggestedOrderQty);

        return res.status(200).json({
            range: { startIso, endIso, windowDays, targetCoverDays },
            items: rows,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to get product max stock metrics",
            error: (error as Error).message,
        });
    }
};
