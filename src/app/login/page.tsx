"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback`
              : undefined,
        },
      });
      if (error) setError(error.message);
      else setSent(true);
    });
  }

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <h2 className="text-lg font-semibold">Sign in</h2>
      <p className="mt-1 text-sm text-gray-500">
        We’ll email you a magic link — no password needed.
      </p>

      {sent ? (
        <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Check <strong>{email}</strong> for your sign-in link.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending && <Loader2 className="h-5 w-5 animate-spin" />}
            Send magic link
          </button>
        </form>
      )}
    </div>
  );
}
