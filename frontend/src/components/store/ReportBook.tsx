"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Flag, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { flash } from "@/lib/flash";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/Modal";

const TYPES = [
  {
    value: "hak_cipta",
    label: "Pelanggaran hak cipta",
    hint: "Isi buku disalin/dijual tanpa izin pemilik hak.",
  },
  {
    value: "konten_terlarang",
    label: "Konten terlarang",
    hint: "Pornografi, ujaran kebencian/SARA, penipuan, dll.",
  },
  {
    value: "lainnya",
    label: "Lainnya",
    hint: "Masalah lain yang perlu ditinjau tim kami.",
  },
];

const RELATIONSHIPS = [
  { value: "pemilik", label: "Saya pemilik hak cipta" },
  { value: "kuasa", label: "Saya mewakili pemilik hak" },
  { value: "pembaca", label: "Saya pembaca / pihak lain" },
];

const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-jade-400 focus:ring-4 focus:ring-jade-400/15 sm:text-sm";

/** Tautan kecil "Laporkan buku ini" + formulir laporan hak cipta / konten. */
export function ReportBook({ slug, title }: { slug: string; title: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    reporter_name: "",
    reporter_email: "",
    type: "hak_cipta",
    relationship: "pemilik",
    description: "",
    evidence_url: "",
    statement: false,
  });

  const show = () => {
    setForm((f) => ({
      ...f,
      reporter_name: f.reporter_name || user?.name || "",
      reporter_email: f.reporter_email || user?.email || "",
    }));
    setError(null);
    setOpen(true);
  };
  const set =
    (k: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await api.post(`/books/${encodeURIComponent(slug)}/report`, {
        ...form,
        evidence_url: form.evidence_url.trim() || null,
      });
      setOpen(false);
      setForm((f) => ({
        ...f,
        description: "",
        evidence_url: "",
        statement: false,
      }));
      flash.success("Laporan terkirim", res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Laporan gagal dikirim.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="mt-14 flex justify-center">
        <button
          onClick={show}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-rose-600"
        >
          <Flag className="h-3.5 w-3.5" />
          Laporkan buku ini
        </button>
      </div>

      {/* Portal ke <body>: kontainer halaman buku punya stacking context sendiri (animasi/z-index) yang menimpa modal. */}
      {open &&
        createPortal(
          <Modal
            isOpen={open}
            onClose={() => setOpen(false)}
            title="Laporkan buku"
            maxWidth="lg"
          >
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-slate-600">
                Laporan untuk{" "}
                <strong className="text-slate-900">{title}</strong>. Tim kami
                meninjau maksimal 3 hari kerja dan mengabari Anda lewat email.
              </p>

              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-slate-700">
                  Jenis masalah
                </legend>
                <div className="grid gap-2">
                  {TYPES.map((t) => (
                    <label
                      key={t.value}
                      className={`flex cursor-pointer gap-3 rounded-xl border px-3.5 py-2.5 transition ${form.type === t.value ? "border-rose-300 bg-rose-50/60" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <input
                        type="radio"
                        name="type"
                        value={t.value}
                        checked={form.type === t.value}
                        onChange={set("type")}
                        className="mt-1 accent-rose-600"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">
                          {t.label}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {t.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Nama
                  </span>
                  <input
                    className={input}
                    value={form.reporter_name}
                    onChange={set("reporter_name")}
                    required
                    maxLength={120}
                    autoComplete="name"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Email
                  </span>
                  <input
                    type="email"
                    className={input}
                    value={form.reporter_email}
                    onChange={set("reporter_email")}
                    required
                    maxLength={190}
                    autoComplete="email"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Hubungan Anda
                </span>
                <select
                  className={input}
                  value={form.relationship}
                  onChange={set("relationship")}
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Uraian
                </span>
                <textarea
                  className={`${input} min-h-28`}
                  value={form.description}
                  onChange={set("description")}
                  required
                  minLength={30}
                  maxLength={5000}
                  placeholder="Bagian mana yang melanggar, dan bila Anda pemilik hak: judul/ISBN karya asli Anda."
                />
                <span className="mt-1 block text-right text-xs text-slate-400">
                  {form.description.trim().length}/30 karakter minimal
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tautan bukti (opsional)
                </span>
                <input
                  type="url"
                  className={input}
                  value={form.evidence_url}
                  onChange={set("evidence_url")}
                  placeholder="https://…"
                  maxLength={500}
                />
              </label>

              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.statement}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, statement: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
                />
                <span>
                  Saya menyatakan laporan ini dibuat dengan itikad baik dan
                  informasinya benar. Data saya diproses sesuai{" "}
                  <Link
                    href="/kebijakan-privasi"
                    target="_blank"
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    Kebijakan Privasi
                  </Link>
                  .
                </span>
              </label>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    sending ||
                    !form.statement ||
                    form.description.trim().length < 30
                  }
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Kirim laporan
                </button>
              </div>
            </form>
          </Modal>,
          document.body,
        )}
    </>
  );
}
