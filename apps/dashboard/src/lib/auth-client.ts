/**
 * Better Auth React Client
 *
 * @see docs/plans/30-better-auth-migration.md
 */

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { config } from "./config";

export const authClient = createAuthClient({
  baseURL: config.api.baseUrl,
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
  ],
});

export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const useSession = authClient.useSession;
export const twoFactor = authClient.twoFactor;
export const getSession = authClient.getSession;
