import { firestoreDb } from "@/config/firebaseConfig";
import { Request, Response } from "express";
import Transaction from "@/types/Transaction";
import TopCustomer from "@/types/metrics/TopCustomer";
import Customer from "@/types/Customer";
import { FieldPath } from "firebase-admin/firestore";
import { toPHTRange } from "@/utils/toPHTRange";
import Product from "@/types/Product";
import MaxStock from "@/types/metrics/MaxStock";
import {
  DayOfWeekStats,
  WeekStats,
  BusiestPeriodResponse,
  TimePeriodStats,
} from "@/types/metrics/BusiestPeriod";
import { toZonedTime } from "date-fns-tz";
import {
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  endOfISOWeek,
  format,
} from "date-fns";

type SortBy = "totalPaid" | "purchaseCount";

export const getTopCustomers = async (req: Request, res: Response) => {
  try {
    const startDate =
      typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate =
      typeof req.query.endDate === "string" ? req.query.endDate : undefined;
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

    const agg = new Map<string, { purchaseCount: number; totalPaid: number }>();

    for (const doc of snapshot.docs) {
      const tx = doc.data() as Transaction;
      const customerId =
        typeof tx.customerId === "string" && tx.customerId.length > 0
          ? tx.customerId
          : "unknownCustomer";
      const cash = typeof tx.cashPayment === "number" ? tx.cashPayment : 0;
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
        if (typeof cdoc.id === "string" && typeof c.customerName === "string") {
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
        if (b.totalPaid !== a.totalPaid) return b.totalPaid - a.totalPaid;
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
      typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate =
      typeof req.query.endDate === "string" ? req.query.endDate : undefined;
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
              typeof p.productName === "string" ? p.productName : null,
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

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const timeZone = "Asia/Manila"; // PHT

export const getBusiestPeriod = async (req: Request, res: Response) => {
  try {
    // Parse query parameters
    const startDate =
      typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate =
      typeof req.query.endDate === "string" ? req.query.endDate : undefined;

    // Convert date range to PHT
    const { startIso, endIso, windowDays } = toPHTRange(startDate, endDate);

    // Query transactions in date range
    const snapshot = await firestoreDb
      .collection("transactions")
      .where("date", ">=", startIso)
      .where("date", "<=", endIso)
      .get();

    // Aggregate by day of week
    const dayOfWeekCounts = new Map<number, number>();
    // Initialize all days to 0
    for (let i = 0; i < 7; i++) {
      dayOfWeekCounts.set(i, 0);
    }

    // Aggregate by calendar week
    const weekCounts = new Map<string, number>();
    const weekMetadata = new Map<
      string,
      {
        year: number;
        weekNumber: number;
        weekStart: string;
        weekEnd: string;
        weekStartDate: Date;
        weekEndDate: Date;
      }
    >();

    // Aggregate by hour of day (0-23)
    const hourCounts = new Map<number, number>();
    // Initialize all hours to 0
    for (let i = 0; i < 24; i++) {
      hourCounts.set(i, 0);
    }

    let totalTransactions = 0;

    // Process each transaction
    for (const doc of snapshot.docs) {
      const tx = doc.data() as Transaction;

      if (typeof tx.date !== "string") continue;

      totalTransactions++;

      // Convert UTC ISO to PHT
      const utcDate = new Date(tx.date);
      const phtDate = toZonedTime(utcDate, timeZone);

      // Extract day of week (0=Sunday, 6=Saturday)
      const dayOfWeek = phtDate.getDay();
      dayOfWeekCounts.set(dayOfWeek, (dayOfWeekCounts.get(dayOfWeek) || 0) + 1);

      // Extract hour of day (0-23)
      const hour = phtDate.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);

      // Extract ISO week
      const year = getISOWeekYear(phtDate);
      const weekNumber = getISOWeek(phtDate);
      const weekKey = `${year}-W${weekNumber.toString().padStart(2, "0")}`;

      // Update week count
      weekCounts.set(weekKey, (weekCounts.get(weekKey) || 0) + 1);

      // Store week metadata if not already stored
      if (!weekMetadata.has(weekKey)) {
        const weekStart = startOfISOWeek(phtDate);
        const weekEnd = endOfISOWeek(phtDate);
        weekMetadata.set(weekKey, {
          year,
          weekNumber,
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
        });
      }
    }

    // Build day of week stats - sorted by transaction count (descending)
    const busiestDays: DayOfWeekStats[] = Array.from(dayOfWeekCounts.entries())
      .map(([dayNumber, transactionCount]) => ({
        dayName: DAY_NAMES[dayNumber],
        dayNumber,
        transactionCount,
      }))
      .sort((a, b) => {
        // Sort by transaction count (descending), then by day number (ascending)
        if (b.transactionCount !== a.transactionCount) {
          return b.transactionCount - a.transactionCount;
        }
        return a.dayNumber - b.dayNumber;
      });

    // Build calendar week stats - sorted by transaction count (descending)
    const busiestWeeks: WeekStats[] = Array.from(weekCounts.entries())
      .map(([weekKey, transactionCount]) => {
        const metadata = weekMetadata.get(weekKey);
        if (!metadata) {
          throw new Error(`Missing metadata for week ${weekKey}`);
        }

        // Format readable date: "Jan 20 - Jan 26, 2025"
        const readableDate = `${format(
          metadata.weekStartDate,
          "MMM d"
        )} - ${format(metadata.weekEndDate, "MMM d, yyyy")}`;

        return {
          weekKey,
          year: metadata.year,
          weekNumber: metadata.weekNumber,
          transactionCount,
          weekStart: metadata.weekStart,
          weekEnd: metadata.weekEnd,
          readableDate,
        };
      })
      .sort((a, b) => {
        // Sort by transaction count (descending), then by week key (chronological)
        if (b.transactionCount !== a.transactionCount) {
          return b.transactionCount - a.transactionCount;
        }
        return a.weekKey.localeCompare(b.weekKey);
      });

    // Build time period stats - sorted by transaction count (descending)
    const busiestTimePeriods: TimePeriodStats[] = Array.from(
      hourCounts.entries()
    )
      .map(([hour, transactionCount]) => {
        // Format hour label: "2:00 PM" or "14:00"
        // Create a new date with the specific hour for formatting
        const hourDate = new Date();
        hourDate.setHours(hour, 0, 0, 0);
        const hourLabel = format(hourDate, "h:mm a");

        return {
          hour,
          hourLabel,
          transactionCount,
        };
      })
      .sort((a, b) => {
        // Sort by transaction count (descending), then by hour (ascending)
        if (b.transactionCount !== a.transactionCount) {
          return b.transactionCount - a.transactionCount;
        }
        return a.hour - b.hour;
      });

    // Calculate summary statistics
    const avgTransactionsPerDay =
      windowDays > 0 ? totalTransactions / windowDays : 0;
    const uniqueWeeks = busiestWeeks.length;
    const avgTransactionsPerWeek =
      uniqueWeeks > 0 ? totalTransactions / uniqueWeeks : 0;

    // Build response
    const response: BusiestPeriodResponse = {
      range: {
        startIso,
        endIso,
        windowDays,
      },
      busiestDays,
      busiestWeeks,
      busiestTimePeriods,
      summary: {
        totalTransactions,
        avgTransactionsPerDay,
        avgTransactionsPerWeek,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to get busiest period analytics",
      error: (error as Error).message,
    });
  }
};
