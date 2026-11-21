import Link from 'next/link';
import type { ReactNode } from 'react';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * Tata letak halaman hukum (Syarat & Ketentuan, Kebijakan Privasi):
 * daftar isi lengket di kiri, isi bernomor di kanan.
 */
export function LegalPage({
  eyebrow,
  title,
  updated,
  intro,
  sections,
  related,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
  related: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <header className="mb-10 max-w-3xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p>
        <h1 className="font-display text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-slate-500">Terakhir diperbarui: {updated}</p>
        <div className="mt-6 text-[15px] leading-relaxed text-slate-600">{intro}</div>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Daftar isi" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Daftar isi</p>
            <ol className="space-y-1 border-l border-slate-200 text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-slate-500 transition hover:border-blue-600 hover:text-slate-900">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
            <Link href={related.href} className="mt-6 block pl-4 text-sm font-semibold text-blue-700 hover:text-blue-900">
              {related.label} →
            </Link>
          </div>
        </nav>

        <article className="min-w-0 max-w-3xl space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="mb-3 font-display text-xl font-medium text-slate-900">
                {i + 1}. {s.title}
              </h2>
              <div className="legal-body space-y-3 text-[15px] leading-relaxed text-slate-600">{s.body}</div>
            </section>
          ))}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Ada pertanyaan tentang dokumen ini? Hubungi kami melalui WhatsApp admin yang tercantum di bagian bawah situs. Lihat juga{' '}
            <Link href={related.href} className="font-semibold text-blue-700 hover:text-blue-900">
              {related.label}
            </Link>
            .
          </div>
        </article>
      </div>
    </div>
  );
}
