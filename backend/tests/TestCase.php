<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Storage;

abstract class TestCase extends BaseTestCase
{
    /**
     * Semua tes memakai disk palsu (storage/framework/testing/disks/…), dipasang SEBELUM
     * database tes diisi seeder. Tanpa ini, tes yang menghapus buku dengan ID tertentu
     * ikut menghapus folder books/{id} milik toko yang sebenarnya — itulah penyebab file
     * buku "PHP dari Pemula sampai Mahir" sempat hilang.
     */
    public function createApplication()
    {
        $app = parent::createApplication();

        Storage::fake('local');
        Storage::fake('public');

        return $app;
    }
}
