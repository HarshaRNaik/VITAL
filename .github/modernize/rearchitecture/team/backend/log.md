## [001-transform-persistent-api-and-data-layer] Persistent API contract fixes and isolated tests
- Codebase/domain discoveries: the server already has authenticated Express routes and Prisma models/migration for fitness data, goals, settings, game state, workout plans, and assistant conversations; prior tests were absent.
- Wrong assumptions and corrections: workout PATCH accepted the workout create schema partially but attempted to persist `performedSets` as a scalar. It now updates the nested set relation transactionally.
- Additional correctness: workout create/update now enforce ownership for `customPlanId`; goal PATCH must distinguish explicit `deadline: null` from an omitted field.
- Debugging dead-ends: repository-level ESLint does not target TypeScript; targeted ESLint invocation reports files ignored. Full lint includes three unrelated frontend errors.
- Techniques/patterns worth reusing: exercise API tests can mock Prisma delegates and use Supertest without opening a database connection; use an interactive transaction for replacing child sets.
- Learnings consumed: [none]
