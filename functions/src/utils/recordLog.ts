import { auth, firestoreDb } from "@/config/firebaseConfig";
import ActivityAction from "@/types/ActivityAction";
import ActivityEntity from "@/types/ActivityEntity";
import getChanges from "@/utils/getChanges";

const recordLog = async<T>(
    entity: ActivityEntity,
    entityId: string,
    action: ActivityAction,
    userId: string,
    before: T | null,
    after: T | null
) => {
    try {
        const actor = await auth.getUser(userId);
        const displayName = actor.displayName || "";

        const changes = getChanges(before, after);

        const log = {
            entity,
            entityId,
            action,
            userId,
            displayName,
            changes,
            date: new Date().toISOString(),
        };
        await firestoreDb.collection("activities").add(log);
    } catch (error) {
        throw new Error((error as Error).message);
    }
};

export default recordLog;
