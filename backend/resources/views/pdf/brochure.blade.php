@php
    $rp = fn ($n) => 'Rp' . number_format((float) $n, 0, ',', '.');
    $pageNo = $includeCover ? 1 : 0;
    $totalPages = $pages->count() + ($includeCover ? 2 : 0);
@endphp
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>{{ $title }} — Srawung</title>
<style>
    @font-face { font-family: 'Grotesk'; font-weight: bold; font-style: normal; src: url('{{ $fonts['display'] }}') format('truetype'); }
    @font-face { font-family: 'Grotesk'; font-weight: normal; font-style: normal; src: url('{{ $fonts['displayMedium'] }}') format('truetype'); }
    @font-face { font-family: 'Inter'; font-weight: normal; font-style: normal; src: url('{{ $fonts['body'] }}') format('truetype'); }
    @font-face { font-family: 'Inter'; font-weight: bold; font-style: normal; src: url('{{ $fonts['bodyBold'] }}') format('truetype'); }
    @font-face { font-family: 'InterSemi'; font-weight: normal; font-style: normal; src: url('{{ $fonts['bodySemi'] }}') format('truetype'); }

    @page { margin: 0; }
    * { margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; color: #1f2f2a; font-size: 8pt; line-height: 1.4; }
    table { border-collapse: collapse; }
    td { vertical-align: top; }
    .display { font-family: 'Grotesk', sans-serif; font-weight: bold; }
    .semi { font-family: 'InterSemi', sans-serif; }

    .page { position: relative; width: 210mm; height: 296.6mm; overflow: hidden; page-break-after: always; background: #fbfdfc; }
    .page.last { page-break-after: auto; }

    /* ---------- Sampul depan ---------- */
    .cover { background: #0f4c3f; color: #fff; }
    .blob { position: absolute; border-radius: 50%; }
    .b1 { width: 150mm; height: 150mm; right: -55mm; top: -45mm; background: #2fae7b; opacity: 0.22; }
    .b2 { width: 110mm; height: 110mm; left: -48mm; top: 120mm; background: #2fae7b; opacity: 0.12; }
    .b3 { width: 60mm; height: 60mm; right: 18mm; top: 108mm; border: 1.2mm solid #2fae7b; opacity: 0.35; }
    .cover-inner { position: absolute; top: 20mm; left: 18mm; right: 18mm; }
    .eyebrow { display: inline-block; margin-top: 16mm; padding: 1.6mm 3.6mm; border-radius: 3mm; background: #2fae7b; color: #0b3b31; font-family: 'InterSemi'; font-size: 7.5pt; letter-spacing: 1.6pt; }
    .cover-title { margin-top: 6mm; font-family: 'Grotesk'; font-weight: bold; font-size: 38pt; line-height: 1.04; letter-spacing: -0.8pt; color: #ffffff; }
    .cover-sub { margin-top: 5mm; width: 135mm; font-size: 11pt; line-height: 1.5; color: #cfe9dd; }
    .facts { margin-top: 7mm; }
    .facts td { padding-right: 2.5mm; }
    .fact { padding: 1.8mm 3.4mm; border-radius: 3mm; border: 0.3mm solid #4c8c79; color: #e3f4ec; font-size: 7.8pt; font-family: 'InterSemi'; }
    .hero { position: absolute; left: 18mm; right: 18mm; bottom: 36mm; }
    .hero td { padding-right: 5mm; vertical-align: bottom; }
    .hero-cover { width: 39mm; border: 1.2mm solid #ffffff; border-radius: 1.5mm; }
    .cover-foot { position: absolute; left: 0; right: 0; bottom: 0; height: 24mm; background: #0b3b31; }
    .cover-foot table { width: 174mm; margin: 0 18mm; }
    .cover-foot td { vertical-align: middle; height: 24mm; }
    .tagline { font-family: 'Grotesk'; font-weight: bold; font-size: 12pt; color: #ffffff; }
    .site { font-size: 8.5pt; color: #9fd6bf; }
    .promo-chip { display: inline-block; padding: 2mm 4mm; border-radius: 3mm; background: #2fae7b; color: #0b3b31; font-family: 'InterSemi'; font-size: 8.5pt; }

    /* ---------- Halaman isi ---------- */
    .head { position: absolute; top: 0; left: 0; right: 0; height: 24mm; }
    .head table { width: 182mm; margin: 0 14mm; }
    .head td { vertical-align: middle; height: 24mm; }
    .head-title { font-family: 'Grotesk'; font-weight: bold; font-size: 10.5pt; color: #0f4c3f; text-align: right; }
    .head-sub { font-size: 7pt; color: #6b7d77; text-align: right; }
    .rule { position: absolute; top: 24mm; left: 14mm; right: 14mm; height: 0.6mm; background: #2fae7b; }
    .foot { position: absolute; bottom: 0; left: 0; right: 0; height: 15mm; }
    .foot table { width: 182mm; margin: 0 14mm; }
    .foot td { vertical-align: middle; height: 15mm; font-size: 7pt; color: #7a8b85; }
    .foot b { color: #0f4c3f; }
    .body { position: absolute; top: 30mm; left: 14mm; width: 182mm; }

    .chip { display: inline-block; padding: 0.8mm 2.2mm; border-radius: 2mm; background: #e3f4ec; color: #17785a; font-family: 'InterSemi'; font-size: 6.2pt; letter-spacing: 0.6pt; text-transform: uppercase; }
    .author { margin-top: 1mm; font-size: 7.2pt; color: #6b7d77; }
    .old { font-size: 7.2pt; color: #94a3a0; text-decoration: line-through; }
    .price { font-family: 'Grotesk'; font-weight: bold; color: #0f4c3f; }
    .off { display: inline-block; padding: 0.6mm 1.8mm; border-radius: 1.6mm; background: #fde7e4; color: #c2410c; font-family: 'InterSemi'; font-size: 6.6pt; }
    .scan { font-size: 6.2pt; color: #6b7d77; text-align: center; line-height: 1.25; }
    .card.cta, .spot.cta { background: #0f4c3f; border: 0; }
    .nocover { background: #0f4c3f; color: #fff; font-family: 'Grotesk'; font-weight: bold; text-align: center; }

    /* Katalog: 2 kolom × 3 baris */
    .card { height: 77mm; overflow: hidden; border-radius: 3mm; border: 0.3mm solid #dbe9e2; background: #ffffff; }
    .card-in { padding: 4mm; }
    .k-cover { width: 30mm; border-radius: 1mm; border: 0.3mm solid #e2e8e5; }
    .k-title { margin-top: 1.6mm; font-family: 'Grotesk'; font-weight: bold; font-size: 10.5pt; line-height: 1.18; color: #0f172a; }
    .k-syn { margin-top: 1.6mm; font-size: 7pt; line-height: 1.45; color: #3e504a; }
    .k-bottom { position: absolute; left: 4mm; right: 4mm; bottom: 3.5mm; }
    .k-bottom td { vertical-align: bottom; }

    /* Sorotan: 2 buku per halaman */
    .spot { height: 123mm; overflow: hidden; border-radius: 4mm; }
    .spot.alt { background: #ffffff; border: 0.3mm solid #dbe9e2; }
    .spot.main { background: #eef7f2; }
    .s-cover { width: 62mm; border-radius: 1.5mm; border: 0.3mm solid #d5e3dc; }
    .s-title { margin-top: 2.5mm; font-family: 'Grotesk'; font-weight: bold; font-size: 17pt; line-height: 1.12; color: #0f172a; letter-spacing: -0.2pt; }
    .s-syn { margin-top: 3mm; font-size: 8.4pt; line-height: 1.55; color: #3e504a; }
    .s-meta { margin-top: 3mm; font-size: 7.5pt; color: #5b6b66; }

    /* ---------- Sampul belakang ---------- */
    .back { background: #0f4c3f; color: #fff; }
    .back-inner { position: absolute; top: 22mm; left: 18mm; right: 18mm; }
    .back-title { margin-top: 12mm; font-family: 'Grotesk'; font-weight: bold; font-size: 28pt; line-height: 1.1; }
    .steps { margin-top: 8mm; width: 174mm; }
    .steps td { width: 33.3%; padding-right: 4mm; }
    .step { height: 42mm; border-radius: 3mm; background: #0b3b31; padding: 5mm; }
    .step-no { font-family: 'Grotesk'; font-weight: bold; font-size: 20pt; color: #2fae7b; }
    .step-t { margin-top: 2mm; font-family: 'InterSemi'; font-size: 9.5pt; color: #fff; }
    .step-d { margin-top: 1.5mm; font-size: 7.8pt; line-height: 1.45; color: #b8dccd; }
    .promo { margin-top: 9mm; border: 0.6mm dashed #2fae7b; border-radius: 4mm; padding: 6mm; background: #0b3b31; }
    .promo-code { font-family: 'Grotesk'; font-weight: bold; font-size: 26pt; letter-spacing: 2pt; color: #ffffff; }
    .qr-row { margin-top: 9mm; width: 174mm; }
    .qr-box { background: #ffffff; border-radius: 3mm; padding: 3mm; width: 30mm; }
    .qr-label { padding-left: 4mm; vertical-align: middle; }
</style>
</head>
<body>

{{-- ================= SAMPUL DEPAN ================= --}}
@if ($includeCover)
<div class="page cover">
    <div class="blob b1"></div>
    <div class="blob b2"></div>
    <div class="blob b3"></div>

    <div class="cover-inner">
        @if ($logoWhite)<img src="{{ $logoWhite }}" style="height: 12mm;">@endif
        <div><span class="eyebrow">KATALOG BUKU DIGITAL &middot; {{ strtoupper($edition) }}</span></div>
        <div class="cover-title">{{ $title }}</div>
        <div class="cover-sub">{{ $subtitle }}</div>
        <table class="facts"><tr>
            <td><span class="fact">{{ $count }} judul pilihan</span></td>
            <td><span class="fact">Akses selamanya</span></td>
            <td><span class="fact">Baca di HP &amp; laptop</span></td>
        </tr></table>
    </div>

    @if ($heroCovers->isNotEmpty())
    <div class="hero">
        <table><tr>
            @foreach ($heroCovers as $i => $img)
                <td style="padding-bottom: {{ [0, 9, 3, 12][$i] ?? 0 }}mm;"><img class="hero-cover" src="{{ $img }}"></td>
            @endforeach
        </tr></table>
    </div>
    @endif

    <div class="cover-foot">
        <table><tr>
            <td>
                <div class="tagline">Sinau Bareng, Berkarya Bareng</div>
                <div class="site">{{ $siteHost }}</div>
            </td>
            <td style="text-align: right;">
                @if ($promoCode)
                    <span class="promo-chip">Kode promo: {{ $promoCode }}</span>
                @endif
            </td>
        </tr></table>
    </div>
</div>
@endif

{{-- ================= HALAMAN ISI ================= --}}
@foreach ($pages as $p => $chunk)
@php $pageNo++; $isLast = !$includeCover && $loop->last; @endphp
<div class="page {{ $isLast ? 'last' : '' }}">
    <div class="head">
        <table><tr>
            <td>@if ($logoDark)<img src="{{ $logoDark }}" style="height: 7.5mm;">@endif</td>
            <td>
                <div class="head-title">{{ $title }}</div>
                <div class="head-sub">Edisi {{ $edition }} &middot; pindai QR untuk lihat &amp; beli</div>
            </td>
        </tr></table>
    </div>
    <div class="rule"></div>

    <div class="body">
    @if ($layout === 'katalog')
        <table style="width: 182mm;">
        @foreach ($chunk->chunk(2) as $row)
            <tr>
            @foreach ($row as $b)
                <td style="width: 88mm; padding: 0 {{ $loop->first ? '6mm' : '0' }} 5mm 0;">
                    <div class="card" style="position: relative;">
                        <div class="card-in">
                            <table style="width: 100%;"><tr>
                                <td style="width: 32mm;">
                                    @if ($b['cover'])
                                        <img class="k-cover" src="{{ $b['cover'] }}">
                                    @else
                                        <div class="nocover" style="width: 30mm; height: 42mm; padding-top: 16mm; font-size: 9pt;">Srawung</div>
                                    @endif
                                </td>
                                <td>
                                    {{-- Tinggi tetap: teks panjang terpotong rapi, tidak menabrak harga & QR. --}}
                                    <div style="height: 50mm; overflow: hidden;">
                                        @if ($b['category'])<span class="chip">{{ $b['category'] }}</span>@endif
                                        <div class="k-title">{{ $b['title'] }}</div>
                                        @if ($b['author'])<div class="author">{{ $b['author'] }}</div>@endif
                                        <div class="k-syn">{{ $b['synopsis'] }}</div>
                                    </div>
                                </td>
                            </tr></table>
                        </div>
                        <div class="k-bottom">
                            <table style="width: 100%;"><tr>
                                <td>
                                    @if ($showPrices)
                                        @if ($b['discount'] > 0)
                                            <span class="old">{{ $rp($b['price']) }}</span> <span class="off">-{{ $b['discount'] }}%</span><br>
                                        @endif
                                        <span class="price" style="font-size: 13pt;">{{ $rp($b['effective']) }}</span>
                                    @else
                                        <span class="semi" style="color: #0f4c3f; font-size: 8pt;">Baca pratinjau gratis</span>
                                    @endif
                                    <div class="author" style="margin-top: 0.6mm;">{{ $b['pages'] ? $b['pages'] . ' halaman' : 'Buku digital' }}@if ($b['rating']) &middot; rating {{ $b['rating'] }}@endif</div>
                                </td>
                                <td style="width: 18mm; text-align: center;">
                                    <img src="{{ $b['qr'] }}" style="width: 16mm; height: 16mm;">
                                    <div class="scan">Pindai</div>
                                </td>
                            </tr></table>
                        </div>
                    </div>
                </td>
            @endforeach
            @if ($row->count() === 1)
                <td style="width: 88mm; padding-bottom: 5mm;">
                    <div class="card cta">
                        <div style="padding: 7mm;">
                            <div class="eyebrow" style="margin-top: 0; font-size: 6.5pt;">KATALOG LENGKAP</div>
                            <div class="display" style="margin-top: 4mm; font-size: 15pt; line-height: 1.15; color: #fff;">Masih banyak buku lain untuk Anda</div>
                            <div style="margin-top: 2.5mm; font-size: 7.8pt; color: #b8dccd;">Pindai untuk melihat semua judul di {{ $siteHost }}@if ($promoCode), lalu pakai kode <b style="color: #fff;">{{ $promoCode }}</b>@endif.</div>
                            <div style="margin-top: 4mm;"><span class="qr-box" style="display: inline-block; width: auto; padding: 2mm;"><img src="{{ $catalogQr }}" style="width: 22mm; height: 22mm;"></span></div>
                        </div>
                    </div>
                </td>
            @endif
            </tr>
        @endforeach
        </table>
    @else
        @foreach ($chunk as $i => $b)
            @php $flip = $i % 2 === 1; @endphp
            <div class="spot {{ $flip ? 'alt' : 'main' }}" style="{{ $loop->last ? '' : 'margin-bottom: 5mm;' }}">
                <table style="width: 182mm;"><tr>
                    @if (!$flip)
                        <td style="width: 74mm; padding: 8mm 0 0 8mm;">
                            @if ($b['cover'])<img class="s-cover" src="{{ $b['cover'] }}">@else<div class="nocover" style="width: 62mm; height: 88mm; padding-top: 38mm; font-size: 14pt;">Srawung</div>@endif
                        </td>
                    @endif
                    <td style="padding: 9mm {{ $flip ? '4mm' : '9mm' }} 0 {{ $flip ? '9mm' : '4mm' }};">
                        @if ($b['category'])<span class="chip">{{ $b['category'] }}</span>@endif
                        <div class="s-title">{{ $b['title'] }}</div>
                        @if ($b['author'])<div class="author" style="font-size: 8.4pt;">oleh {{ $b['author'] }}</div>@endif
                        <div class="s-syn">{{ $b['synopsis'] }}</div>
                        <div class="s-meta">{{ $b['pages'] ? $b['pages'] . ' halaman' : 'Buku digital' }} &middot; akses selamanya @if ($b['rating']) &middot; rating {{ $b['rating'] }} dari 5 @endif</div>
                        <table style="width: 100%; margin-top: 5mm;"><tr>
                            <td style="vertical-align: middle;">
                                @if ($showPrices)
                                    @if ($b['discount'] > 0)
                                        <span class="old" style="font-size: 8.5pt;">{{ $rp($b['price']) }}</span> <span class="off">Hemat {{ $b['discount'] }}%</span><br>
                                    @endif
                                    <span class="price" style="font-size: 20pt;">{{ $rp($b['effective']) }}</span>
                                @else
                                    <span class="semi" style="color: #0f4c3f; font-size: 10pt;">Baca pratinjau gratis</span>
                                @endif
                            </td>
                            <td style="width: 26mm; text-align: center; vertical-align: middle;">
                                <img src="{{ $b['qr'] }}" style="width: 24mm; height: 24mm;">
                                <div class="scan">Pindai untuk<br>lihat &amp; beli</div>
                            </td>
                        </tr></table>
                    </td>
                    @if ($flip)
                        <td style="width: 74mm; padding: 8mm 8mm 0 0; text-align: right;">
                            @if ($b['cover'])<img class="s-cover" src="{{ $b['cover'] }}">@else<div class="nocover" style="width: 62mm; height: 88mm; padding-top: 38mm; font-size: 14pt;">Srawung</div>@endif
                        </td>
                    @endif
                </tr></table>
            </div>
        @endforeach
        @if ($chunk->count() === 1)
            <div class="spot cta" style="margin-top: 5mm;">
                <table style="width: 182mm;"><tr>
                    <td style="padding: 14mm 6mm 0 12mm;">
                        <div class="eyebrow" style="margin-top: 0;">KATALOG LENGKAP</div>
                        <div class="display" style="margin-top: 6mm; font-size: 24pt; line-height: 1.1; color: #fff;">Masih banyak buku lain<br>untuk Anda</div>
                        <div style="margin-top: 4mm; font-size: 10pt; line-height: 1.5; color: #b8dccd;">Pindai QR untuk melihat semua judul di {{ $siteHost }}.@if ($promoCode) Pakai kode <b style="color: #fff;">{{ $promoCode }}</b> saat membayar.@endif</div>
                    </td>
                    <td style="width: 60mm; padding-top: 22mm; text-align: center;">
                        <span class="qr-box" style="display: inline-block; width: auto; padding: 3mm;"><img src="{{ $catalogQr }}" style="width: 40mm; height: 40mm;"></span>
                    </td>
                </tr></table>
            </div>
        @endif
    @endif
    </div>

    <div class="foot">
        <table><tr>
            <td><b>{{ $siteHost }}</b> &middot; Sinau Bareng, Berkarya Bareng</td>
            <td style="text-align: right;">{{ $pageNo }} / {{ $totalPages }}</td>
        </tr></table>
    </div>
</div>
@endforeach

{{-- ================= SAMPUL BELAKANG ================= --}}
@if ($includeCover)
<div class="page back last">
    <div class="blob b1" style="top: auto; bottom: -70mm;"></div>
    <div class="back-inner">
        @if ($logoWhite)<img src="{{ $logoWhite }}" style="height: 11mm;">@endif
        <div class="back-title">Cara membeli<br>di Srawung</div>

        <table class="steps"><tr>
            <td><div class="step">
                <div class="step-no">01</div>
                <div class="step-t">Pindai &amp; pilih buku</div>
                <div class="step-d">Pindai QR di setiap buku atau buka {{ $siteHost }}. Baca beberapa halaman pertama gratis.</div>
            </div></td>
            <td><div class="step">
                <div class="step-no">02</div>
                <div class="step-t">Bayar dengan QRIS</div>
                <div class="step-d">Masuk dengan Google atau email, lalu bayar lewat aplikasi bank atau e-wallet apa pun.</div>
            </div></td>
            <td style="padding-right: 0;"><div class="step">
                <div class="step-no">03</div>
                <div class="step-t">Langsung baca</div>
                <div class="step-d">Buku masuk ke Perpustakaan Anda. Baca kapan saja di HP, tablet, atau laptop, selamanya.</div>
            </div></td>
        </tr></table>

        @if ($promoCode)
        <div class="promo">
            <table style="width: 100%;"><tr>
                <td style="vertical-align: middle;">
                    <div style="font-family: 'InterSemi'; font-size: 8pt; letter-spacing: 1.4pt; color: #9fd6bf;">KODE PROMO KHUSUS BROSUR</div>
                    <div class="promo-code">{{ $promoCode }}</div>
                    @if ($promoNote)<div style="margin-top: 1.5mm; font-size: 9pt; color: #d6eee3;">{{ $promoNote }}</div>@endif
                </td>
                <td style="width: 52mm; vertical-align: middle; font-size: 8pt; color: #b8dccd;">Masukkan kode ini di halaman keranjang sebelum membayar.</td>
            </tr></table>
        </div>
        @endif

        <table class="qr-row"><tr>
            <td style="width: 87mm;">
                <table><tr>
                    <td><div class="qr-box"><img src="{{ $catalogQr }}" style="width: 30mm; height: 30mm;"></div></td>
                    <td class="qr-label">
                        <div class="display" style="font-size: 12pt;">Lihat semua buku</div>
                        <div style="margin-top: 1mm; font-size: 8pt; color: #b8dccd;">{{ $siteHost }}/buku</div>
                    </td>
                </tr></table>
            </td>
            <td>
                @if ($whatsapp)
                <table><tr>
                    <td><div class="qr-box"><img src="{{ $whatsappQr }}" style="width: 30mm; height: 30mm;"></div></td>
                    <td class="qr-label">
                        <div class="display" style="font-size: 12pt;">Tanya lewat WhatsApp</div>
                        <div style="margin-top: 1mm; font-size: 8pt; color: #b8dccd;">+{{ $whatsapp }}</div>
                    </td>
                </tr></table>
                @endif
            </td>
        </tr></table>
    </div>

    <div class="cover-foot">
        <table><tr>
            <td>
                <div class="tagline">Sinau Bareng, Berkarya Bareng</div>
                <div class="site">Buku digital dari para penulis &amp; kreator Indonesia</div>
            </td>
            <td style="text-align: right;" class="site">{{ $siteHost }}</td>
        </tr></table>
    </div>
</div>
@endif

</body>
</html>
