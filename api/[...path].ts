import { coachApp } from "../server/src/coach-app.js";

// Export the Express application in Vercel's native Express function shape.
// Express remains the source of truth for API routing, auth, validation, and
// error handling.
export default coachApp;
