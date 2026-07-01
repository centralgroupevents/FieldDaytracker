import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import ExpensesPage from "./pages/ExpensesPage";
import AddItemPage from "./pages/AddItemPage";
import BottomNav from "./components/BottomNav";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <span className="text-base font-bold tracking-tight text-blue-600">
          ⛺ Field Day
        </span>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
      <BottomNav />
    </div>
  );
}

// Fully open — no login. Anyone with the link can use the tracker.
export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/" component={() => <AppShell><DashboardPage /></AppShell>} />
        <Route path="/inventory" component={() => <AppShell><InventoryPage /></AppShell>} />
        <Route path="/expenses" component={() => <AppShell><ExpensesPage /></AppShell>} />
        <Route path="/add" component={() => <AppShell><AddItemPage /></AppShell>} />
        <Route component={() => <Redirect to="/" />} />
      </Switch>
    </WouterRouter>
  );
}
