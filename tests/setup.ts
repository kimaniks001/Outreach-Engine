import { config } from "dotenv";

// Loaded before test files import application code, so DATABASE_URL and
// SESSION_SECRET are set the same way they are for `npm run dev`.
config({ path: ".env.local" });
