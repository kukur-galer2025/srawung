<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\CreatorProfile;

/** Halaman publik kreator: profil + buku-bukunya yang sedang dijual. */
class CreatorPublicController extends Controller
{
    public function show(string $slug)
    {
        $profile = CreatorProfile::with('user:id,role,is_blocked')->where('slug', $slug)->firstOrFail();
        abort_if(!$profile->user || $profile->user->is_blocked, 404);

        $books = Book::with('category:id,name,slug')
            ->where('creator_id', $profile->user_id)
            ->where('status', 'published')
            ->latest()
            ->get()
            ->each->makeHidden(['source_file_path', 'processing_status', 'processing_error', 'synopsis']);

        return response()->json([
            'display_name' => $profile->display_name,
            'slug' => $profile->slug,
            'bio' => $profile->bio,
            'books_count' => $books->count(),
            'books' => $books->values(),
        ]);
    }
}
