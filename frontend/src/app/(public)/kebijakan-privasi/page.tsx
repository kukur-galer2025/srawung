import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Kebijakan Privasi',
  description: 'Bagaimana Srawung mengumpulkan, menggunakan, dan melindungi data pribadi Anda.',
};

function DataTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Sumber</th>
            <th className="px-4 py-3">Kegunaan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map(([d, s, k]) => (
            <tr key={d}>
              <td className="px-4 py-3 font-medium text-slate-800">{d}</td>
              <td className="px-4 py-3">{s}</td>
              <td className="px-4 py-3">{k}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const sections: LegalSection[] = [
  {
    id: 'data',
    title: 'Data yang Kami Kumpulkan',
    body: (
      <>
        <p>Kami hanya mengumpulkan data yang diperlukan untuk menjalankan layanan:</p>
        <DataTable
          rows={[
            ['Nama, email, nomor WhatsApp', 'Formulir pendaftaran & profil', 'Identitas akun, notifikasi pesanan, konfirmasi pembayaran'],
            ['Kata sandi', 'Formulir pendaftaran', 'Masuk ke akun (disimpan dalam bentuk hash, tidak dapat dibaca)'],
            ['Nama, email, foto profil Google', 'Login dengan Google (bila dipilih)', 'Membuat/menghubungkan akun tanpa kata sandi'],
            ['Riwayat pesanan & kupon', 'Aktivitas belanja', 'Memproses pesanan, invoice, dan laporan penjualan'],
            ['Isi keranjang belanja', 'Saat Anda login dan menambah buku/paket', 'Menyimpan keranjang lintas perangkat & mengirim pengingat keranjang yang belum dibayar'],
            ['Email pelanggan newsletter', 'Formulir newsletter / halaman Profil', 'Mengirim newsletter setelah Anda mengonfirmasi lewat email (double opt-in)'],
            ['Bukti pembayaran QRIS & catatan pembayaran', 'Unggahan Anda', 'Verifikasi pembayaran oleh admin'],
            ['Halaman terakhir dibaca, penanda halaman, catatan baca', 'Fitur reader', 'Melanjutkan bacaan & menyimpan catatan Anda di perangkat mana pun'],
            ['Ulasan & rating, wishlist, topik favorit', 'Yang Anda isi sendiri', 'Menampilkan ulasan, mengirim kabar promo wishlist, menyusun rekomendasi'],
            ['Buku yang dilihat', 'Otomatis saat membuka halaman buku', 'Rekomendasi buku & tren (tamu: hanya disimpan di peramban Anda)'],
            ['Sumber kunjungan (kode UTM, domain situs perujuk)', 'Tautan yang Anda klik', 'Mengukur efektivitas promosi; hanya domain perujuk yang disimpan'],
            ['Alamat IP, jenis perangkat/peramban, log akses halaman', 'Otomatis saat membaca', 'Keamanan akun, batas perangkat & kecepatan baca, pencegahan penyebaran konten tanpa izin'],
          ]}
        />
        <p>Kami tidak mengumpulkan data kartu kredit, rekening bank, atau akun e-wallet Anda selain yang tampak pada bukti pembayaran yang Anda unggah.</p>
      </>
    ),
  },
  {
    id: 'penggunaan',
    title: 'Cara Kami Menggunakan Data',
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>menyediakan akun, memproses pesanan, dan memberikan akses buku;</li>
        <li>
          mengirim email transaksional: verifikasi email, tanda terima bukti bayar, pengingat batas pembayaran, konfirmasi/penolakan pembayaran, invoice, dan
          tautan reset kata sandi;
        </li>
        <li>
          mengirim pengingat keranjang yang belum dibayar (maksimal 2 kali), kabar promo buku di wishlist, dan pengingat melanjutkan buku yang berhenti
          dibaca di tengah jalan (maksimal sekali tiap 2 minggu). Semuanya dapat dimatikan satu klik dari email
          atau di <strong>Profil → Email dari Srawung</strong>;
        </li>
        <li>
          meningkatkan mutu asisten Kanca: pertanyaan & jawaban di obrolan Kanca disimpan paling lama 90 hari (terhubung ke akun bila Anda masuk), lalu dihapus otomatis. Jangan menuliskan kata sandi atau data pembayaran di obrolan;
        </li>
        <li>mengirim newsletter hanya kepada yang berlangganan dan sudah mengonfirmasi. Setiap edisi memuat tautan berhenti berlangganan;</li>
        <li>menghubungi Anda melalui WhatsApp terkait pesanan bila diperlukan;</li>
        <li>menampilkan watermark identitas pembeli di halaman buku untuk melindungi hak cipta penulis;</li>
        <li>menjaga keamanan layanan dan mencegah penyalahgunaan.</li>
      </ul>
    ),
  },
  {
    id: 'dasar-hukum',
    title: 'Dasar Pemrosesan',
    body: (
      <p>
        Kami memproses data pribadi sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi, atas dasar persetujuan yang Anda berikan saat
        mendaftar dan untuk pemenuhan perjanjian jual-beli (Syarat & Ketentuan) antara Anda dan Srawung.
      </p>
    ),
  },
  {
    id: 'pihak-ketiga',
    title: 'Pihak Ketiga',
    body: (
      <>
        <p>
          Kami <strong>tidak menjual</strong> data pribadi Anda. Data hanya dibagikan kepada penyedia layanan yang diperlukan untuk menjalankan Srawung:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Google</strong>: layanan login dengan Google (bila Anda memilihnya) dan pengiriman email melalui Gmail;
          </li>
          <li>
            <strong>Penyedia hosting/server</strong>: tempat data aplikasi disimpan;
          </li>
          <li>
            <strong>Sentry</strong> (bila diaktifkan pengelola situs): pencatatan error teknis untuk memperbaiki gangguan. Yang dikirim hanya pesan error, jenis
            peramban, dan alamat halaman — tanpa nama, email, cookie, atau isi formulir;
          </li>
          <li>
            <strong>Google Analytics &amp; Meta</strong> (hanya bila Anda menyetujui cookie analitik): statistik kunjungan dan efektivitas iklan. Lihat bagian{' '}
            <a href="#cookie" className="font-semibold underline-offset-2 hover:underline">
              Cookie
            </a>
            .
          </li>
        </ul>
        <p>Kami juga dapat mengungkapkan data bila diwajibkan oleh hukum atau perintah otoritas yang berwenang.</p>
      </>
    ),
  },
  {
    id: 'keamanan',
    title: 'Penyimpanan & Keamanan',
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Kata sandi disimpan dalam bentuk hash satu arah.</li>
        <li>Bukti pembayaran disimpan di penyimpanan privat dan hanya dapat dilihat oleh admin.</li>
        <li>Sesi login menggunakan token yang dicabut saat Anda keluar, mengganti kata sandi melalui reset, atau saat akun diblokir.</li>
        <li>Halaman buku dikirim per halaman dengan watermark, bukan sebagai file yang dapat diunduh.</li>
        <li>
          Untuk mencegah pembajakan, setiap halaman memuat tanda identitas akun (terlihat dan tersembunyi), tangkapan layar & cetak di halaman baca
          dinonaktifkan sebisa mungkin, dan kecepatan membuka halaman dibatasi. Aktivitas yang melewati batas dicatat (waktu, alamat IP, jenis
          perangkat) dan dapat ditinjau admin untuk menelusuri konten yang tersebar.
        </li>
      </ul>
    ),
  },
  {
    id: 'penyimpanan-lokal',
    title: 'Penyimpanan di Peramban',
    body: (
      <>
        <p>
          Srawung menyimpan token login, isi keranjang, riwayat buku yang terakhir dilihat, topik favorit (untuk tamu), dan sumber kunjungan di penyimpanan
          lokal peramban (localStorage). Data ini diperlukan agar layanan berfungsi dan tidak dibagikan ke pihak lain. Riwayat lihat bisa dihapus dari rak
          &ldquo;Terakhir Anda lihat&rdquo; di beranda; semuanya terhapus bila Anda mengosongkan data situs di peramban.
        </p>
        <p id="cookie" className="scroll-mt-24">
          <strong>Cookie analitik.</strong> Bila diaktifkan oleh pengelola situs, kami memakai Google Analytics dan Meta Pixel untuk statistik kunjungan dan
          pengukuran iklan. Keduanya <strong>hanya dimuat setelah Anda menekan &ldquo;Terima&rdquo;</strong> pada banner cookie, dan Anda dapat mengubah
          pilihan kapan saja melalui tautan &ldquo;Pengaturan cookie&rdquo; di bagian bawah situs. Menolak tidak memengaruhi fungsi belanja dan membaca.
        </p>
      </>
    ),
  },
  {
    id: 'retensi',
    title: 'Lama Penyimpanan',
    body: (
      <>
        <p>Data akun disimpan selama akun Anda aktif. Log akses baca disimpan seperlunya untuk keamanan.</p>
        <p>
          Bila Anda menghapus akun, <strong>data pribadi dihapus</strong>: nama, email, nomor WhatsApp, foto, ulasan, wishlist, catatan, penanda, riwayat
          baca, dan akses buku. <strong>Catatan transaksi</strong> (nomor pesanan, nilai, tanggal, dan bukti pembayaran) tetap disimpan tanpa identitas
          akun karena wajib untuk pembukuan sesuai ketentuan dokumen keuangan yang berlaku.
        </p>
      </>
    ),
  },
  {
    id: 'hak',
    title: 'Hak Anda',
    body: (
      <>
        <p>Sesuai UU Pelindungan Data Pribadi, Anda berhak untuk:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            mengakses dan memperoleh salinan data pribadi Anda: hubungi admin melalui WhatsApp dari akun email terdaftar, kami kirimkan salinannya;
          </li>
          <li>memperbaiki data yang tidak akurat: nama, WhatsApp, dan email dapat diubah langsung di halaman Profil;</li>
          <li>
            menghapus akun dan data pribadi Anda: <strong>Profil → Data &amp; privasi → Hapus akun</strong>;
          </li>
          <li>menarik persetujuan cookie analitik kapan saja melalui &ldquo;Pengaturan cookie&rdquo;.</li>
        </ul>
        <p>Permintaan lain dapat diajukan melalui WhatsApp admin. Kami akan menanggapi paling lambat 3×24 jam sejak permintaan diterima.</p>
      </>
    ),
  },
  {
    id: 'anak',
    title: 'Pengguna di Bawah Umur',
    body: (
      <p>
        Pengguna yang belum berusia 18 tahun sebaiknya menggunakan layanan dengan izin dan pendampingan orang tua atau wali, termasuk saat melakukan
        pembayaran.
      </p>
    ),
  },
  {
    id: 'perubahan',
    title: 'Perubahan Kebijakan',
    body: (
      <p>
        Kebijakan ini dapat diperbarui sewaktu-waktu. Perubahan penting akan diberitahukan melalui email atau pemberitahuan di situs. Tanggal pembaruan
        terakhir tercantum di bagian atas halaman.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privasi"
      title="Kebijakan Privasi"
      updated="17 November 2026"
      intro={
        <p>
          Kebijakan ini menjelaskan data pribadi apa yang dikumpulkan Srawung, untuk apa digunakan, dan bagaimana kami melindunginya. Kebijakan ini merupakan
          bagian dari{' '}
          <Link href="/syarat-ketentuan" className="font-semibold text-blue-700 hover:text-blue-900">
            Syarat & Ketentuan
          </Link>{' '}
          layanan Srawung.
        </p>
      }
      sections={sections}
      related={{ href: '/syarat-ketentuan', label: 'Syarat & Ketentuan' }}
    />
  );
}
