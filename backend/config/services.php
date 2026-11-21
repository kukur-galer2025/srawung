<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Path ke pdftoppm (Poppler) atau gs (Ghostscript). Kosongkan untuk deteksi otomatis.
    'pdf' => [
        'converter_path' => env('PDF_CONVERTER_PATH'),
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI'),
    ],

    // Asisten Srawung (chatbot buku & panduan sistem) — penyedia AI gratis berformat OpenAI-compatible.
    // Dicoba berurutan (Groq paling cepat, Gemini cadangan); penyedia tanpa API key dilewati. Bila semua gagal/kuota habis,
    // asisten beralih ke mode dasar (pencarian katalog tanpa AI).
    'assistant' => [
        'daily_limit' => (int) env('ASSISTANT_DAILY_LIMIT', 1000),
        'providers' => [
            [
                'name' => 'groq',
                'url' => env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),
                'key' => env('GROQ_API_KEY'),
                'model' => env('GROQ_MODEL', 'openai/gpt-oss-120b'),
                'reasoning_effort' => env('GROQ_REASONING_EFFORT', 'low'),
            ],
            [
                'name' => 'gemini',
                'url' => env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai'),
                'key' => env('GEMINI_API_KEY'),
                'model' => env('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
                'reasoning_effort' => env('GEMINI_REASONING_EFFORT', 'low'),
            ],
        ],
    ],

];
