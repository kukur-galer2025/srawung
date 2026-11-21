<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Bundle;

class BundleController extends Controller
{
    public function index()
    {
        $bundles = Bundle::available()
            ->with('books')
            ->orderBy('sort')
            ->latest()
            ->get()
            ->map->toStorefront()
            ->filter(fn ($b) => $b['book_count'] > 0)
            ->values();

        return response()->json($bundles);
    }

    public function show(string $slug)
    {
        $bundle = Bundle::available()->with('books')->where('slug', $slug)->firstOrFail();

        return response()->json($bundle->toStorefront());
    }
}
