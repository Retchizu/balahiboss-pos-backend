const getChanges = <T>(
    before: T | null,
    after: T | null
) => {
    const changes: Partial<
        Record<keyof T, { before: unknown; after: unknown }>
    > = {};

    if (!before && !after) {
        return changes;
    }

    // If CREATE (before = null) → everything is "new"
    if (!before && after) {
        for (const key in after) {
            if (Object.prototype.hasOwnProperty.call(after, key)) {
                changes[key as keyof T] = {
                    before: null,
                    after: after[key as keyof T],
                };
            }
        }
        return changes;
    }

    // If DELETE (after = null) → everything is "removed"
    if (before && !after) {
        for (const key in before) {
            if (Object.prototype.hasOwnProperty.call(before, key)) {
                changes[key as keyof T] = {
                    before: before[key as keyof T],
                    after: null,
                };
            }
        }
        return changes;
    }

    // UPDATE → diff field by field
    if (before && after) {
        for (const key in after) {
            if (Object.prototype.hasOwnProperty.call(after, key)) {
                const beforeVal = before[key as keyof T];
                const afterVal = after[key as keyof T];

                let isChanged = false;

                // Special case: Transactions -> items array [{ productId, quantity }]
                if (
                    key === "items" &&
                    Array.isArray(beforeVal) &&
                    Array.isArray(afterVal)
                ) {
                    if (beforeVal.length !== afterVal.length) {
                        isChanged = true;
                    } else {
                        isChanged = beforeVal.some((bItem, i) => {
                            const aItem = afterVal[i];
                            return (
                                bItem.productId !== aItem.productId ||
                                bItem.quantity !== aItem.quantity
                            );
                        });
                    }
                } else {
                    //  Fallback: shallow compare
                    isChanged = beforeVal !== afterVal;
                }

                if (isChanged) {
                    changes[key as keyof T] = {
                        before: beforeVal,
                        after: afterVal,
                    };
                }
            }
        }
    }

    return changes;
};

export default getChanges;
