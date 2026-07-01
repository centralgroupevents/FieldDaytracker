import { useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function SignOutButton() {
  const [, navigate] = useLocation();

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}
