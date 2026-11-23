<?php

use Illuminate\Support\Facades\Route;

// Backend hanya API: alamat utamanya mengarah ke toko (tidak menampilkan halaman bawaan Laravel).
Route::get('/', fn () => redirect()->away(config('app.frontend_url')));
