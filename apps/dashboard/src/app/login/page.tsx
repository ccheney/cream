/**
 * Login Page
 *
 * Handles user authentication with email/password and MFA.
 *
 * @see docs/plans/ui/09-security.md
 */

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyMFA, isLoading: authLoading, mfaRequired } = useAuth();

  const [email, setEmail] = useState("user@example.com");
  const [password, setPassword] = useState("dolladollabillyall");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setIsSubmitting(true);

      try {
        const result = await login(email, password);

        if (!result.mfaRequired) {
          router.push("/dashboard");
        }
        // If MFA required, the form will switch to MFA input
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, login, router]
  );

  const handleMFAVerify = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setIsSubmitting(true);

      try {
        await verifyMFA(mfaCode);
        router.push("/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "MFA verification failed");
      } finally {
        setIsSubmitting(false);
      }
    },
    [mfaCode, verifyMFA, router]
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50 dark:bg-night-900">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-50 dark:bg-night-900 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo className="h-12 w-auto" />
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-night-800 rounded-lg shadow-lg p-8 border border-cream-200 dark:border-night-700">
          <h1 className="text-2xl font-semibold text-center text-cream-900 dark:text-cream-100 mb-6">
            {mfaRequired ? "Two-Factor Authentication" : "Sign In"}
          </h1>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {mfaRequired ? (
            /* MFA Form */
            <form onSubmit={handleMFAVerify} className="space-y-4">
              <p className="text-sm text-cream-600 dark:text-cream-400 text-center mb-4">
                Enter the 6-digit code from your authenticator app
              </p>

              <div>
                <label htmlFor="mfa-code" className="sr-only">
                  MFA Code
                </label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-2xl tracking-widest"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || mfaCode.length !== 6}
              >
                {isSubmitting ? <Spinner size="sm" /> : "Verify"}
              </Button>
            </form>
          ) : (
            /* Login Form */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Spinner size="sm" /> : "Sign In"}
              </Button>
            </form>
          )}

          {/* Demo credentials hint */}
          <div className="mt-6 pt-4 border-t border-cream-200 dark:border-night-700">
            <p className="text-xs text-cream-500 dark:text-cream-500 text-center">
              Demo: user@example.com / dolladollabillyall
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
