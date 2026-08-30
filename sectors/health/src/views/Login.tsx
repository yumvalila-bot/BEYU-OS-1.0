import { useState } from "react";
import { Logo } from "../components/Logo";
import { useAuth, AuthError } from "../auth/AuthContext";

export function Login({ onBack }: { onBack: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof AuthError) {
        setError(err.message.replace(/_/g, " "));
      } else {
        setError("Unable to sign in. Check your connection and try again.");
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* LEFT — Brand showcase */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden text-white flex-col justify-between p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700" />
        <div className="relative">
          <Logo variant="full" size={64} className="[&_div]:!text-white" showTagline />
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-3xl leading-tight">
            Secure access to the BEYU Health OS governed platform.
          </h2>
          <p className="mt-3 text-sm text-white/70">
            Authentication and authorization are enforced server-side. Every
            action is attributable and auditable.
          </p>
        </div>
      </div>

      {/* RIGHT — Real sign-in form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <Logo variant="full" size={48} showTagline />
          </div>
          <h1 className="font-display text-2xl text-navy-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Use your BEYU Health OS account.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
                placeholder="you@organisation.example"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <button
            onClick={onBack}
            className="mt-4 text-sm text-slate-500 underline-offset-2 hover:underline"
          >
            ← Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
