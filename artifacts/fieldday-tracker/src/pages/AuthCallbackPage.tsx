import { useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "../lib/supabase";

export default function AuthCallbackPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(() => navigate("/"))
        .catch(() => navigate("/login"));
    } else {
      navigate("/login");
    }
  }, [navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );
}
