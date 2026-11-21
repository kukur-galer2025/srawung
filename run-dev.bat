@echo off
title Amania.com - Local Development Launcher

REM Backend butuh PHP >= 8.4. Paksa pakai PHP 8.4 Laragon (php di PATH = 8.3).
set "PHP84=D:\laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64"
if exist "%PHP84%\php.exe" set "PATH=%PHP84%;%PATH%"

echo ===================================================
echo   Memulai Server Amania.com (Backend + Queue + Scheduler + Frontend)
echo ===================================================
php -v | findstr /b "PHP"
echo.
echo [1/4] Menjalankan Laravel Backend (http://localhost:8000)...
start "Amania Backend API (Laravel)" cmd /k "cd /d %~dp0backend && php artisan serve"

echo [2/4] Menjalankan Queue Worker (email + proses halaman buku)...
start "Amania Queue Worker" cmd /k "cd /d %~dp0backend && php artisan queue:work --tries=3 --timeout=120"

echo [3/4] Menjalankan Scheduler (kedaluwarsa pesanan otomatis)...
start "Amania Scheduler" cmd /k "cd /d %~dp0backend && php artisan schedule:work"

echo [4/4] Menjalankan Next.js Frontend (http://localhost:3000)...
start "Amania Frontend (Next.js)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ===================================================
echo   Semua server sudah aktif!
echo   Buka browser di: http://localhost:3000
echo   PENTING: jendela "Queue Worker" dan "Scheduler" harus
echo   tetap terbuka (email, konversi PDF, kedaluwarsa pesanan).
echo ===================================================
timeout /t 5
