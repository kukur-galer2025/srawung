import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Syarat & Ketentuan',
  description: 'Syarat dan ketentuan penggunaan layanan toko buku digital Srawung.',
};

const sections: LegalSection[] = [
  {
    id: 'definisi',
    title: 'Definisi',
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Srawung</strong> (&quot;kami&quot;) adalah layanan toko buku digital yang menjual akses baca buku elektronik (e-book) melalui situs ini.
        </li>
        <li>
          <strong>Pengguna</strong> (&quot;Anda&quot;) adalah setiap orang yang mengakses situs, membuat akun, atau membeli buku di Srawung.
        </li>
        <li>
          <strong>Buku Digital</strong> adalah konten buku yang dapat dibaca melalui fitur pembaca (reader) di situs Srawung, bukan berupa file yang diunduh.
        </li>
        <li>
          <strong>Pesanan</strong> adalah permintaan pembelian satu atau lebih Buku Digital yang dibuat melalui keranjang belanja.
        </li>
      </ul>
    ),
  },
  {
    id: 'akun',
    title: 'Akun Pengguna',
    body: (
      <>
        <p>
          Untuk membeli dan membaca buku, Anda wajib membuat akun menggunakan email dan kata sandi, atau masuk dengan akun Google. Anda menjamin bahwa data yang
          diberikan (nama, email, dan nomor WhatsApp) benar dan milik Anda sendiri.
        </p>
        <p>
          Anda bertanggung jawab menjaga kerahasiaan kata sandi dan seluruh aktivitas yang terjadi di akun Anda. Satu akun hanya untuk satu orang dan tidak
          boleh dipinjamkan, dibagikan, atau dijual kepada pihak lain.
        </p>
        <p>Segera beri tahu kami bila Anda menduga akun Anda digunakan tanpa izin.</p>
      </>
    ),
  },
  {
    id: 'pembelian',
    title: 'Pemesanan & Pembayaran',
    body: (
      <>
        <p>Pembayaran hanya dilakukan melalui <strong>QRIS</strong> resmi Srawung yang ditampilkan di halaman pembayaran setiap pesanan. Pastikan nama merchant yang muncul di aplikasi Anda sesuai dengan yang tertera di halaman pembayaran.</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Anda wajib membayar <strong>tepat</strong> sesuai total tagihan pesanan dan mengunggah bukti pembayaran di halaman pesanan agar pembayaran
            dapat dicocokkan.
          </li>
          <li>
            Pembayaran harus diselesaikan dan bukti pembayaran diunggah sebelum <strong>batas waktu pembayaran</strong> yang tertera di pesanan. Pesanan yang
            melewati batas waktu akan <strong>kedaluwarsa otomatis</strong> dan tidak dapat dibayar lagi.
          </li>
          <li>
            Bukti pembayaran diverifikasi secara manual oleh admin. Jika bukti ditolak, Anda akan diberi tahu alasannya melalui email dan diberi tenggat baru untuk
            mengunggah ulang.
          </li>
          <li>Akses buku aktif setelah pembayaran dikonfirmasi admin. Konfirmasi dan invoice dikirim ke email akun Anda.</li>
          <li>
            Kode kupon hanya berlaku sesuai ketentuan (nilai, kuota, dan masa berlaku) yang ditetapkan. Kuota kupon dari pesanan yang kedaluwarsa dikembalikan
            otomatis.
          </li>
          <li>Harga yang berlaku adalah harga pada saat pesanan dibuat.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'lisensi',
    title: 'Lisensi Penggunaan Buku Digital',
    body: (
      <>
        <p>
          Pembelian memberi Anda <strong>lisensi pribadi, non-eksklusif, dan tidak dapat dipindahtangankan</strong> untuk membaca Buku Digital melalui situs
          Srawung. Pembelian <strong>bukan</strong> pengalihan hak cipta; seluruh hak cipta tetap milik penulis dan/atau penerbit.
        </p>
        <p>Anda dilarang:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>menyalin, memotret layar, merekam, mencetak, atau mengunduh isi buku untuk disebarluaskan;</li>
          <li>membagikan, menjual, atau meminjamkan akses buku maupun akun kepada orang lain;</li>
          <li>menghapus, menutupi, atau mengubah watermark identitas pembeli yang ditampilkan di setiap halaman;</li>
          <li>menggunakan alat otomatis untuk mengakses atau mengambil isi buku.</li>
        </ul>
        <p>
          Setiap halaman yang Anda baca diberi watermark berisi nama dan email Anda, dan akses halaman dicatat. Data ini dapat digunakan untuk menelusuri
          penyebaran konten tanpa izin.
        </p>
      </>
    ),
  },
  {
    id: 'akses',
    title: 'Akses & Ketersediaan Layanan',
    body: (
      <>
        <p>
          Buku yang telah dikonfirmasi dapat Anda baca kapan saja selama akun Anda aktif dan layanan Srawung beroperasi. Kami berupaya menjaga layanan tetap
          tersedia, namun tidak menjamin layanan bebas gangguan, misalnya saat pemeliharaan sistem.
        </p>
        <p>
          Pratinjau gratis tersedia untuk beberapa halaman pertama setiap buku agar Anda dapat menilai isi buku sebelum membeli.
        </p>
      </>
    ),
  },
  {
    id: 'pengembalian',
    title: 'Pembatalan & Pengembalian Dana',
    body: (
      <>
        <p>
          Karena Buku Digital langsung dapat diakses setelah pembayaran dikonfirmasi, pembelian yang telah dikonfirmasi <strong>tidak dapat dibatalkan atau
          dikembalikan dananya</strong>, kecuali dalam kondisi berikut:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Anda membayar dua kali untuk pesanan yang sama;</li>
          <li>Anda membayar untuk pesanan yang sudah kedaluwarsa;</li>
          <li>buku tidak dapat dibaca karena kesalahan di pihak kami dan tidak dapat diperbaiki dalam waktu wajar.</li>
        </ul>
        <p>
          Untuk mengajukan pengembalian dana, hubungi admin dengan menyertakan nomor pesanan dan bukti pembayaran. Pengembalian dana disalurkan ke rekening atau
          e-wallet atas nama pembayar setelah diverifikasi.
        </p>
      </>
    ),
  },
  {
    id: 'pelanggaran',
    title: 'Pelanggaran & Penangguhan Akun',
    body: (
      <p>
        Kami berhak memblokir akun dan/atau mencabut akses buku tanpa pengembalian dana apabila Anda melanggar Syarat & Ketentuan ini, khususnya ketentuan
        lisensi pada bagian 4, atau terindikasi melakukan penipuan pembayaran. Pemblokiran akan langsung mengeluarkan seluruh sesi login aktif Anda.
      </p>
    ),
  },
  {
    id: 'tanggung-jawab',
    title: 'Batasan Tanggung Jawab',
    body: (
      <p>
        Isi buku sepenuhnya merupakan tanggung jawab penulis dan/atau penerbit. Sejauh diizinkan hukum, tanggung jawab Srawung atas kerugian yang timbul dari
        penggunaan layanan terbatas pada jumlah yang Anda bayarkan untuk pesanan terkait.
      </p>
    ),
  },
  {
    id: 'perubahan',
    title: 'Perubahan Ketentuan',
    body: (
      <p>
        Kami dapat memperbarui Syarat & Ketentuan ini dari waktu ke waktu. Tanggal pembaruan terakhir tercantum di bagian atas halaman. Dengan tetap
        menggunakan layanan setelah perubahan, Anda dianggap menyetujui ketentuan yang baru.
      </p>
    ),
  },
  {
    id: 'hukum',
    title: 'Hukum yang Berlaku',
    body: (
      <p>
        Syarat & Ketentuan ini tunduk pada hukum Republik Indonesia. Perselisihan akan diupayakan diselesaikan secara musyawarah terlebih dahulu sebelum
        menempuh jalur hukum yang berlaku.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Ketentuan layanan"
      title="Syarat & Ketentuan"
      updated="16 November 2026"
      intro={
        <p>
          Dengan membuat akun atau membeli buku di Srawung, Anda menyetujui Syarat & Ketentuan berikut. Mohon baca dengan saksama. Penggunaan data pribadi
          Anda diatur dalam{' '}
          <Link href="/kebijakan-privasi" className="font-semibold text-blue-700 hover:text-blue-900">
            Kebijakan Privasi
          </Link>
          .
        </p>
      }
      sections={sections}
      related={{ href: '/kebijakan-privasi', label: 'Kebijakan Privasi' }}
    />
  );
}
