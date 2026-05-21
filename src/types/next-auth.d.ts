/**
 * Augmentation des types NextAuth v5 pour Clochette Nails.
 * Ajoute `id` et `role` à la session.user et au JWT.
 */

import type { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub: string;
    role: Role;
  }
}
