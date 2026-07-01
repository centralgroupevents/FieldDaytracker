import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import LoginPage from "./pages/LoginPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import AddItemPage from "./pages/AddItemPage";
import BottomNav from "./components/BottomNav";
import SignOutButton from "./components/SignOutButton";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <span className="text-base font-bold tracking-tight text-blue-600">
          ⛺ Field Day
        </span>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
      <BottomNav />
    </div>
  );
}

function ProtectedRouter({ session }: { session: Session }) {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/" component={() => <AppShell><DashboardPage /></AppShell>} />
        <Route path="/inventory" component={() => <AppShell><InventoryPage /></AppShell>} />
        <Route path="/add" component={() => <AppShell><AddItemPage /></AppShell>} />
        <Route component={() => <Redirect to="/" />} />
      </Switch>
    </WouterRouter>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return (
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Switch>
          <Route path="/auth/callback" component={AuthCallbackPage} />
          <Route component={() => (
            <div className="min-h-screen bg-gray-50 px-4 py-8">
              <div className="mb-6 text-center">
                <span className="text-2xl font-bold text-blue-600">⛺ Field Day Tracker</span>
                <p className="mt-1 text-sm text-gray-500">Inventory & budget for your field day</p>
              </div>
              <LoginPage />
            </div>
          )} />
        </Switch>
      </WouterRouter>
    );
  }

  return <ProtectedRouter session={session} />;
}
