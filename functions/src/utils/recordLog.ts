import { auth, firestoreDb } from "@/config/firebaseConfig";
import ActivityAction from "@/types/ActivityAction";
import ActivityEntity from "@/types/ActivityEntity";
import getChanges from "@/utils/getChanges";

export const prepareLog = async <T>(
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

    return {
      entity,
      entityId,
      action,
      userId,
      displayName,
      changes,
      date: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error((error as Error).message);
  }
};

const recordLog = (
  transaction: FirebaseFirestore.Transaction,
  log: unknown
) => {
  try {
    const activityLogRef = firestoreDb.collection("activities").doc();
    transaction.set(activityLogRef, log);
  } catch (error) {
    throw new Error((error as Error).message);
  }
};

export default recordLog;
