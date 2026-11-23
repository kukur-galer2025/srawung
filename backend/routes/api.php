<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\LibraryController;
use App\Http\Controllers\Api\ReaderController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\PostController;
use App\Http\Controllers\Api\StorefrontController;
use App\Http\Controllers\Api\RecommendationController;
use App\Http\Controllers\Api\ReaderToolsController;
use App\Http\Controllers\Api\ReviewController;
use App\Http\Controllers\Api\WishlistController;
use App\Http\Controllers\Api\BundleController;
use App\Http\Controllers\Api\CartController;
use App\Http\Controllers\Api\NewsletterController;
use App\Http\Controllers\Api\Admin\BundleController as AdminBundleController;
use App\Http\Controllers\Api\Admin\NewsletterController as AdminNewsletterController;
use App\Http\Controllers\Api\Admin\ReviewController as AdminReviewController;
use App\Http\Controllers\Api\Admin\BannerController as AdminBannerController;
use App\Http\Controllers\Api\Admin\PostController as AdminPostController;
use App\Http\Controllers\Api\Admin\BookController as AdminBookController;
use App\Http\Controllers\Api\Admin\CategoryController as AdminCategoryController;
use App\Http\Controllers\Api\Admin\CouponController as AdminCouponController;
use App\Http\Controllers\Api\Admin\OrderController as AdminOrderController;
use App\Http\Controllers\Api\Admin\UserController as AdminUserController;
use App\Http\Controllers\Api\Admin\DashboardController as AdminDashboardController;
use App\Http\Controllers\Api\Admin\ReportController as AdminReportController;
use App\Http\Controllers\Api\Admin\SettingController as AdminSettingController;
use App\Http\Controllers\Api\Admin\SystemController as AdminSystemController;

// Public
// Laporan error dari frontend (bila Sentry belum dipasang).
Route::post('/client-errors', [\App\Http\Controllers\Api\ClientErrorController::class, 'store'])->middleware('throttle:20,1,post-client-errors');
// Untuk monitor uptime luar: 200 = sehat, 503 = database/scheduler/queue bermasalah.
Route::get('/health', [AdminSystemController::class, 'health'])->middleware('throttle:30,1,get-health');
Route::get('/books', [BookController::class, 'index'])->middleware('throttle:public-read');
Route::get('/books/{slug}', [BookController::class, 'show'])->middleware('throttle:public-read');
Route::get('/categories', [CategoryController::class, 'index'])->middleware('throttle:public-read');
Route::get('/banners', [StorefrontController::class, 'banners'])->middleware('throttle:public-read');
Route::get('/recommendations', [RecommendationController::class, 'forYou'])->middleware('throttle:public-read');
Route::get('/trending', [RecommendationController::class, 'trending'])->middleware('throttle:public-read');
Route::get('/books/{slug}/similar', [RecommendationController::class, 'similar'])->middleware('throttle:public-read');
Route::get('/books/{slug}/next', [\App\Http\Controllers\Api\DiscoveryController::class, 'next'])->middleware('throttle:public-read');
// Cari kata/topik di dalam isi semua buku (BM25).
Route::get('/search/inside', [\App\Http\Controllers\Api\DiscoveryController::class, 'searchInside'])->middleware('throttle:30,1,get-search-inside');
Route::get('/search/suggest', [\App\Http\Controllers\Api\DiscoveryController::class, 'suggest'])->middleware('throttle:120,1,get-search-suggest');
Route::post('/search/click', [\App\Http\Controllers\Api\DiscoveryController::class, 'searchClick'])->middleware('throttle:60,1,post-search-click');
Route::get('/books/{slug}/reviews', [ReviewController::class, 'index'])->middleware('throttle:public-read');
Route::post('/books/{slug}/view', [RecommendationController::class, 'recordView'])->middleware('throttle:60,1,post-books-slug-view');
Route::get('/promo', [StorefrontController::class, 'promo'])->middleware('throttle:public-read');
Route::get('/bundles', [BundleController::class, 'index'])->middleware('throttle:public-read');
Route::get('/creators/{slug}', [\App\Http\Controllers\Api\CreatorPublicController::class, 'show'])->middleware('throttle:public-read');
Route::get('/creator-terms', fn () => response()->json(\App\Services\CreatorTerms::facts()));
// Laporan pelanggaran konten (publik, dibatasi agar tidak disalahgunakan).
Route::post('/books/{slug}/report', [\App\Http\Controllers\Api\BookReportController::class, 'store'])->middleware('throttle:5,60,post-books-slug-report');
// Analitik kreator: pencatat "masuk keranjang" (tanpa data pribadi).
Route::post('/books/{slug}/cart-event', function (string $slug, \Illuminate\Http\Request $request) {
    if ($book = \App\Models\Book::where('slug', $slug)->where('status', 'published')->first()) {
        \App\Services\CreatorAnalytics::recordCart($book, $request);
    }

    return response()->noContent();
})->middleware('throttle:60,1,cart-event');
Route::get('/assistant/status', [\App\Http\Controllers\Api\AssistantController::class, 'status']);
Route::post('/assistant/chat', [\App\Http\Controllers\Api\AssistantController::class, 'chat'])->middleware('throttle:12,1,post-assistant-chat');
Route::post('/assistant/feedback', [\App\Http\Controllers\Api\AssistantController::class, 'feedback'])->middleware('throttle:30,1,post-assistant-feedback');
Route::get('/bundles/{slug}', [BundleController::class, 'show'])->middleware('throttle:public-read');

// Newsletter & preferensi email (tanpa login, lewat token di email)
Route::post('/newsletter/subscribe', [NewsletterController::class, 'subscribe'])->middleware('throttle:5,1,post-newsletter-subscribe');
Route::post('/newsletter/confirm', [NewsletterController::class, 'confirm'])->middleware('throttle:20,1,post-newsletter-confirm');
Route::post('/newsletter/unsubscribe', [NewsletterController::class, 'unsubscribe'])->middleware('throttle:20,1,post-newsletter-unsubscribe');
Route::post('/newsletter/unsubscribe/{token}', [NewsletterController::class, 'oneClick'])->middleware('throttle:20,1,post-newsletter-unsubscribe-token');
Route::post('/email/reminders/unsubscribe', [NewsletterController::class, 'unsubscribeReminders'])->middleware('throttle:20,1,post-email-reminders-unsubscribe');
Route::get('/posts', [PostController::class, 'index'])->middleware('throttle:public-read');
Route::get('/posts/{slug}', [PostController::class, 'show'])->middleware('throttle:public-read');
Route::get('/books/{slug}/preview/{page}', [ReaderController::class, 'previewPage'])
    ->whereNumber('page')
    ->middleware('throttle:120,1,preview');

// Gambar halaman buku (token sesi baca lewat header Authorization)
Route::get('/reader/{bookSlug}/pages/{page}', [ReaderController::class, 'getPage'])->whereNumber('page')->middleware('throttle:120,1,reader-page');

// Auth
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1,post-register');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:30,1,post-login');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
    Route::get('/me', [AuthController::class, 'me'])->middleware('auth:sanctum');
    Route::post('/email/verify/{id}/{hash}', [AuthController::class, 'verifyEmail'])->name('verification.verify')->middleware('throttle:10,1,post-email-verify-id-hash');
    Route::post('/email/resend', [AuthController::class, 'resendVerification'])->middleware(['auth:sanctum', 'throttle:3,1,post-email-resend']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1,post-forgot-password');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:10,1,post-reset-password');
    Route::post('/google', [AuthController::class, 'googleLogin'])->middleware('throttle:20,1,post-google');
    Route::get('/google/redirect', [AuthController::class, 'googleRedirect'])->middleware('throttle:20,1,google-redirect');
    Route::get('/google/callback', [AuthController::class, 'googleCallback'])->middleware('throttle:20,1,google-callback');
    Route::post('/google/exchange', [AuthController::class, 'googleExchange'])->middleware('throttle:20,1,google-exchange');
    // Verifikasi dua langkah (2FA)
    Route::post('/two-factor-challenge', [AuthController::class, 'twoFactorChallenge'])->middleware('throttle:10,1,2fa-challenge');
    Route::middleware(['auth:sanctum', 'throttle:10,1,2fa-manage'])->prefix('two-factor')->group(function () {
        Route::post('/setup', [\App\Http\Controllers\Api\TwoFactorController::class, 'setup']);
        Route::post('/confirm', [\App\Http\Controllers\Api\TwoFactorController::class, 'confirm']);
        Route::post('/disable', [\App\Http\Controllers\Api\TwoFactorController::class, 'disable']);
    });
    Route::post('/logout-others', [AuthController::class, 'logoutOthers'])->middleware(['auth:sanctum', 'throttle:10,1,logout-others']);
});

// Authenticated Buyer
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store'])->middleware('throttle:20,60,order-create');
    Route::post('/coupons/validate', [OrderController::class, 'validateCoupon'])->middleware('throttle:20,1,post-coupons-validate');

    // Keranjang (salinan server + hitung harga)
    Route::get('/cart', [CartController::class, 'show']);
    Route::put('/cart', [CartController::class, 'sync'])->middleware('throttle:60,1,put-cart');
    Route::post('/cart/quote', [CartController::class, 'quote'])->middleware('throttle:60,1,post-cart-quote');

    Route::get('/profile/email-preferences', [NewsletterController::class, 'preferences']);
    Route::put('/profile/email-preferences', [NewsletterController::class, 'updatePreferences']);
    Route::get('/orders/{orderNumber}', [OrderController::class, 'show']);
    Route::get('/orders/{orderNumber}/invoice', [OrderController::class, 'invoice'])->middleware('throttle:20,1,invoice');
    Route::post('/orders/{id}/proof', [OrderController::class, 'uploadProof'])->middleware('throttle:20,60,proof');
    Route::post('/orders/{id}/reproof', [OrderController::class, 'reuploadProof'])->middleware('throttle:20,60,proof');
    
    Route::get('/library', [LibraryController::class, 'index']);
    
    Route::post('/reader/{bookSlug}/session', [ReaderController::class, 'startSession'])->middleware('throttle:30,1,reader-session');
    Route::post('/reader/{bookSlug}/progress', [ReaderController::class, 'saveProgress']);

    // Alat baca (khusus pemilik buku)
    Route::prefix('/reader/{bookSlug}')->group(function () {
        Route::get('/toc', [ReaderToolsController::class, 'toc']);
        Route::get('/search', [ReaderToolsController::class, 'search'])->middleware('throttle:30,1,get-search');
        Route::get('/bookmarks', [ReaderToolsController::class, 'bookmarks']);
        Route::post('/bookmarks', [ReaderToolsController::class, 'storeBookmark']);
        Route::delete('/bookmarks/{id}', [ReaderToolsController::class, 'destroyBookmark'])->whereNumber('id');
        Route::get('/notes', [ReaderToolsController::class, 'notes']);
        Route::post('/notes', [ReaderToolsController::class, 'storeNote']);
        Route::put('/notes/{id}', [ReaderToolsController::class, 'updateNote'])->whereNumber('id');
        Route::delete('/notes/{id}', [ReaderToolsController::class, 'destroyNote'])->whereNumber('id');
    });

    // Ulasan
    Route::get('/books/{slug}/reviews/mine', [ReviewController::class, 'mine']);
    Route::post('/books/{slug}/reviews', [ReviewController::class, 'store'])->middleware('throttle:20,1,post-books-slug-reviews');
    Route::delete('/books/{slug}/reviews', [ReviewController::class, 'destroy']);

    // Wishlist
    Route::get('/wishlist', [WishlistController::class, 'index']);
    Route::get('/wishlist/ids', [WishlistController::class, 'ids']);
    Route::post('/wishlist/{bookId}', [WishlistController::class, 'store'])->whereNumber('bookId');
    Route::delete('/wishlist/{bookId}', [WishlistController::class, 'destroy'])->whereNumber('bookId');
    
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update'])->middleware('throttle:10,1,profile');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->middleware('throttle:5,10,delete-profile');
    Route::get('/profile/preferences', [RecommendationController::class, 'preferences']);
    Route::put('/profile/preferences', [RecommendationController::class, 'updatePreferences']);
});

// Kreator: kelola buku & voucher sendiri, lihat pendapatan, ajukan penarikan.
Route::middleware(['auth:sanctum', 'creator'])->prefix('creator')->group(function () {
    Route::get('/summary', [\App\Http\Controllers\Api\Creator\DashboardController::class, 'summary']);
    Route::get('/analytics', [\App\Http\Controllers\Api\Creator\DashboardController::class, 'analytics']);
    Route::get('/earnings', [\App\Http\Controllers\Api\Creator\DashboardController::class, 'earningsIndex']);
    Route::get('/profile', [\App\Http\Controllers\Api\Creator\DashboardController::class, 'profile']);
    Route::put('/profile', [\App\Http\Controllers\Api\Creator\DashboardController::class, 'updateProfile'])->middleware('throttle:20,10,creator-profile');
    Route::post('/terms/accept', [\App\Http\Controllers\Api\Creator\DashboardController::class, 'acceptTerms']);
    Route::get('/payouts', [\App\Http\Controllers\Api\Creator\DashboardController::class, 'payouts']);
    Route::post('/payouts', [\App\Http\Controllers\Api\Creator\DashboardController::class, 'requestPayout'])->middleware('throttle:10,1,post-payouts');

    Route::apiResource('/books', \App\Http\Controllers\Api\Creator\BookController::class)->names('creator.books');
    Route::post('/books/{id}/upload', [\App\Http\Controllers\Api\Creator\BookController::class, 'uploadFile'])->middleware('throttle:15,60,book-upload');
    Route::post('/books/{id}/reprocess', [\App\Http\Controllers\Api\Creator\BookController::class, 'reprocess'])->middleware('throttle:15,60,book-reprocess');
    Route::apiResource('/coupons', \App\Http\Controllers\Api\Creator\CouponController::class)->except('show')->names('creator.coupons');
});

// Admin
Route::middleware(['auth:sanctum', 'admin'])->prefix('admin')->group(function () {
    Route::get('/creators', [\App\Http\Controllers\Api\Admin\CreatorController::class, 'index']);
    Route::patch('/users/{id}/creator', [\App\Http\Controllers\Api\Admin\CreatorController::class, 'setCreator']);
    Route::patch('/creators/{id}/commission', [\App\Http\Controllers\Api\Admin\CreatorController::class, 'updateCommission']);
    Route::get('/payouts', [\App\Http\Controllers\Api\Admin\CreatorController::class, 'payouts']);
    Route::post('/payouts/{id}/paid', [\App\Http\Controllers\Api\Admin\CreatorController::class, 'markPaid']);
    Route::patch('/payouts/{id}/reject', [\App\Http\Controllers\Api\Admin\CreatorController::class, 'reject']);
    Route::get('/payouts/{id}/proof', [\App\Http\Controllers\Api\Admin\CreatorController::class, 'proof']);
    Route::get('/dashboard', [AdminDashboardController::class, 'index']);
    
    Route::apiResource('/books', AdminBookController::class);
    Route::post('/books/{id}/upload', [AdminBookController::class, 'uploadFile']);
    Route::post('/books/{id}/reprocess', [AdminBookController::class, 'reprocess']);
    Route::get('/system-status', [AdminSystemController::class, 'status']);
    
    Route::apiResource('/categories', AdminCategoryController::class);
    Route::apiResource('/coupons', AdminCouponController::class);
    Route::apiResource('/bundles', AdminBundleController::class)->except('show');
    Route::post('/brochure', [\App\Http\Controllers\Api\Admin\BrochureController::class, 'generate'])->middleware('throttle:20,1,post-brochure');

    Route::prefix('/newsletter')->group(function () {
        Route::get('/overview', [AdminNewsletterController::class, 'overview']);
        Route::get('/subscribers', [AdminNewsletterController::class, 'subscribers']);
        Route::delete('/subscribers/{id}', [AdminNewsletterController::class, 'destroySubscriber']);
        Route::get('/campaigns', [AdminNewsletterController::class, 'campaigns']);
        Route::post('/campaigns', [AdminNewsletterController::class, 'storeCampaign']);
        Route::get('/campaigns/{id}', [AdminNewsletterController::class, 'showCampaign']);
        Route::put('/campaigns/{id}', [AdminNewsletterController::class, 'updateCampaign']);
        Route::delete('/campaigns/{id}', [AdminNewsletterController::class, 'destroyCampaign']);
        Route::post('/campaigns/{id}/test', [AdminNewsletterController::class, 'test'])->middleware('throttle:10,1,post-campaigns-id-test');
        Route::post('/campaigns/{id}/send', [AdminNewsletterController::class, 'send']);
    });
    Route::apiResource('/banners', AdminBannerController::class);
    Route::post('/posts/preview', [AdminPostController::class, 'preview']);
    Route::post('/posts/images', [AdminPostController::class, 'uploadImage'])->middleware('throttle:60,1,post-posts-images');
    Route::apiResource('/posts', AdminPostController::class);
    
    Route::get('/orders', [AdminOrderController::class, 'index']);
    Route::get('/orders/{id}', [AdminOrderController::class, 'show']);
    Route::get('/orders/{id}/proofs/{proofId}', [AdminOrderController::class, 'proofFile']);
    Route::get('/orders/{id}/invoice', [AdminOrderController::class, 'invoice']);
    Route::patch('/orders/{id}/confirm', [AdminOrderController::class, 'confirm']);
    Route::patch('/orders/{id}/reject', [AdminOrderController::class, 'reject']);
    Route::post('/orders/{id}/refund', [AdminOrderController::class, 'refund']);
    Route::get('/book-reports', [\App\Http\Controllers\Api\Admin\BookReportController::class, 'index']);
    Route::get('/assistant-report', [\App\Http\Controllers\Api\Admin\AssistantReportController::class, 'index']);
    Route::patch('/book-reports/{id}', [\App\Http\Controllers\Api\Admin\BookReportController::class, 'update']);
    
    Route::get('/users', [AdminUserController::class, 'index']);
    Route::patch('/users/{id}/block', [AdminUserController::class, 'block']);
    Route::patch('/users/{id}/unblock', [AdminUserController::class, 'unblock']);
    Route::get('/users/{id}/activity', [AdminUserController::class, 'activity']);
    Route::post('/users/{id}/end-reading-sessions', [AdminUserController::class, 'endReadingSessions']);
    Route::get('/leaks/lookup', [\App\Http\Controllers\Api\Admin\LeakController::class, 'lookup'])->middleware('throttle:30,1,get-leaks-lookup');

    Route::get('/reviews', [AdminReviewController::class, 'index']);
    Route::patch('/reviews/{review}/hide', [AdminReviewController::class, 'hide']);
    Route::patch('/reviews/{review}/unhide', [AdminReviewController::class, 'unhide']);
    Route::delete('/reviews/{review}', [AdminReviewController::class, 'destroy']);
    Route::delete('/users/{userId}/books/{bookId}', [AdminUserController::class, 'revokeBook']);
    
    Route::get('/reports', [AdminReportController::class, 'index']);
    Route::get('/reports/export', [AdminReportController::class, 'export']);
    Route::get('/reports/searches', [AdminReportController::class, 'searches']);
    
    Route::get('/settings', [AdminSettingController::class, 'index']);
    Route::put('/settings', [AdminSettingController::class, 'update']);
    Route::post('/settings/qris', [AdminSettingController::class, 'uploadQris']);
});
