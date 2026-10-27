# Game State API Synchronization

Use the authenticated game-state response as the authority for XP, streaks, counts, badges, and daily reward flags; apply state returned by persistent activity mutations.

## What Happened

For VITAL-FITNESS_APP task `002-frontend-game-progression`, task-001 already provided `GET /api/game`, a chat-only reward operation, and game snapshots from registration/workout/nutrition/progress creates. The frontend previously derived progress in `GameContext` and saved it in localStorage. Switching the context to hydrate on authenticated user changes and accepting mutation responses avoided duplicating server reward logic. A local workout session list remains a UI resume hint, not reward authority.

## Takeaway

Use only existing operation contracts: hydration reads `/api/game`, chat calls the chat-only reward API, and other rewards consume the game snapshot returned by their activity mutation. Show XP feedback only when canonical total XP increases; do not calculate streaks, badges, or arbitrary rewards in the browser.

## History

- 2026-10-25 (VITAL-FITNESS_APP/002-frontend-game-progression): initial.
