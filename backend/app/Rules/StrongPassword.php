<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/** Minimal 8 karakter (maks. 72, batas bcrypt), ada huruf & angka, bukan sandi umum / email sendiri. */
class StrongPassword implements ValidationRule
{
    private const COMMON = [
        'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd', 'qwerty123', 'qwerty12', 'qwertyuiop',
        '12345678', '123456789', '1234567890', '11111111', '00000000', 'abc12345', 'abcd1234', 'a1234567', 'admin123', 'admin1234', 'administrator',
        'iloveyou1', 'sayang123', 'indonesia1', 'indonesia123', 'bismillah1', 'bismillah123', 'rahasia123', 'rahasia1', 'srawung123', 'amania123',
        'welcome1', 'welcome123', 'letmein1', 'monkey123', 'dragon123', 'football1', 'doraemon1', 'doraemon123', 'katasandi1', 'katasandi123',
    ];

    public function __construct(private ?string $email = null) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $value = is_string($value) ? $value : '';
        $lower = mb_strtolower($value);

        if (mb_strlen($value) < 8) {
            $fail('Kata sandi minimal 8 karakter.');
        } elseif (strlen($value) > 72) {
            $fail('Kata sandi maksimal 72 karakter.');
        } elseif (!preg_match('/\p{L}/u', $value) || !preg_match('/\d/', $value)) {
            $fail('Kata sandi harus memuat huruf dan angka.');
        } elseif (in_array($lower, self::COMMON, true)) {
            $fail('Kata sandi ini terlalu umum dan mudah ditebak. Gunakan kata sandi lain.');
        } elseif ($this->email && str_contains($lower, mb_strtolower(strtok($this->email, '@') ?: '#')) && mb_strlen((string) strtok($this->email, '@')) >= 4) {
            $fail('Kata sandi tidak boleh memuat nama email Anda.');
        }
    }
}
