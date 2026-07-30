import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth.js v5. Credentials are read from the environment by convention:
 * `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `AUTH_SECRET`. See `.env.example`.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/login",
  },
});
