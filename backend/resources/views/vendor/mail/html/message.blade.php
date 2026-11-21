<x-mail::layout>
{{-- Header --}}
<x-slot:header>
<x-mail::header :url="config('app.frontend_url')">
{{ config('app.name') }}
</x-mail::header>
</x-slot:header>

{{-- Body --}}
{!! $slot !!}

{{-- Subcopy --}}
@isset($subcopy)
<x-slot:subcopy>
<x-mail::subcopy>
{!! $subcopy !!}
</x-mail::subcopy>
</x-slot:subcopy>
@endisset

{{-- Footer --}}
<x-slot:footer>
<x-mail::footer>
Email ini dikirim otomatis oleh {{ config('app.name') }} karena ada aktivitas pada akun Anda. Mohon tidak membalas email ini.<br>
Butuh bantuan? Kunjungi [{{ parse_url(config('app.frontend_url'), PHP_URL_HOST) }}]({{ config('app.frontend_url') }}).

© {{ date('Y') }} {{ config('app.name') }} — Sinau Bareng, Berkarya Bareng.
</x-mail::footer>
</x-slot:footer>
</x-mail::layout>
