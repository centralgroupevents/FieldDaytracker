"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  FileText,
  Mail,
  Trash2,
  Plus,
  X,
  Upload,
  Send,
} from "lucide-react";
import {
  OUTREACH_STAGES,
  STAGE_STYLES,
  renderTemplate,
  type OutreachContact,
  type OutreachTemplate,
} from "@/lib/types";
import {
  createContact,
  updateContact,
  deleteContact,
  importContacts,
  saveTemplate,
  deleteTemplate,
  sendEmail,
} from "@/app/actions/outreach";

type View = "pipeline" | "templates";

export default function OutreachClient({
  initialContacts,
  initialTemplates,
}: {
  initialContacts: OutreachContact[];
  initialTemplates: OutreachTemplate[];
}) {
  const [view, setView] = useState<View>("pipeline");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <ViewTab
          active={view === "pipeline"}
          onClick={() => setView("pipeline")}
          icon={<Users className="h-4 w-4" />}
          label="Pipeline"
          count={initialContacts.length}
        />
        <ViewTab
          active={view === "templates"}
          onClick={() => setView("templates")}
          icon={<FileText className="h-4 w-4" />}
          label="Templates"
          count={initialTemplates.length}
        />
      </div>

      {view === "pipeline" ? (
        <Pipeline contacts={initialContacts} templates={initialTemplates} />
      ) : (
        <Templates templates={initialTemplates} />
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-brand text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {icon}
      {label}
      <span
        className={`rounded-full px-1.5 text-xs ${
          active ? "bg-white/25" : "bg-gray-200 text-gray-600"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ===========================================================================
// PIPELINE
// ===========================================================================

function Pipeline({
  contacts,
  templates,
}: {
  contacts: OutreachContact[];
  templates: OutreachTemplate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [composeFor, setComposeFor] = useState<OutreachContact | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  function refresh() {
    startTransition(() => router.refresh());
  }

  const byStage = OUTREACH_STAGES.map((stage) => ({
    stage,
    items: contacts.filter((c) => c.stage === stage),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" /> Add contact
        </button>
        <button
          onClick={() => setShowImport((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          <Upload className="h-4 w-4" /> Bulk paste
        </button>
      </div>

      {showAdd && (
        <AddContactForm
          onDone={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}
      {showImport && (
        <ImportForm
          onDone={() => {
            setShowImport(false);
            refresh();
          }}
        />
      )}

      {contacts.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No contacts yet. Add one or bulk-paste a list to start your pipeline.
        </p>
      )}

      {byStage.map(
        ({ stage, items }) =>
          items.length > 0 && (
            <div key={stage} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <StageBadge stage={stage} /> {items.length}
              </h3>
              <ul className="space-y-2">
                {items.map((c) => (
                  <ContactCard
                    key={c.id}
                    contact={c}
                    onEmail={() => setComposeFor(c)}
                    onChanged={refresh}
                  />
                ))}
              </ul>
            </div>
          )
      )}

      {composeFor && (
        <ComposeModal
          contact={composeFor}
          templates={templates}
          onClose={() => setComposeFor(null)}
          onSent={() => {
            setComposeFor(null);
            refresh();
          }}
        />
      )}

      {pending && <p className="text-xs text-gray-400">Updating…</p>}
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const style =
    STAGE_STYLES[stage] || "bg-gray-100 text-gray-700 ring-gray-600/20";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {stage}
    </span>
  );
}

function ContactCard({
  contact,
  onEmail,
  onChanged,
}: {
  contact: OutreachContact;
  onEmail: () => void;
  onChanged: () => void;
}) {
  const [, startTransition] = useTransition();

  function setStage(stage: string) {
    startTransition(async () => {
      await updateContact(contact.id, { stage });
      onChanged();
    });
  }
  function remove() {
    if (!confirm(`Delete ${contact.name}?`)) return;
    startTransition(async () => {
      await deleteContact(contact.id);
      onChanged();
    });
  }

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{contact.name}</p>
          <p className="truncate text-sm text-gray-500">{contact.email}</p>
          {contact.company && (
            <p className="truncate text-xs text-gray-400">{contact.company}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onEmail}
            title="Send email"
            className="rounded-md bg-brand/10 p-2 text-brand hover:bg-brand/20"
          >
            <Mail className="h-4 w-4" />
          </button>
          <button
            onClick={remove}
            title="Delete"
            className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-2">
        <select
          value={contact.stage}
          onChange={(e) => setStage(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm"
        >
          {OUTREACH_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

function AddContactForm({ onDone }: { onDone: () => void }) {
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createContact({
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        company: String(formData.get("company") || ""),
      });
      if (!res.ok) setError(res.error || "Failed to add.");
      else onDone();
    });
  }

  return (
    <form
      action={submit}
      className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
    >
      <input
        name="name"
        placeholder="Name"
        required
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
      <input
        name="email"
        type="email"
        placeholder="Email"
        required
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
      <input
        name="company"
        placeholder="Company (optional)"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white">
        Save contact
      </button>
    </form>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const [, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function submit(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await importContacts(String(formData.get("raw") || ""));
      if (!res.ok) setMsg(res.error || "Failed.");
      else {
        setMsg(`Added ${res.added} contacts.`);
        onDone();
      }
    });
  }

  return (
    <form
      action={submit}
      className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
    >
      <p className="text-xs text-gray-500">
        One per line: <code>Name, email@x.com, Company</code> (company optional)
      </p>
      <textarea
        name="raw"
        rows={5}
        placeholder={"Jane Doe, jane@bar.com, The Tavern\nSam Lee, sam@pub.com"}
        className="w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-xs"
      />
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      <button className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white">
        Import
      </button>
    </form>
  );
}

function ComposeModal({
  contact,
  templates,
  onClose,
  onSent,
}: {
  contact: OutreachContact;
  templates: OutreachTemplate[];
  onClose: () => void;
  onSent: () => void;
}) {
  const vars = {
    name: contact.name,
    email: contact.email,
    company: contact.company || "",
  };
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [advance, setAdvance] = useState<string>("Contacted");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(renderTemplate(t.subject, vars));
      setBody(renderTemplate(t.body, vars));
    }
  }

  async function send() {
    setStatus(null);
    setSending(true);
    const res = await sendEmail({
      contactId: contact.id,
      subject,
      body,
      templateId: templateId || null,
      advanceStage: advance || null,
    });
    setSending(false);
    if (res.ok) onSent();
    else setStatus(res.error || "Send failed.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            Email {contact.name}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-gray-500">
          To: <span className="font-medium text-gray-700">{contact.email}</span>
        </p>

        <label className="mb-1 block text-xs font-medium text-gray-500">
          Start from a template
        </label>
        <select
          value={templateId}
          onChange={(e) => applyTemplate(e.target.value)}
          className="mb-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="">— blank —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="mb-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="Write your message… you can edit this before sending."
          className="mb-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-xs font-medium text-gray-500">
          After sending, move to
        </label>
        <select
          value={advance}
          onChange={(e) => setAdvance(e.target.value)}
          className="mb-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="">— don&apos;t change stage —</option>
          {OUTREACH_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {status && <p className="mb-2 text-sm text-red-600">{status}</p>}

        <button
          onClick={send}
          disabled={sending || !subject.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending…" : "Send email"}
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// TEMPLATES
// ===========================================================================

function Templates({ templates }: { templates: OutreachTemplate[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<OutreachTemplate | "new" | null>(null);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setEditing("new")}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white"
      >
        <Plus className="h-4 w-4" /> New template
      </button>

      {templates.length === 0 && !editing && (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No templates yet. Create one to reuse when emailing contacts.
        </p>
      )}

      {editing && (
        <TemplateEditor
          template={editing === "new" ? null : editing}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <ul className="space-y-2">
        {templates.map((t) => (
          <li
            key={t.id}
            className="rounded-lg border border-gray-200 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{t.name}</p>
                <p className="truncate text-sm text-gray-500">{t.subject}</p>
              </div>
              <button
                onClick={() => setEditing(t)}
                className="shrink-0 text-sm font-medium text-brand"
              >
                Edit
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TemplateEditor({
  template,
  onDone,
  onCancel,
}: {
  template: OutreachTemplate | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name || "");
  const [subject, setSubject] = useState(template?.subject || "");
  const [body, setBody] = useState(template?.body || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    const res = await saveTemplate({
      id: template?.id,
      name,
      subject,
      body,
    });
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.error || "Failed to save.");
  }

  async function remove() {
    if (!template) return;
    if (!confirm(`Delete template "${template.name}"?`)) return;
    setBusy(true);
    await deleteTemplate(template.id);
    setBusy(false);
    onDone();
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs text-gray-500">
        Use <code>{"{{name}}"}</code>, <code>{"{{company}}"}</code>,{" "}
        <code>{"{{email}}"}</code> — they fill in per contact when you send.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name (internal)"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder={"Hi {{name}},\n\n…"}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy || !name.trim()}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save template"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-2 text-sm text-gray-500"
        >
          Cancel
        </button>
        {template && (
          <button
            onClick={remove}
            className="ml-auto rounded-md px-3 py-2 text-sm text-red-600"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
