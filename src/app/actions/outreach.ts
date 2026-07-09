"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mailer";
import {
  renderTemplate,
  type OutreachAttachment,
  type OutreachContact,
  type OutreachTemplate,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface ContactResult {
  ok: boolean;
  error?: string;
  contact?: OutreachContact;
}

export async function createContact(input: {
  name: string;
  email: string;
  company?: string | null;
  stage?: string;
  notes?: string | null;
}): Promise<ContactResult> {
  const supabase = createAdminClient();
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (!email) return { ok: false, error: "Email is required." };

  const { data, error } = await supabase
    .from("outreach_contacts")
    .insert({
      name,
      email,
      company: input.company?.trim() || null,
      stage: input.stage || "New",
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/outreach");
  return { ok: true, contact: data as OutreachContact };
}

export async function updateContact(
  id: string,
  patch: {
    name?: string;
    email?: string;
    company?: string | null;
    stage?: string;
    notes?: string | null;
  }
): Promise<ContactResult> {
  const supabase = createAdminClient();
  const p: Record<string, unknown> = {};
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.email !== undefined) p.email = patch.email.trim();
  if (patch.company !== undefined) p.company = patch.company?.trim() || null;
  if (patch.stage !== undefined) p.stage = patch.stage;
  if (patch.notes !== undefined) p.notes = patch.notes?.trim() || null;

  const { data, error } = await supabase
    .from("outreach_contacts")
    .update(p)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/outreach");
  return { ok: true, contact: data as OutreachContact };
}

export async function deleteContact(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("outreach_contacts")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outreach");
  return { ok: true };
}

/** Bulk paste: one contact per line as `Name, email@x.com, Company` (company optional). */
export async function importContacts(
  raw: string
): Promise<{ ok: boolean; added: number; error?: string }> {
  const supabase = createAdminClient();
  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, email, company] = line.split(",").map((c) => c.trim());
      return { name, email, company };
    })
    .filter((r) => r.name && r.email);

  if (rows.length === 0)
    return { ok: false, added: 0, error: "No valid rows found." };

  const { error } = await supabase.from("outreach_contacts").insert(
    rows.map((r) => ({
      name: r.name,
      email: r.email,
      company: r.company || null,
      stage: "New",
    }))
  );

  if (error) return { ok: false, added: 0, error: error.message };
  revalidatePath("/outreach");
  return { ok: true, added: rows.length };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface TemplateResult {
  ok: boolean;
  error?: string;
  template?: OutreachTemplate;
}

export async function saveTemplate(input: {
  id?: string;
  name: string;
  subject: string;
  body: string;
  cc?: string | null;
  bcc?: string | null;
  attachments?: OutreachAttachment[];
}): Promise<TemplateResult> {
  const supabase = createAdminClient();
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Template name is required." };

  const row = {
    name,
    subject: input.subject ?? "",
    body: input.body ?? "",
    cc: input.cc?.trim() || null,
    bcc: input.bcc?.trim() || null,
    attachments: input.attachments ?? [],
  };

  const query = input.id
    ? supabase.from("outreach_templates").update(row).eq("id", input.id)
    : supabase.from("outreach_templates").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outreach");
  return { ok: true, template: data as OutreachTemplate };
}

/**
 * Uploads one file to the public `outreach-attachments` bucket and returns its
 * public URL. Called from the client when a file is selected; the returned
 * attachment is then saved onto a template or attached to a one-off send.
 */
export async function uploadAttachment(
  formData: FormData
): Promise<{ ok: boolean; error?: string; attachment?: OutreachAttachment }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No file provided." };

  // Gmail caps attachments at 25 MB.
  if (file.size > 25 * 1024 * 1024)
    return { ok: false, error: "File is larger than 25 MB (Gmail's limit)." };

  const supabase = createAdminClient();
  const bytes = Buffer.from(await file.arrayBuffer());
  const dot = file.name.lastIndexOf(".");
  const ext = dot > -1 ? file.name.slice(dot + 1).toLowerCase() : "bin";
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("outreach-attachments")
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) return { ok: false, error: error.message };

  const { data } = supabase.storage
    .from("outreach-attachments")
    .getPublicUrl(path);

  return {
    ok: true,
    attachment: { filename: file.name, url: data.publicUrl, size: file.size },
  };
}

export async function deleteTemplate(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("outreach_templates")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outreach");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/**
 * Sends an already-composed email to one contact, logs the attempt, and
 * optionally advances that contact's stage. The subject/body arrive fully
 * rendered from the client (operator may have edited them), so no {{vars}}
 * substitution happens here.
 */
export async function sendEmail(input: {
  contactId: string;
  subject: string;
  body: string;
  templateId?: string | null;
  advanceStage?: string | null;
  cc?: string | null;
  bcc?: string | null;
  attachments?: OutreachAttachment[];
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const supabase = createAdminClient();

  const { data: contact, error: contactErr } = await supabase
    .from("outreach_contacts")
    .select("*")
    .eq("id", input.contactId)
    .single();

  if (contactErr || !contact)
    return { ok: false, error: contactErr?.message || "Contact not found." };

  const result = await sendMail({
    to: contact.email,
    subject: input.subject,
    body: input.body,
    cc: input.cc,
    bcc: input.bcc,
    attachments: (input.attachments ?? []).map((a) => ({
      filename: a.filename,
      path: a.url,
    })),
  });

  // Log every attempt, whatever the outcome.
  await supabase.from("outreach_sends").insert({
    contact_id: contact.id,
    template_id: input.templateId || null,
    to_email: contact.email,
    subject: input.subject,
    cc: input.cc?.trim() || null,
    bcc: input.bcc?.trim() || null,
    status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
    error: result.error || null,
  });

  if (result.ok && input.advanceStage) {
    await supabase
      .from("outreach_contacts")
      .update({ stage: input.advanceStage })
      .eq("id", contact.id);
  }

  revalidatePath("/outreach");

  if (result.skipped)
    return {
      ok: false,
      skipped: true,
      error:
        "Email not configured yet — add GMAIL_USER and GMAIL_APP_PASSWORD in Secrets.",
    };
  return { ok: result.ok, error: result.error };
}

/**
 * Sends the same template to every contact currently in `stage`. The subject/
 * body arrive WITH {{placeholders}} intact and are rendered per contact here,
 * so each person gets their own name/company filled in. Each send is logged;
 * successfully-sent contacts optionally advance to `advanceStage`.
 */
export async function sendBatch(input: {
  stage: string;
  subjectTemplate: string;
  bodyTemplate: string;
  templateId?: string | null;
  advanceStage?: string | null;
  cc?: string | null;
  bcc?: string | null;
  attachments?: OutreachAttachment[];
}): Promise<{
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  error?: string;
}> {
  const supabase = createAdminClient();

  const { data: contacts, error } = await supabase
    .from("outreach_contacts")
    .select("*")
    .eq("stage", input.stage);

  if (error)
    return { ok: false, sent: 0, failed: 0, skipped: 0, error: error.message };
  if (!contacts || contacts.length === 0)
    return {
      ok: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      error: "No contacts in this stage.",
    };

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const contact of contacts as OutreachContact[]) {
    const vars = {
      name: contact.name,
      email: contact.email,
      company: contact.company || "",
    };
    const subject = renderTemplate(input.subjectTemplate, vars);
    const body = renderTemplate(input.bodyTemplate, vars);

    const result = await sendMail({
      to: contact.email,
      subject,
      body,
      cc: input.cc,
      bcc: input.bcc,
      attachments: (input.attachments ?? []).map((a) => ({
        filename: a.filename,
        path: a.url,
      })),
    });

    await supabase.from("outreach_sends").insert({
      contact_id: contact.id,
      template_id: input.templateId || null,
      to_email: contact.email,
      subject,
      cc: input.cc?.trim() || null,
      bcc: input.bcc?.trim() || null,
      status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
      error: result.error || null,
    });

    if (result.ok) {
      sent++;
      if (input.advanceStage) {
        await supabase
          .from("outreach_contacts")
          .update({ stage: input.advanceStage })
          .eq("id", contact.id);
      }
    } else if (result.skipped) {
      skipped++;
    } else {
      failed++;
    }
  }

  revalidatePath("/outreach");

  if (skipped > 0 && sent === 0 && failed === 0)
    return {
      ok: false,
      sent,
      failed,
      skipped,
      error:
        "Email not configured yet — add GMAIL_USER and GMAIL_APP_PASSWORD in Secrets.",
    };
  return { ok: sent > 0, sent, failed, skipped };
}
