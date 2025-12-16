import { endOfDay, startOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";

export const toPHTRange = (start?: string, end?: string) => {
    const timeZone = "Asia/Manila"; // PHT

    let startDate: Date;
    let endDate: Date;

    if (start && end) {
        startDate = new Date(start);
        endDate = new Date(end);
    } else {
        const now = new Date();
        startDate = now;
        endDate = now;
    }

    // Step 1: Convert to PHT time
    const startInPht = toZonedTime(startDate, timeZone);
    const endInPht = toZonedTime(endDate, timeZone);

    // Step 2: Get start/end of the PHT day
    const startPhtDay = startOfDay(startInPht);
    const endPhtDay = endOfDay(endInPht);

    // Step 3: Convert back to UTC for Firestore queries
    const startUtc = fromZonedTime(startPhtDay, timeZone);
    const endUtc = fromZonedTime(endPhtDay, timeZone);

    const windowDays = differenceInCalendarDays(endPhtDay, startPhtDay) + 1;

    return {
        startIso: startUtc.toISOString(),
        endIso: endUtc.toISOString(),
        startPhtDay,
        endPhtDay,
        windowDays,
    };
};
