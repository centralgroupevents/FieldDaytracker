import { createAdminClient } from "@/lib/supabase/admin";
import OutreachClient from "@/components/OutreachClient";
import type {
  OutreachContact,
  OutreachTemplate,
  SendLogRow,
} from "@/lib/types";

// This tool has no login, so we read with the service-role client (same
// approach the server actions use) rather than the RLS-gated anon client.
export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const supabase = createAdminClient();

  const [{ data: contacts }, { data: templates }, { data: sends }] =
    await Promise.all([
      supabase
        .from("outreach_contacts")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("outreach_templates")
        .select("*")
        .order("name", { ascending: true }),
      supabase
        .from("outreach_sends")
        .select("*, contact:outreach_contacts(name)")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  return (
    <OutreachClient
      initialContacts={(contacts ?? []) as OutreachContact[]}
      initialTemplates={(templates ?? []) as OutreachTemplate[]}
      initialSends={(sends ?? []) as SendLogRow[]}
    />
  );
}
