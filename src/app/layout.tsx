import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Field Day Tracker",
  description: "Inventory & financial tracking for Field Day",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1d4ed8",
};

// Fully open — no login. Anyone with the link can use the tracker.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-screen max-w-2xl px-4 pb-24 pt-6">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">
              ⛺ Field Day Tracker
            </h1>
          </header>
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
