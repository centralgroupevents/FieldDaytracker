"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createItem } from "@/app/actions/inventory";

const CARRIERS = ["", "UPS", "FedEx", "USPS", "DHL", "Amazon"] as const;

export default function AddItemForm() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** Uploads the chosen photo to Supabase Storage and returns its public URL. */
  async function uploadImage(): Promise<string | null> {
    if (!file) return null;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      // Avoid Math.random()/Date.now collisions deterministically enough here.
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("item-images")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from("item-images").getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);

    startTransition(async () => {
      try {
        const image_url = await uploadImage();

        const res = await createItem({
          item_name: String(fd.get("item_name") || ""),
          image_url,
          unit_price: Number(fd.get("unit_price") || 0),
          target_quantity: Number(fd.get("target_quantity") || 0),
          current_stock: Number(fd.get("current_stock") || 0),
          carrier: (fd.get("carrier") as string) || null,
          tracking_number: (fd.get("tracking_number") as string) || null,
        });

        if (!res.ok) {
          setError(res.error ?? "Failed to create item.");
          return;
        }
        form.reset();
        clearFile();
        router.push("/inventory");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  const busy = pending || uploading;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Photo */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Photo
        </label>
        {preview ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview"
              className="h-40 w-40 rounded-xl object-cover ring-1 ring-gray-200"
            />
            <button
              type="button"
              onClick={clearFile}
              className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-gray-900 text-white shadow"
              aria-label="Remove photo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex h-40 w-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white text-gray-500 hover:border-brand hover:text-brand">
            <Camera className="h-7 w-7" />
            <span className="text-xs font-medium">Snap / upload</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPickFile}
              className="hidden"
            />
          </label>
        )}
      </div>

      <Field label="Item name" required>
        <input
          name="item_name"
          required
          placeholder="e.g. Folding canopy tent"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Unit price ($)">
          <input
            name="unit_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            className={inputClass}
          />
        </Field>
        <Field label="Target quantity">
          <input
            name="target_quantity"
            type="number"
            min="0"
            step="1"
            defaultValue="0"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Current stock">
          <input
            name="current_stock"
            type="number"
            min="0"
            step="1"
            defaultValue="0"
            className={inputClass}
          />
        </Field>
        <Field label="Carrier">
          <select name="carrier" defaultValue="" className={inputClass}>
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
          name="tracking_number"
          placeholder="Optional"
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
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-60"
      >
        {busy && <Loader2 className="h-5 w-5 animate-spin" />}
        {uploading ? "Uploading photo…" : pending ? "Saving…" : "Add Item"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

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
