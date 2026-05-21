/**
 * NextAuth v5 — route handler catchall.
 *
 * Expose les endpoints standards :
 *  - GET/POST /api/auth/signin
 *  - GET/POST /api/auth/signout
 *  - POST     /api/auth/callback/credentials
 *  - GET      /api/auth/session
 *  - GET      /api/auth/csrf
 *  - GET      /api/auth/providers
 */

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
