import { redirect } from "next/navigation";

// Middleware guarantees only authenticated requests reach this page (see
// src/middleware.ts), so this is a simple, always-safe redirect.
export default function RootPage() {
  redirect("/today");
}
