@props(['url'])
<tr>
<td class="header">
<a href="{{ config('app.frontend_url') }}" style="display: inline-block;">
{{-- Logo PNG (bukan WebP: Outlook & beberapa aplikasi email tidak mendukungnya). Bila gambar diblokir, alt-nya tetap terbaca. --}}
<img src="{{ config('app.frontend_url') }}/brand/srawung-logo-email.png" alt="SRAWUNG" width="158" height="38" style="display: block; margin: 0 auto; height: 38px; width: auto; border: 0; font-size: 22px; font-weight: bold; color: #0f4c3f; letter-spacing: 2px;">
<span class="brand-tagline">Sinau Bareng, Berkarya Bareng</span>
</a>
</td>
</tr>
