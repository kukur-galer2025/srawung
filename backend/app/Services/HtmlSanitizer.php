<?php

namespace App\Services;

use HTMLPurifier;
use HTMLPurifier_Config;

/**
 * Membersihkan HTML dari editor artikel: hanya tag & atribut tipografi yang diizinkan.
 * Skrip, style, event handler (onclick, dsb.), iframe, dan skema URL berbahaya dibuang.
 */
class HtmlSanitizer
{
    private static ?HTMLPurifier $purifier = null;

    public static function clean(string $html): string
    {
        $clean = self::purifier()->purify($html);

        // Gambar dimuat malas agar artikel panjang tetap ringan.
        return str_replace('<img ', '<img loading="lazy" decoding="async" ', $clean);
    }

    private static function purifier(): HTMLPurifier
    {
        if (self::$purifier) {
            return self::$purifier;
        }

        $cacheDir = storage_path('framework/cache/htmlpurifier');
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0755, true);
        }

        $config = HTMLPurifier_Config::createDefault();
        $config->set('Cache.SerializerPath', $cacheDir);
        $config->set('HTML.Doctype', 'HTML 4.01 Transitional');
        $config->set('HTML.Allowed', implode(',', [
            'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote', 'hr',
            'h2', 'h3', 'h4', 'ul', 'ol', 'li',
            'a[href|title|target|rel]',
            'img[src|alt|title|width|height]',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
        ]));
        $config->set('URI.AllowedSchemes', ['http' => true, 'https' => true, 'mailto' => true]);
        $config->set('Attr.AllowedFrameTargets', ['_blank']);
        $config->set('HTML.TargetNoopener', true);
        $config->set('HTML.TargetNoreferrer', true);
        $config->set('AutoFormat.RemoveEmpty', true);
        $config->set('AutoFormat.RemoveEmpty.RemoveNbsp', true);

        return self::$purifier = new HTMLPurifier($config);
    }
}
