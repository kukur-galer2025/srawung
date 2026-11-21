<?php

namespace Database\Seeders;

use App\Models\Banner;
use App\Models\Book;
use App\Models\Coupon;
use App\Models\Post;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Konten awal etalase: banner beranda, promo peluncuran, kupon publik, dan artikel blog.
 *
 * Hanya mengisi data yang BELUM ada — perubahan admin tidak akan tertimpa saat dijalankan ulang.
 *
 *   php artisan db:seed --class=StorefrontSeeder
 */
class StorefrontSeeder extends Seeder
{
    /** Promo peluncuran seri Pemrograman (slug => harga promo). */
    private const LAUNCH_PROMO = [
        'laravel-dari-nol-sampai-deploy' => 79000,
        'php-dari-pemula-sampai-mahir' => 74000,
        'pemrograman-go-dari-pemula-sampai-mahir' => 74000,
        'pemrograman-c-dari-pemula-sampai-mahir' => 74000,
        'python-untuk-analisis-data' => 79000,
    ];

    public function run(): void
    {
        $promoEnds = now()->addDays(14)->endOfDay();

        $this->seedPayment();
        $this->seedPromo($promoEnds);
        $this->seedCoupons();
        $this->seedBanners($promoEnds);
        $this->seedPosts();
    }

    /** QRIS toko: satu-satunya metode pembayaran. */
    private function seedPayment(): void
    {
        $source = database_path('seeders/assets/qris-amania.webp');
        $disk = \Illuminate\Support\Facades\Storage::disk('public');
        if (is_file($source) && !$disk->exists(\App\Services\PaymentInfo::DEFAULT_IMAGE)) {
            $disk->put(\App\Services\PaymentInfo::DEFAULT_IMAGE, file_get_contents($source));
        }
        \App\Models\Setting::firstOrCreate(['key' => 'qris_merchant_name'], ['value' => \App\Services\PaymentInfo::DEFAULT_MERCHANT]);
        \App\Models\Setting::firstOrCreate(['key' => 'qris_nmid'], ['value' => \App\Services\PaymentInfo::DEFAULT_NMID]);
    }

    private function seedPromo($endsAt): void
    {
        foreach (self::LAUNCH_PROMO as $slug => $salePrice) {
            $book = Book::where('slug', $slug)->first();
            if ($book && $book->sale_price === null && $salePrice < $book->price) {
                $book->update(['sale_price' => $salePrice, 'sale_ends_at' => $endsAt]);
            }
        }
    }

    private function seedCoupons(): void
    {
        $coupon = Coupon::where('code', 'DISKON10')->first();
        if ($coupon && $coupon->description === null) {
            $coupon->update(['is_public' => true, 'description' => 'Hemat 10% untuk semua buku, bisa digabung dengan harga promo.']);
        }
    }

    private function seedBanners($promoEnds): void
    {
        if (Banner::exists()) {
            return;
        }

        $cover = fn (string $slug) => Book::where('slug', $slug)->value('cover_path');

        $banners = [
            [
                'eyebrow' => 'Promo peluncuran',
                'title' => 'Hemat hingga 20% untuk seri Pemrograman',
                'subtitle' => 'PHP, Laravel, Go, C++, dan Python dengan harga spesial sampai ' . $promoEnds->translatedFormat('j F Y') . '.',
                'cta_label' => 'Lihat promo',
                'link_url' => '/promo',
                'image_path' => $cover('laravel-dari-nol-sampai-deploy'),
                'theme' => 'navy',
            ],
            [
                'eyebrow' => 'Persiapan ujian 2027',
                'title' => 'Siap tempur SKD CPNS & SNBT',
                'subtitle' => 'Ratusan soal berpembahasan dan tryout lengkap. Baca 8 halaman pertama gratis.',
                'cta_label' => 'Lihat bukunya',
                'link_url' => '/buku?category=persiapan-ujian',
                'image_path' => $cover('sukses-snbt-2027'),
                'theme' => 'emerald',
            ],
            [
                'eyebrow' => 'Kupon spesial',
                'title' => 'Pakai kode DISKON10, hemat 10%',
                'subtitle' => 'Berlaku untuk semua buku dan bisa digabung dengan harga promo. Kuota terbatas.',
                'cta_label' => 'Ambil kupon',
                'link_url' => '/promo',
                'image_path' => $cover('jago-prompting'),
                'theme' => 'amber',
            ],
        ];

        foreach ($banners as $i => $banner) {
            Banner::create([...$banner, 'sort_order' => $i + 1, 'is_active' => true]);
        }
    }

    private function seedPosts(): void
    {
        $authorId = User::where('role', 'admin')->value('id');
        $bookId = fn (string $slug) => Book::where('slug', $slug)->value('id');

        $posts = [
            [
                'title' => '5 Langkah Belajar Pemrograman dari Nol Tanpa Bingung',
                'tag' => 'Tips Belajar',
                'book' => 'php-dari-pemula-sampai-mahir',
                'days_ago' => 1,
                'excerpt' => 'Bingung mulai dari mana? Ini peta belajar sederhana yang bisa langsung Anda ikuti, dari memilih bahasa pertama sampai membangun proyek pertama.',
                'body' => <<<'MD'
Banyak orang berhenti belajar pemrograman bukan karena materinya terlalu sulit, tetapi karena **tidak tahu harus mulai dari mana**. Tutorial berserakan, bahasa pemrograman ada puluhan, dan setiap orang punya saran berbeda. Berikut lima langkah yang terbukti membantu pemula tetap di jalur.

## 1. Pilih satu bahasa dan satu tujuan

Jangan belajar tiga bahasa sekaligus. Tentukan dulu apa yang ingin Anda buat:

- **Website atau aplikasi web** → mulai dari PHP lalu Laravel, atau JavaScript.
- **Analisis data** → Python dengan pandas.
- **Sistem berperforma tinggi atau game** → C++ atau Go.

Bahasa pertama tidak menentukan karier Anda selamanya. Konsep dasarnya (variabel, percabangan, perulangan, fungsi) berlaku di semua bahasa.

## 2. Pahami dasar, jangan buru-buru ke framework

Framework memang menggoda karena hasilnya cepat terlihat. Namun tanpa memahami dasar, Anda akan kesulitan saat muncul error. Kuasai dulu:

1. Tipe data dan variabel
2. Percabangan (`if`, `else`) dan perulangan (`for`, `while`)
3. Fungsi dan parameter
4. Array atau list
5. Dasar OOP: class dan object

## 3. Ketik ulang, jangan cuma membaca

Membaca kode terasa produktif, tetapi otak baru benar-benar belajar ketika tangan mengetik dan mata melihat error. Biasakan mengetik ulang setiap contoh, lalu **ubah sedikit** untuk melihat apa yang terjadi.

## 4. Uji pemahaman secara rutin

Setelah menyelesaikan satu bab, tutup materinya dan coba jelaskan ulang dengan kata-kata sendiri. Kuis singkat di akhir bab sangat membantu menemukan bagian yang belum benar-benar dipahami.

## 5. Bangun proyek kecil secepatnya

Proyek kecil seperti aplikasi catatan, kalkulator, atau daftar tugas mengajarkan hal yang tidak ada di tutorial: menyusun struktur, membaca dokumentasi, dan memperbaiki bug sendiri. Selesaikan satu proyek kecil sebelum pindah ke proyek yang lebih besar.

---

**Konsisten lebih penting daripada cepat.** Tiga puluh menit setiap hari jauh lebih efektif dibanding lima jam sekali seminggu. Pilih satu buku atau kursus, selesaikan sampai tuntas, lalu lanjutkan ke level berikutnya.
MD,
            ],
            [
                'title' => 'Strategi Lolos Nilai Ambang Batas SKD CPNS: TWK, TIU, dan TKP',
                'tag' => 'Persiapan Ujian',
                'book' => 'panduan-lengkap-lolos-skd-cpns',
                'days_ago' => 3,
                'excerpt' => 'Kenali format tes, sistem penilaian, dan strategi mengerjakan tiap subtes agar nilai Anda aman melewati ambang batas sekaligus bersaing di peringkat atas.',
                'body' => <<<'MD'
Seleksi Kompetensi Dasar (SKD) adalah gerbang utama seleksi CPNS. Di sinilah peserta paling banyak gugur, sering kali bukan karena kurang pintar, tetapi karena **salah strategi**.

> Ketentuan teknis seleksi dapat berubah setiap tahun. Selalu cocokkan dengan pengumuman resmi panitia seleksi nasional sebelum ujian.

## Kenali formatnya

Pada seleksi beberapa tahun terakhir, SKD dikerjakan dengan sistem CAT berisi **110 soal dalam 100 menit**, terbagi menjadi tiga subtes:

| Subtes | Jumlah soal | Penilaian |
| --- | --- | --- |
| TWK (Tes Wawasan Kebangsaan) | 30 | Benar 5, salah/kosong 0 |
| TIU (Tes Intelegensia Umum) | 35 | Benar 5, salah/kosong 0 |
| TKP (Tes Karakteristik Pribadi) | 45 | Setiap pilihan bernilai 1–5 |

Anda harus melewati **nilai ambang batas di setiap subtes**, bukan hanya total. Nilai total tinggi tidak akan menolong jika salah satu subtes di bawah ambang batas.

## Strategi per subtes

### TWK: hafalan yang terarah

Fokus pada Pancasila, UUD 1945, sejarah perjuangan bangsa, Bhinneka Tunggal Ika, dan NKRI. Buat ringkasan pasal-pasal penting dan latih soal analisis, karena soal TWK kini lebih banyak menguji pemahaman daripada hafalan murni.

### TIU: latihan dan manajemen waktu

TIU mencakup kemampuan verbal, numerik, dan figural. Kuncinya adalah **jam terbang latihan**. Kerjakan soal yang Anda kuasai lebih dulu dan jangan terjebak terlalu lama di satu soal hitungan.

### TKP: pahami pola jawaban ideal

Di TKP tidak ada jawaban salah, tetapi ada jawaban yang nilainya lebih tinggi. Pilih jawaban yang mencerminkan sikap profesional, berorientasi pelayanan publik, mampu bekerja sama, dan anti-radikalisme. Hindari jawaban yang pasif, egois, atau melempar tanggung jawab.

## Urutan mengerjakan yang disarankan

Banyak peserta memilih urutan **TKP → TWK → TIU**: TKP tidak memerlukan hitungan dan memberi "modal nilai" di awal, sedangkan TIU yang paling menyita waktu dikerjakan terakhir. Cobalah beberapa urutan saat tryout dan pilih yang paling nyaman untuk Anda.

## Simulasikan kondisi ujian

Lakukan tryout penuh 110 soal dalam 100 menit tanpa jeda, minimal seminggu sekali menjelang ujian. Catat subtes yang paling sering di bawah ambang batas, lalu jadikan prioritas belajar minggu berikutnya.
MD,
            ],
            [
                'title' => 'Cara Menulis Prompt yang Efektif untuk ChatGPT, Claude, dan Gemini',
                'tag' => 'Teknologi & AI',
                'book' => 'jago-prompting',
                'days_ago' => 6,
                'excerpt' => 'Jawaban AI yang biasa saja sering berawal dari perintah yang terlalu singkat. Gunakan kerangka sederhana ini agar asisten AI bekerja tepat sasaran.',
                'body' => <<<'MD'
Asisten AI seperti ChatGPT, Claude, dan Gemini bisa membantu menulis, merangkum, menganalisis, hingga membuat kode. Namun kualitas jawabannya sangat bergantung pada **kualitas perintah (prompt)** yang Anda berikan.

## Kenapa jawaban AI sering kurang memuaskan?

Coba bandingkan dua prompt berikut:

- ❌ *"Buatkan caption Instagram."*
- ✅ *"Buatkan 3 pilihan caption Instagram untuk toko kopi kekinian di Bandung yang meluncurkan menu es kopi gula aren. Target pembaca mahasiswa, gaya bahasa santai, maksimal 40 kata, sertakan ajakan mampir."*

Prompt kedua memberi AI **konteks, tujuan, audiens, gaya, dan batasan**. Hasilnya hampir pasti jauh lebih relevan.

## Kerangka sederhana: PERAN – TUGAS – KONTEKS – FORMAT

1. **Peran**: siapa AI dalam percakapan ini? *"Bertindaklah sebagai editor bahasa Indonesia yang teliti."*
2. **Tugas**: apa yang harus dikerjakan, dengan kata kerja yang jelas? *"Perbaiki ejaan dan susunan kalimat pada teks berikut."*
3. **Konteks**: informasi latar yang dibutuhkan. *"Teks ini adalah surat lamaran kerja untuk posisi staf administrasi."*
4. **Format**: bentuk hasil yang diinginkan. *"Tampilkan versi perbaikan, lalu daftar perubahan dalam poin-poin."*

## Teknik yang langsung terasa hasilnya

- **Beri contoh.** Satu atau dua contoh keluaran yang Anda sukai membuat AI meniru gaya dan strukturnya.
- **Minta bertahap.** Untuk tugas besar, minta kerangka dulu, setujui, baru minta isi per bagian.
- **Minta AI bertanya.** Tambahkan *"Tanyakan dulu informasi yang kurang sebelum menjawab."*
- **Iterasi, jangan mulai ulang.** Lanjutkan percakapan dengan koreksi spesifik: *"Bagian kedua terlalu formal, buat lebih santai."*

## Tetap kritis

AI bisa salah dengan sangat meyakinkan. Selalu periksa fakta, angka, dan kutipan penting, terutama untuk tugas kuliah, dokumen kantor, atau keputusan bisnis. Jangan pula memasukkan data pribadi atau rahasia perusahaan ke layanan AI publik.

---

Menulis prompt adalah keterampilan yang bisa dilatih. Semakin sering Anda bereksperimen dengan kerangka di atas, semakin cepat Anda mendapatkan hasil yang benar-benar membantu pekerjaan.
MD,
            ],
        ];

        foreach ($posts as $data) {
            $slug = \Illuminate\Support\Str::slug($data['title']);
            if (Post::where('slug', $slug)->exists()) {
                continue;
            }

            Post::create([
                'title' => $data['title'],
                'slug' => $slug,
                'tag' => $data['tag'],
                'excerpt' => $data['excerpt'],
                'body' => $data['body'],
                'book_id' => $bookId($data['book']),
                'author_id' => $authorId,
                'status' => 'published',
                'published_at' => now()->subDays($data['days_ago'])->setTime(9, 0),
            ]);
        }
    }
}
