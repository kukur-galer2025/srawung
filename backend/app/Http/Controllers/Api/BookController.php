<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\UserLibrary;
use App\Services\CatalogSearch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BookController extends Controller
{
    public function index(Request $request, CatalogSearch $catalog)
    {
        $query = Book::with('category')->where('status', 'published');

        if ($request->filled('category')) {
            $query->whereHas('category', function ($q) use ($request) {
                $q->where('slug', $request->category);
            });
        }

        // Pencarian: diperingkat relevansinya (BM25F + koreksi salah ketik) oleh CatalogSearch.
        $search = $request->filled('search') ? trim((string) $request->search) : '';
        $ranked = null;
        if ($search !== '') {
            $ranked = $catalog->search($search);
            if ($ranked === null) {
                // Kueri tanpa kata bermakna (mis. hanya "cara") → pencocokan teks biasa.
                $query->where(function ($q) use ($search) {
                    $q->where('title', 'like', "%{$search}%")
                        ->orWhere('author', 'like', "%{$search}%")
                        ->orWhere('synopsis', 'like', "%{$search}%");
                });
            } else {
                $query->whereIn('books.id', array_keys($ranked['scores']) ?: [0]);
            }
        }

        // Filter & urutan harga memakai harga efektif (harga promo bila sedang berlaku).
        [$priceSql, $priceBindings] = Book::effectivePriceSql();

        if ($request->filled('price_min')) {
            $query->whereRaw("{$priceSql} >= ?", [...$priceBindings, (int) $request->price_min]);
        }

        if ($request->filled('price_max')) {
            $query->whereRaw("{$priceSql} <= ?", [...$priceBindings, (int) $request->price_max]);
        }

        // Dipakai keranjang untuk mengambil harga terkini buku-buku tertentu.
        if ($request->filled('ids')) {
            $ids = array_slice(array_filter(array_map('intval', explode(',', (string) $request->ids))), 0, 48);
            $query->whereIn('id', $ids ?: [0]);
        }

        if ($request->boolean('on_sale')) {
            $query->onSale();
        }

        $sort = $request->query('sort');
        $byRelevance = $ranked && $ranked['scores'] && in_array($sort, [null, '', 'relevan'], true);
        if ($byRelevance) {
            // Urutan relevansi dari CatalogSearch (id berupa integer dari indeks → aman disisipkan).
            $ids = array_map('intval', array_keys($ranked['scores']));
            $cases = implode(' ', array_map(fn ($id, $i) => "WHEN {$id} THEN {$i}", $ids, array_keys($ids)));
            $query->orderByRaw("CASE books.id {$cases} END");
        }

        switch ($byRelevance ? 'relevan' : $sort) {
            case 'relevan':
                if (!$byRelevance) {
                    $query->latest();
                }
                break;
            case 'termurah':
                $query->orderByRaw("{$priceSql} asc", $priceBindings);
                break;
            case 'termahal':
                $query->orderByRaw("{$priceSql} desc", $priceBindings);
                break;
            case 'diskon':
                $query->orderByRaw("CASE WHEN books.sale_price IS NULL THEN 0 ELSE (books.price - books.sale_price) * 1.0 / books.price END desc");
                break;
            case 'terlaris':
                $query->withCount('orderItems')->orderBy('order_items_count', 'desc');
                break;
            case 'terbaru':
            default:
                $query->latest();
                break;
        }

        $perPage = min(max((int) $request->query('per_page', 12), 1), 48);
        $books = $query->paginate($perPage)->withQueryString();
        // Detail internal pemrosesan file tidak perlu diketahui publik.
        $books->getCollection()->each->makeHidden(['source_file_path', 'processing_status', 'processing_error']);

        $payload = $books->toArray();
        if ($search !== '') {
            $payload['search'] = ['query' => $search, 'corrected' => $ranked['corrected'] ?? null];
            // Catat untuk laporan admin (sekali per kueri, bukan untuk tiap halaman/permintaan keranjang).
            if ($books->currentPage() === 1 && !$request->filled('ids')) {
                $visitor = $request->user('sanctum')?->id ?? $request->ip();
                $catalog->log($search, $books->total(), (string) $visitor);
            }
        }

        return response()->json($payload);
    }

    public function show(Request $request, $slug)
    {
        $book = Book::with(['category'])->where('slug', $slug)->where('status', 'published')->firstOrFail();

        // Ambil preview pages (terbatas hingga preview_pages)
        $previewPagesLimit = $book->preview_pages ?: 5;
        $previewPages = $book->pages()
            ->where('page_number', '<=', $previewPagesLimit)
            ->orderBy('page_number', 'asc')
            ->get(['id', 'book_id', 'page_number', 'image_path']);

        $isOwned = false;
        $user = Auth::guard('sanctum')->user() ?: $request->user();
        if ($user) {
            $isOwned = UserLibrary::where('user_id', $user->id)
                ->where('book_id', $book->id)
                ->where('access_status', 'active')
                ->exists();
        }

        return response()->json([
            'id' => $book->id,
            'title' => $book->title,
            'slug' => $book->slug,
            'author' => $book->author,
            // Kreator penerbit (null = terbitan Srawung).
            'creator' => $book->creator_id && ($profile = \App\Models\CreatorProfile::where('user_id', $book->creator_id)->first())
                ? ['display_name' => $profile->display_name, 'slug' => $profile->slug]
                : null,
            'synopsis' => $book->synopsis,
            'price' => $book->price,
            'sale_price' => $book->saleActive() ? $book->sale_price : null,
            'sale_ends_at' => $book->saleActive() ? $book->sale_ends_at : null,
            'effective_price' => $book->effective_price,
            'is_on_sale' => $book->is_on_sale,
            'discount_percent' => $book->discount_percent,
            'formatted_price' => $book->formatted_price,
            'cover_path' => $book->cover_path,
            'cover_url' => $book->cover_url,
            'cover_srcset' => $book->cover_srcset,
            'cover_placeholder' => $book->cover_placeholder,
            'category_id' => $book->category_id,
            'category' => $book->category,
            'total_pages' => $book->total_pages,
            'rating_avg' => (float) $book->rating_avg,
            'rating_count' => (int) $book->rating_count,
            'has_toc' => !empty($book->toc),
            // Paket hemat yang memuat buku ini (cross-sell di halaman buku).
            'bundles' => $book->bundles()->available()->with('books')->get()->map->toStorefront()
                ->map(fn ($b) => collect($b)->only(['id', 'title', 'slug', 'price', 'individual_total', 'savings_percent', 'book_count'])->all())->values(),
            'preview_pages_count' => $book->preview_pages,
            'preview_pages' => $previewPages,
            // URL statis gambar "Intip isi buku" (thumbnail & penuh) — tampil jauh lebih cepat daripada lewat API.
            'preview_images' => rescue(fn () => app(\App\Services\PreviewImages::class)->urls($book), [], report: true),
            'status' => $book->status,
            'is_owned' => $isOwned,
            'created_at' => $book->created_at,
            'updated_at' => $book->updated_at,
        ]);
    }
}
