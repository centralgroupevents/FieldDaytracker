import { useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Camera,
  Link as LinkIcon,
  Loader2,
  Receipt,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";

const CARRIERS = ["", "UPS", "FedEx", "USPS", "DHL", "Amazon"] as const;

type FormState = {
  item_name: string;
  unit_price: string;
  target_quantity: string;
  current_stock: string;
  carrier: string;
  tracking_number: string;
  tracking_url: string;
  notes: string;
};

const EMPTY: FormState = {
  item_name: "",
  unit_price: "0",
  target_quantity: "0",
  current_stock: "0",
  carrier: "",
  tracking_number: "",
  tracking_url: "",
  notes: "",
};

/** An item waiting in the multi-item receipt queue. */
type QueuedItem = {
  item_name: string;
  unit_price?: number | null;
  quantity?: number | null;
  carrier?: string | null;
  tracking_number?: string | null;
};

async function fileToScaledBase64(
  file: File,
  maxDim = 1280,
  quality = 0.7
): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, width, height);
    const out = canvas.toDataURL("image/jpeg", quality);
    return { base64: out.split(",")[1] ?? "", mimeType: "image/jpeg" };
  } catch {
    return { base64: dataUrl.split(",")[1] ?? "", mimeType: file.type };
  }
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) {
    throw new Error(
      `Server returned an empty response (status ${res.status}). The image may be too large — try again.`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected server response (status ${res.status}).`);
  }
}

export default function AddItemForm() {
  const [, navigate] = useLocation();

  const [form, setForm] = useState<FormState>(EMPTY);
  const setField = (k: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const [itemFile, setItemFile] = useState<File | null>(null);
  const [itemPreview, setItemPreview] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [trackingInput, setTrackingInput] = useState("");
  const [aiBusy, setAiBusy] = useState<null | "receipt" | "link" | "tracking">(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // Multi-item queue (from a receipt with several products).
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickItemPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setItemFile(f);
    setItemPreview(f ? URL.createObjectURL(f) : null);
  }
  function pickReceiptPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setReceiptFile(f);
    setReceiptPreview(f ? URL.createObjectURL(f) : null);
  }

  /** Load a queued item into the form (resets fields, keeps the receipt photo). */
  function fillFromItem(it: QueuedItem) {
    setForm({
      ...EMPTY,
      item_name: it.item_name ?? "",
      unit_price: it.unit_price != null ? String(it.unit_price) : "0",
      current_stock: it.quantity != null ? String(it.quantity) : "0",
      carrier: it.carrier ?? "",
      tracking_number: it.tracking_number ?? "",
    });
    setItemFile(null);
    setItemPreview(null);
  }

  /** Skip the current item and load the next queued one without saving. */
  function loadNext() {
    if (queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    fillFromItem(next);
    setError(null);
    setAiNote(null);
  }

  /** Drop all remaining queued items (keeps whatever is in the form now). */
  function clearQueue() {
    setQueue([]);
    setQueueTotal(0);
    setAiNote(null);
  }

  async function scanReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAiBusy("receipt");
    setAiNote(null);
    setError(null);
    try {
      setReceiptFile(f);
      setReceiptPreview(URL.createObjectURL(f));
      const { base64, mimeType } = await fileToScaledBase64(f);
      const res = await apiFetch("/api/ai/parse-receipt", {
        method: "POST",
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Scan failed");
      const items: any[] = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) {
        setAiNote("No line items found — please enter the details manually.");
        return;
      }
      const first = items[0];
      setForm((prev) => ({
        ...prev,
        item_name: first.item_name ?? prev.item_name,
        unit_price:
          first.unit_price != null ? String(first.unit_price) : prev.unit_price,
        current_stock:
          first.quantity != null ? String(first.quantity) : prev.current_stock,
        carrier: data.carrier ?? prev.carrier,
        tracking_number: data.tracking_number ?? prev.tracking_number,
      }));
      const rest: QueuedItem[] = items.slice(1).map((i: any) => ({
        item_name: i.item_name,
        unit_price: i.unit_price,
        quantity: i.quantity,
        carrier: data.carrier ?? null,
        tracking_number: data.tracking_number ?? null,
      }));
      setQueue(rest);
      setQueueTotal(items.length);
      if (rest.length > 0) {
        setAiNote(
          `Filled item 1 of ${items.length}. ${rest.length} more queued — save this one and the next auto-fills.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receipt scan failed.");
    } finally {
      setAiBusy(null);
      if (scanInputRef.current) scanInputRef.current.value = "";
    }
  }

  async function fetchFromLink() {
    if (!linkUrl.trim()) return;
    setAiBusy("link");
    setAiNote(null);
    setError(null);
    try {
      const res = await apiFetch("/api/ai/parse-link", {
        method: "POST",
        body: JSON.stringify({ url: linkUrl.trim() }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      if (data.note) setAiNote(data.note);
      setForm((prev) => ({
        ...prev,
        item_name: data.item_name ?? prev.item_name,
        unit_price:
          data.unit_price != null ? String(data.unit_price) : prev.unit_price,
      }));
      if (!data.item_name && !data.note) {
        setAiNote("Couldn't read that page — enter the details manually.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link fetch failed.");
    } finally {
      setAiBusy(null);
    }
  }

  async function detectTracking() {
    if (!trackingInput.trim()) return;
    setAiBusy("tracking");
    setAiNote(null);
    setError(null);
    try {
      const res = await apiFetch("/api/ai/parse-tracking", {
        method: "POST",
        body: JSON.stringify({ trackingNumber: trackingInput.trim() }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Detect failed");
      if (data.note) setAiNote(data.note);
      setForm((prev) => ({
        ...prev,
        tracking_number: data.tracking_number ?? trackingInput.trim(),
        carrier: data.carrier ?? prev.carrier,
      }));
      if (!data.carrier && !data.note) {
        setAiNote("Carrier not recognized — pick it manually.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tracking detect failed.");
    } finally {
      setAiBusy(null);
    }
  }

  async function uploadPhoto(file: File): Promise<string> {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("item-images")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (upErr) throw upErr;
    return supabase.storage.from("item-images").getPublicUrl(path).data.publicUrl;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.item_name.trim()) {
      setError("Item name is required.");
      return;
    }
    try {
      setUploading(true);
      const image_url = itemFile ? await uploadPhoto(itemFile) : null;
      const receipt_url = receiptFile ? await uploadPhoto(receiptFile) : null;
      setUploading(false);
      setSaving(true);

      const res = await apiFetch("/api/inventory", {
        method: "POST",
        body: JSON.stringify({
          item_name: form.item_name,
          image_url,
          receipt_url,
          unit_price: Number(form.unit_price || 0),
          target_quantity: Number(form.target_quantity || 0),
          current_stock: Number(form.current_stock || 0),
          carrier: form.carrier || null,
          tracking_number: form.tracking_number || null,
          tracking_url: form.tracking_url || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create item.");
        return;
      }
      // If more items are queued from the receipt, load the next one and stay.
      if (queue.length > 0) {
        const savedCount = queueTotal - queue.length;
        const [next, ...rest] = queue;
        setQueue(rest);
        fillFromItem(next);
        setAiNote(
          `Saved item ${savedCount} of ${queueTotal}. Now editing item ${
            savedCount + 1
          } of ${queueTotal}${rest.length ? ` — ${rest.length} more after this.` : "."}`
        );
        if (typeof window !== "undefined")
          window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      setForm(EMPTY);
      navigate("/inventory");
    } catch (err) {
      setUploading(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  const busy = saving || uploading || aiBusy !== null;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* AI auto-fill panel */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-700">
          <Sparkles className="h-4 w-4" />
          Auto-fill with AI
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => scanInputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl border border-blue-600 bg-white px-3 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-60"
          >
            {aiBusy === "receipt" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Receipt className="h-4 w-4" />
            )}
            Scan a receipt photo
          </button>
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={scanReceipt}
            className="hidden"
          />

          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Paste a product link"
                className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-600"
              />
            </div>
            <button
              type="button"
              disabled={busy || !linkUrl.trim()}
              onClick={fetchFromLink}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {aiBusy === "link" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Fetch"
              )}
            </button>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Truck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="Paste a tracking number"
                className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-600"
              />
            </div>
            <button
              type="button"
              disabled={busy || !trackingInput.trim()}
              onClick={detectTracking}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {aiBusy === "tracking" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Detect"
              )}
            </button>
          </div>
        </div>

        {aiNote && (
          <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-gray-600">
            {aiNote}
          </p>
        )}
      </div>

      {/* Multi-item queue banner */}
      {queue.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="min-w-0">
            <strong>{queue.length}</strong> more queued · Next:{" "}
            <strong className="break-words">{queue[0].item_name}</strong>
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={loadNext}
              className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-medium hover:bg-amber-100"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={clearQueue}
              className="rounded-lg px-2 py-1 text-xs font-medium text-amber-700 hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Photos */}
      <div className="grid grid-cols-2 gap-4">
        <PhotoSlot
          label="Item photo"
          preview={itemPreview}
          onPick={pickItemPhoto}
          onClear={() => { setItemFile(null); setItemPreview(null); }}
          icon={<Camera className="h-6 w-6" />}
        />
        <PhotoSlot
          label="Receipt photo"
          preview={receiptPreview}
          onPick={pickReceiptPhoto}
          onClear={() => { setReceiptFile(null); setReceiptPreview(null); }}
          icon={<Receipt className="h-6 w-6" />}
        />
      </div>

      {/* Fields */}
      <Field label="Item name" required>
        <input
          value={form.item_name}
          onChange={(e) => setField("item_name", e.target.value)}
          required
          placeholder="e.g. Folding canopy tent"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Unit price ($)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.unit_price}
            onChange={(e) => setField("unit_price", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Target quantity">
          <input
            type="number"
            min="0"
            step="1"
            value={form.target_quantity}
            onChange={(e) => setField("target_quantity", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Current stock">
          <input
            type="number"
            min="0"
            step="1"
            value={form.current_stock}
            onChange={(e) => setField("current_stock", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Carrier">
          <select
            value={form.carrier}
            onChange={(e) => setField("carrier", e.target.value)}
            className={inputClass}
          >
            {CARRIERS.map((c) => (
              <option key={c} value={c}>
                {c || "—"}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Tracking number">
        <input
          value={form.tracking_number}
          onChange={(e) => setField("tracking_number", e.target.value)}
          placeholder="Optional"
          className={inputClass}
        />
      </Field>

      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="Any extra details…"
          rows={3}
          className={inputClass}
        />
      </Field>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        {(saving || uploading) && <Loader2 className="h-5 w-5 animate-spin" />}
        {uploading
          ? "Uploading photos…"
          : saving
            ? "Saving…"
            : queue.length > 0
              ? "Add & Next"
              : "Add Item"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function PhotoSlot({
  label,
  preview,
  onPick,
  onClear,
  icon,
}: {
  label: string;
  preview: string | null;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </span>
      {preview ? (
        <div className="relative inline-block w-full">
          <img
            src={preview}
            alt={label}
            className="h-32 w-full rounded-xl object-cover ring-1 ring-gray-200"
          />
          <button
            type="button"
            onClick={onClear}
            className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-gray-900 text-white shadow"
            aria-label={`Remove ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 bg-white text-gray-500 hover:border-blue-600 hover:text-blue-600">
          {icon}
          <span className="text-xs font-medium">Snap / upload</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
