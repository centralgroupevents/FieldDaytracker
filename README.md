# Field Day Tracker

Mobile-first inventory & financial tracking for Field Day. Built with **Next.js
(App Router)**, **React**, **Tailwind CSS**, **Lucide**, and **Supabase**
(Postgres + Storage + Auth), with integrations for **AfterShip** (package
tracking), **Resend** (email), and **Google Sheets** (master spreadsheet sync).

## Features

- 📊 **Dashboard** with three KPI cards: Total Budget Spent, Items Missing
  (delta > 0), and In Transit.
- 📦 **Inventory** as a mobile card list / desktop data table with color-coded
  status badges and an inline **Quick Edit** stepper for `current_stock`.
- ➕ **Add Item** form with a phone camera capture that uploads straight to
  Supabase Storage.
- 🤖 **Automations**
  - Updating stock so that `delta > 0` auto-sets status to **Pending Order**.
  - AfterShip webhook → **Shipped** (In Transit) / **Delivered**.
  - Resend email on **Pending Order** and **Delivered**.
  - Google Sheets row appended on **Delivered** and **Picked Up**.
- 🔒 Supabase Auth (magic link) + Row Level Security.

---

## 1. Database setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql). This creates:
   - the `inventory_status` enum,
   - the `inventory_items` table (with `delta` and `total_cost` as **generated
     columns** computed by Postgres),
   - an `updated_at` trigger and helpful indexes,
   - RLS policies (authenticated users get full CRUD),
   - the public `item-images` Storage bucket and its policies.
3. In **Project Settings → API**, copy the Project URL, the `anon` key, and the
   `service_role` key into `.env.local` (next section).

> `delta` and `total_cost` are **STORED GENERATED** columns. Application code
> never writes them — Postgres keeps them correct automatically.

---

## 2. Initialize the project locally

This repo is already scaffolded. From the project root:

```bash
# install dependencies
npm install

# create your env file and fill it in
cp .env.local.example .env.local

# run the dev server
npm run dev
```

Open http://localhost:3000. You'll be redirected to `/login` — enter your email
to get a magic link. (Make sure that email is allowed to sign up in
**Supabase → Authentication → Providers → Email**.)

> Building from scratch instead? The equivalent bootstrap was:
> ```bash
> npx create-next-app@latest fieldday-tracker --ts --tailwind --app --src-dir --import-alias "@/*"
> cd fieldday-tracker
> npm install @supabase/supabase-js @supabase/ssr lucide-react resend googleapis
> ```

---

## 3. Environment variables

See [`.env.local.example`](.env.local.example) for the full annotated list.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; used by the AfterShip webhook (bypasses RLS) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `NOTIFY_EMAIL` | Transactional email |
| `AFTERSHIP_API_KEY` / `AFTERSHIP_WEBHOOK_SECRET` | Tracking + webhook signature verification |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_SHEET_ID` / `GOOGLE_SHEET_RANGE` | Master spreadsheet sync |

Every integration **degrades gracefully**: if its keys are missing the app logs
a warning and skips that side effect instead of crashing.

---

## 4. Integrations

### AfterShip webhook

- Endpoint: `POST /api/webhooks/aftership`
- In the AfterShip dashboard, add a webhook pointing at
  `https://YOUR_DOMAIN/api/webhooks/aftership` and set the signing secret to the
  same value as `AFTERSHIP_WEBHOOK_SECRET`.
- The handler verifies the `aftership-hmac-sha256` signature, finds the item by
  `tracking_number`, and maps tags: `InTransit`/`OutForDelivery` → **Shipped**,
  `Delivered` → **Delivered**.
- Local testing: expose your dev server with `ngrok http 3000` and use the
  public URL.

### Resend

Verify a sending domain (or use the Resend test domain), then set
`RESEND_FROM_EMAIL` to a verified sender and `NOTIFY_EMAIL` to the recipient.

### Google Sheets

1. Create a Google Cloud service account and **enable the Sheets API**.
2. Download its JSON key; put `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   and `private_key` → `GOOGLE_PRIVATE_KEY` (keep the `\n` escapes).
3. **Share the spreadsheet** with the service-account email as an Editor.
4. Set `GOOGLE_SHEET_ID` (from the sheet URL) and `GOOGLE_SHEET_RANGE`
   (e.g. `Master!A:H`).

---

## 5. Project structure

```
src/
  app/
    layout.tsx                      Root layout + bottom nav + auth gate
    page.tsx                        Dashboard (KPI cards + recent items)
    inventory/page.tsx              Full inventory list/table
    add/page.tsx                    Add Item page
    login/page.tsx                  Magic-link sign in
    auth/callback/route.ts          Session exchange
    actions/inventory.ts            Server actions (create/updateStock/setStatus/delete)
    api/webhooks/aftership/route.ts AfterShip webhook listener
  components/                       BottomNav, KpiCard, StatusBadge,
                                    InventoryList, QuickEdit, AddItemForm, SignOutButton
  lib/
    types.ts                        InventoryItem type, statuses, badge styles
    email.ts                        Resend helper
    sheets.ts                       Google Sheets append helper
    supabase/{client,server,admin,middleware}.ts
  middleware.ts                     Auth session refresh + route protection
supabase/schema.sql                 Database + RLS + Storage setup
```

---

## 6. Deploy

Deploy to Vercel, set all env vars in the project settings, and point your
AfterShip webhook + Supabase Auth redirect URL (`/auth/callback`) at the
deployed domain.
