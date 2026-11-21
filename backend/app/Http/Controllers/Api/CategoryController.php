<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function index()
    {
        $categories = Category::withCount(['books' => function ($q) {
            $q->where('status', 'published');
        }])->get();

        return response()->json($categories);
    }
}
