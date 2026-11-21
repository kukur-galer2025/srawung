<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserLibrary;
use Illuminate\Http\Request;

class LibraryController extends Controller
{
    public function index(Request $request)
    {
        $library = UserLibrary::with(['book:id,title,slug,author,cover_path,total_pages,preview_pages'])
            ->where('user_id', $request->user()->id)
            ->where('access_status', 'active')
            ->latest('updated_at')
            ->get();

        return response()->json($library);
    }
}
