# Workout Update Ownership

For this Express/Prisma API, update nested workout sets transactionally and scope associated plan references to the authenticated user.

## What Happened

In VITAL Fitness task `001-transform-persistent-api-and-data-layer`, workout creation already stored performed sets as nested Prisma records, but PATCH passed the `performedSets` collection into `Workout.updateMany` as if it were a scalar field. The update now finds the workout by both ID and user ID, then replaces child sets through a Prisma interactive transaction. A referenced custom plan is checked against the same user before it can be attached. Fitness-goal PATCH also preserves `deadline: null` rather than treating it as omission.

## Takeaway

When an update accepts child-collection fields, separate them from scalar input, authorize the parent first, and use a transaction to replace child rows. Validate ownership of referenced user-specific records independently; a valid UUID does not establish ownership. In partial updates, use `value !== undefined` when `null` is an intentional clear operation.

## Example

```ts
if (patch.customPlanId) {
  const plan = await tx.workoutPlan.findFirst({
    where: { id: patch.customPlanId, userId },
    select: { id: true },
  });
  if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "Workout plan not found.");
}
```

## History
- 2026-10-25 (vital-fitness-persistent-backend/001-transform-persistent-api-and-data-layer): initial
