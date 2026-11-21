import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/LegalPage';
import { formatRupiah } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Syarat & Ketentuan Kreator',
  description: 'Ketentuan bagi penulis yang menjual buku di Srawung: hak cipta, bagi hasil, penarikan saldo, dan biaya admin.',
};

interface Facts {
  version: string;
  commission_percent: number;
  min_payout: number;
  payout_fee: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
/** Cadangan bila API sedang tidak bisa dihubungi — sama dengan nilai bawaan backend. */
const FALLBACK: Facts = { version: '2026-11-18', commission_percent: 20, min_payout: 100000, payout_fee: 5000 };

/** Angka bagi hasil & penarikan mengikuti pengaturan admin, jadi diambil dari API. */
async function getFacts(): Promise<Facts> {
  try {
    const res = await fetch(`${API_URL}/creator-terms`, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) return FALLBACK;
    return { ...FALLBACK, ...(await res.json()) };
  } catch {
    return FALLBACK;
  }
}

function sections(f: Facts): LegalSection[] {
  const share = 100 - f.commission_percent;
  const example = 100000;
  const exampleNet = Math.round((example * share) / 100);
  return [
    {
      id: 'definisi',
      title: 'Definisi & Persetujuan',
      body: (
        <>
          <p>
            <strong>Kreator</strong> adalah pengguna Srawung yang akunnya diaktifkan admin untuk menerbitkan dan menjual buku digital miliknya melalui{' '}
            <strong>Studio Kreator</strong>. Ketentuan ini melengkapi{' '}
            <Link href="/syarat-ketentuan" className="font-semibold text-blue-700 hover:text-blue-900">
              Syarat & Ketentuan
            </Link>{' '}
            umum Srawung.
          </p>
          <p>
            Kreator wajib menyetujui ketentuan ini sebelum menerbitkan buku atau menarik saldo. Bila ketentuan diperbarui, Kreator akan diminta menyetujui versi
            terbaru saat membuka Studio Kreator.
          </p>
        </>
      ),
    },
    {
      id: 'hak-cipta',
      title: 'Hak Cipta & Isi Buku',
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Kreator menjamin bahwa ia adalah pemilik hak cipta atau memegang izin tertulis yang sah untuk menjual seluruh isi buku, termasuk teks, gambar, dan sampul.</li>
          <li>
            Buku dilarang memuat plagiarisme, konten bajakan, pornografi, ujaran kebencian atau SARA, ajakan kekerasan, penipuan, maupun konten lain yang melanggar hukum Republik
            Indonesia.
          </li>
          <li>Kreator bertanggung jawab penuh atas isi bukunya, termasuk bila ada klaim atau tuntutan dari pihak ketiga.</li>
          <li>Srawung berhak meninjau, menolak, atau menurunkan buku yang melanggar ketentuan ini maupun yang dilaporkan melanggar hak cipta.</li>
        </ul>
      ),
    },
    {
      id: 'lisensi',
      title: 'Lisensi Penjualan',
      body: (
        <>
          <p>
            Hak cipta tetap milik Kreator. Dengan menerbitkan buku, Kreator memberi Srawung izin <strong>non-eksklusif</strong> untuk menyimpan, mengonversi file ke format
            baca Srawung, membubuhkan tanda air (watermark) perlindungan, menampilkan halaman pratinjau gratis, memasarkan, dan menjual akses baca buku tersebut.
          </p>
          <p>
            Kreator dapat menarik bukunya dari penjualan kapan saja. Pembeli yang sudah membeli sebelum buku ditarik tetap memiliki akses baca sesuai ketentuan
            pembelian.
          </p>
        </>
      ),
    },
    {
      id: 'bagi-hasil',
      title: 'Harga & Bagi Hasil',
      body: (
        <>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Kreator menentukan harga dan promo bukunya sendiri.</li>
            <li>Pembeli membayar ke Srawung melalui QRIS. Pendapatan Kreator dicatat ke saldo setelah pembayaran dikonfirmasi admin.</li>
            <li>
              Kreator menerima <strong>{share}%</strong> dan Srawung mengambil komisi <strong>{f.commission_percent}%</strong> dari harga yang dibayar pembeli. Komisi khusus per
              Kreator dapat disepakati dan akan tampil di Studio Kreator.
            </li>
            <li>Diskon dari <strong>voucher Kreator</strong> mengurangi pendapatan Kreator. Diskon dari kupon Srawung ditanggung Srawung dan tidak mengurangi pendapatan Kreator.</li>
          </ul>
          <p className="rounded-xl bg-slate-50 p-4 text-sm">
            Contoh: buku seharga {formatRupiah(example)} terjual tanpa voucher Kreator → saldo Kreator bertambah <strong>{formatRupiah(exampleNet)}</strong>.
          </p>
        </>
      ),
    },
    {
      id: 'penarikan',
      title: 'Penarikan Saldo & Biaya Admin',
      body: (
        <>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Saldo dapat ditarik bila jumlah penarikan minimal <strong>{formatRupiah(f.min_payout)}</strong>.
            </li>
            <li>
              Setiap penarikan dikenakan <strong>biaya admin {formatRupiah(f.payout_fee)}</strong> yang dipotong dari jumlah yang ditarik. Contoh: menarik{' '}
              {formatRupiah(f.min_payout)} → yang ditransfer ke rekening Anda {formatRupiah(f.min_payout - f.payout_fee)}.
            </li>
            <li>Hanya satu pengajuan yang dapat diproses dalam satu waktu. Admin mentransfer secara manual dalam 1–3 hari kerja ke rekening bank atau e-wallet yang terdaftar.</li>
            <li>
              Kreator wajib memastikan nama pemilik dan nomor rekening/e-wallet benar. Kesalahan transfer akibat data yang keliru menjadi tanggung jawab Kreator.
            </li>
            <li>Pengajuan yang ditolak admin (mis. nama rekening tidak cocok) tidak dikenakan biaya, dan saldonya kembali utuh.</li>
            <li>Kreator bertanggung jawab atas kewajiban pajak atas penghasilannya sendiri.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'koreksi',
      title: 'Koreksi Saldo',
      body: (
        <p>
          Bila sebuah pesanan dibatalkan atau dananya dikembalikan sesuai kebijakan pengembalian dana Srawung (misalnya pembayaran ganda atau buku tidak dapat dibaca),
          pendapatan Kreator dari pesanan tersebut dapat dikoreksi dari saldo.
        </p>
      ),
    },
    {
      id: 'pelanggaran',
      title: 'Pelanggaran & Penghentian',
      body: (
        <>
          <p>
            Bila Kreator melanggar ketentuan ini, Srawung dapat menurunkan buku, menonaktifkan akun Kreator, dan menahan saldo yang berasal dari penjualan konten yang
            melanggar sampai masalahnya selesai.
          </p>
          <p>Kreator dapat berhenti kapan saja dengan menghubungi admin. Saldo yang sah dan memenuhi syarat penarikan tetap dapat dicairkan.</p>
        </>
      ),
    },
    {
      id: 'perubahan',
      title: 'Perubahan Ketentuan',
      body: (
        <p>
          Srawung dapat memperbarui ketentuan ini, termasuk besaran komisi, minimal penarikan, dan biaya admin. Perubahan diumumkan di halaman ini dan Kreator akan
          diminta menyetujui versi terbaru sebelum menerbitkan buku atau menarik saldo berikutnya.
        </p>
      ),
    },
  ];
}

export default async function CreatorTermsPage() {
  const facts = await getFacts();
  const [y, m, d] = facts.version.split('-').map(Number);
  const updated = new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <LegalPage
      eyebrow="Program kreator"
      title="Syarat & Ketentuan Kreator"
      updated={updated}
      intro={
        <p>
          Ketentuan ini berlaku bagi penulis yang menjual buku di Srawung. Ringkasnya: hak cipta tetap milik Anda, Anda menerima {100 - facts.commission_percent}% dari
          setiap penjualan, dan saldo dapat ditarik mulai {formatRupiah(facts.min_payout)} dengan biaya admin {formatRupiah(facts.payout_fee)} per penarikan.
        </p>
      }
      sections={sections(facts)}
      related={{ href: '/syarat-ketentuan', label: 'Syarat & Ketentuan umum' }}
    />
  );
}
