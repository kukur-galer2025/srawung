<?php
/**
 * Amania Backend Comprehensive Verification Script
 * Checks Database Integrity, Route Registry, and Endpoints (Public, Auth, Reader, Admin).
 */

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$consoleKernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$consoleKernel->bootstrap();
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

class Tester {
    private int $passed = 0;
    private int $failed = 0;
    private array $failures = [];

    public function assert(string $label, bool $condition, string $detail = ''): void {
        if ($condition) {
            $this->passed++;
            echo "  [PASS] {$label}\n";
        } else {
            $this->failed++;
            $msg = "  [FAIL] {$label}" . ($detail ? " - {$detail}" : '');
            $this->failures[] = $msg;
            echo "{$msg}\n";
        }
    }

    public function summary(): void {
        echo "\n======================================================\n";
        echo "TEST SUMMARY: {$this->passed} Passed, {$this->failed} Failed\n";
        if ($this->failed > 0) {
            echo "FAILURES:\n";
            foreach ($this->failures as $f) {
                echo "  - {$f}\n";
            }
        } else {
            echo "ALL VERIFICATION CHECKS PASSED PERFECTLY!\n";
        }
        echo "======================================================\n";
    }

    public function hasFailures(): bool {
        return $this->failed > 0;
    }
}

$tester = new Tester();

function callApi($kernel, string $method, string $uri, array $data = [], ?string $token = null) {
    global $app;
    try {
        \Illuminate\Support\Facades\Auth::guard('web')->logout();
    } catch (\Throwable $e) {}
    \Illuminate\Support\Facades\Auth::forgetGuards();
    \Illuminate\Support\Facades\Auth::clearResolvedInstances();
    $app->forgetInstance('auth');
    $app->forgetInstance('auth.driver');
    if (session()->isStarted()) {
        session()->flush();
        session()->regenerate();
    }

    $request = Illuminate\Http\Request::create($uri, $method, $data);
    $request->headers->set('Accept', 'application/json');
    if ($token) {
        $request->headers->set('Authorization', 'Bearer ' . $token);
    }
    $response = $kernel->handle($request);
    $kernel->terminate($request, $response);
    return $response;
}

echo "======================================================\n";
echo "  AMANIA BACKEND VERIFICATION SUITE\n";
echo "======================================================\n\n";

// -----------------------------------------------------------------------------
// 1. DATABASE INTEGRITY
// -----------------------------------------------------------------------------
echo "[1] Checking Database Integrity (MySQL: amania_books)...\n";

$catCount = \App\Models\Category::count();
$tester->assert("Categories count equals 5", $catCount === 5, "Actual count: {$catCount}");

$categories = \App\Models\Category::all();
$novelCat = $categories->firstWhere('slug', 'novel');
$teknoCat = $categories->firstWhere('slug', 'teknologi');
$tester->assert("Sample categories 'novel' and 'teknologi' exist", $novelCat !== null && $teknoCat !== null);

$bookCount = \App\Models\Book::count();
$tester->assert("Books count equals 12", $bookCount === 12, "Actual count: {$bookCount}");

$publishedBooks = \App\Models\Book::where('status', 'published')->count();
$tester->assert("All 12 books are published", $publishedBooks === 12, "Published count: {$publishedBooks}");

$validPages = \App\Models\Book::where('total_pages', '>', 0)->count();
$tester->assert("All 12 books have total_pages > 0", $validPages === 12);

$validPrices = \App\Models\Book::where('price', '>', 0)->count();
$tester->assert("All 12 books have price > 0", $validPrices === 12);

$pagesCount = \App\Models\BookPage::count();
$tester->assert("Book pages count equals 180 (15 pages x 12 books)", $pagesCount === 180, "Actual pages: {$pagesCount}");

$adminUser = \App\Models\User::where('email', 'admin@amania.com')->first();
$tester->assert("Admin user exists (admin@amania.com)", $adminUser !== null && $adminUser->role === 'admin');

$buyerUser = \App\Models\User::where('email', 'buyer@amania.com')->first();
$tester->assert("Buyer user exists (buyer@amania.com)", $buyerUser !== null && $buyerUser->role === 'buyer');

$adminPassValid = $adminUser && \Illuminate\Support\Facades\Hash::check('password123', $adminUser->password);
$tester->assert("Admin password hash validates 'password123'", (bool)$adminPassValid);

$couponCount = \App\Models\Coupon::count();
$tester->assert("Coupons seeded (at least 2 coupons)", $couponCount >= 2, "Actual count: {$couponCount}");

$settingsCount = \App\Models\Setting::count();
$tester->assert("Settings seeded (bank info, whatsapp, etc)", $settingsCount >= 4, "Actual count: {$settingsCount}");

// -----------------------------------------------------------------------------
// 2. PUBLIC API ENDPOINTS
// -----------------------------------------------------------------------------
echo "\n[2] Checking Public API Endpoints...\n";

// GET /api/categories
$catRes = callApi($kernel, 'GET', '/api/categories');
$tester->assert("GET /api/categories returns 200", $catRes->getStatusCode() === 200);
$catData = json_decode($catRes->getContent(), true);
$tester->assert("GET /api/categories returns list with books_count", is_array($catData) && count($catData) === 5 && isset($catData[0]['books_count']));

// GET /api/books
$booksRes = callApi($kernel, 'GET', '/api/books');
$tester->assert("GET /api/books returns 200", $booksRes->getStatusCode() === 200);
$booksData = json_decode($booksRes->getContent(), true);
$tester->assert("GET /api/books returns paginated structure", isset($booksData['data']) && count($booksData['data']) === 12);

// GET /api/books with category filter
$catFilteredRes = callApi($kernel, 'GET', '/api/books?category=novel');
$tester->assert("GET /api/books?category=novel returns 200", $catFilteredRes->getStatusCode() === 200);
$catFilteredData = json_decode($catFilteredRes->getContent(), true);
$allNovel = true;
foreach ($catFilteredData['data'] as $b) {
    if ($b['category']['slug'] !== 'novel') {
        $allNovel = false;
        break;
    }
}
$tester->assert("Category filter returns only matching books", $allNovel && count($catFilteredData['data']) > 0);

// GET /api/books/{slug}
$firstBook = \App\Models\Book::first();
$bookRes = callApi($kernel, 'GET', '/api/books/' . $firstBook->slug);
$tester->assert("GET /api/books/{slug} returns 200", $bookRes->getStatusCode() === 200);
$bookData = json_decode($bookRes->getContent(), true);
$tester->assert("GET /api/books/{slug} contains preview_pages array", isset($bookData['preview_pages']) && is_array($bookData['preview_pages']) && count($bookData['preview_pages']) > 0);

// -----------------------------------------------------------------------------
// 3. AUTHENTICATION FLOW
// -----------------------------------------------------------------------------
echo "\n[3] Checking Auth Flow...\n";

// Login valid
$buyerLogin = callApi($kernel, 'POST', '/api/auth/login', [
    'email' => 'buyer@amania.com',
    'password' => 'password123',
]);
$tester->assert("POST /api/auth/login with valid credentials returns 200", $buyerLogin->getStatusCode() === 200);
$buyerAuthData = json_decode($buyerLogin->getContent(), true);
$buyerToken = $buyerAuthData['token'] ?? null;
$tester->assert("Login returns auth token", !empty($buyerToken));

// Login invalid password
$invalidLogin = callApi($kernel, 'POST', '/api/auth/login', [
    'email' => 'buyer@amania.com',
    'password' => 'wrongpassword',
]);
$tester->assert("POST /api/auth/login with invalid password returns 422", $invalidLogin->getStatusCode() === 422);

// GET /api/auth/me
$meRes = callApi($kernel, 'GET', '/api/auth/me', [], $buyerToken);
$tester->assert("GET /api/auth/me returns 200 with Bearer token", $meRes->getStatusCode() === 200);
$meData = json_decode($meRes->getContent(), true);
$tester->assert("GET /api/auth/me returns buyer email", ($meData['user']['email'] ?? '') === 'buyer@amania.com');

// Register flow
$uniqueSuffix = time() . rand(100, 999);
$regRes = callApi($kernel, 'POST', '/api/auth/register', [
    'name' => 'Tester ' . $uniqueSuffix,
    'email' => "tester_{$uniqueSuffix}@amania.test",
    'whatsapp' => '081298765432',
    'password' => 'secret1234',
    'password_confirmation' => 'secret1234',
]);
$tester->assert("POST /api/auth/register returns 201", $regRes->getStatusCode() === 201);
$regData = json_decode($regRes->getContent(), true);
$tester->assert("Register returns new auth token", !empty($regData['token']));

// Clean up registered user
if (isset($regData['user']['id'])) {
    \App\Models\User::where('id', $regData['user']['id'])->delete();
}

// Logout
$logoutRes = callApi($kernel, 'POST', '/api/auth/logout', [], $buyerToken);
$tester->assert("POST /api/auth/logout returns 200", $logoutRes->getStatusCode() === 200);

// Re-login buyer for reader flow
\Illuminate\Support\Facades\RateLimiter::clear('login:127.0.0.1');
\Illuminate\Support\Facades\Cache::flush();
$buyerLogin = callApi($kernel, 'POST', '/api/auth/login', [
    'email' => 'buyer@amania.com',
    'password' => 'password123',
]);
$buyerAuthData = json_decode($buyerLogin->getContent(), true);
$buyerToken = $buyerAuthData['token'] ?? null;
$tester->assert("Re-login buyer succeeded", !empty($buyerToken));

// -----------------------------------------------------------------------------
// 4. READER FLOW
// -----------------------------------------------------------------------------
echo "\n[4] Checking Reader Flow...\n";

// Grant access to firstBook in user_library
\App\Models\UserLibrary::updateOrCreate(
    ['user_id' => $buyerUser->id, 'book_id' => $firstBook->id],
    ['access_status' => 'active', 'last_read_page' => 1]
);

// Start reading session
$sessionRes = callApi($kernel, 'POST', "/api/reader/{$firstBook->slug}/session", [], $buyerToken);
$tester->assert("POST /api/reader/{slug}/session returns 200", $sessionRes->getStatusCode() === 200);
$sessionData = json_decode($sessionRes->getContent(), true);
$sessionToken = $sessionData['session_token'] ?? null;
$tester->assert("Reading session returns session_token", !empty($sessionToken));

// Fetch page image with session token
$pageRes = callApi($kernel, 'GET', "/api/reader/{$firstBook->slug}/pages/1?token={$sessionToken}");
$tester->assert("GET /api/reader/{slug}/pages/1 returns 200", $pageRes->getStatusCode() === 200);
$contentType = $pageRes->headers->get('Content-Type');
$tester->assert("Reader page returns image Content-Type (image/webp or image/jpeg)", in_array($contentType, ['image/webp', 'image/jpeg']));
$tester->assert("Reader page content is non-empty binary", strlen($pageRes->getContent()) > 1000);

// Save reading progress
$progRes = callApi($kernel, 'POST', "/api/reader/{$firstBook->slug}/progress", ['page' => 7], $buyerToken);
$tester->assert("POST /api/reader/{slug}/progress returns 200", $progRes->getStatusCode() === 200);
$progData = json_decode($progRes->getContent(), true);
$tester->assert("Progress updated to page 7", ($progData['last_read_page'] ?? 0) === 7);

// Reader unauthorized without active access
$unauthBook = \App\Models\Book::where('id', '!=', $firstBook->id)->first();
\App\Models\UserLibrary::where('user_id', $buyerUser->id)->where('book_id', $unauthBook->id)->delete();
$unauthSession = callApi($kernel, 'POST', "/api/reader/{$unauthBook->slug}/session", [], $buyerToken);
$tester->assert("POST /api/reader/{slug}/session without library access returns 403", $unauthSession->getStatusCode() === 403);

// -----------------------------------------------------------------------------
// 5. BUYER LIBRARY & ORDERS FLOW
// -----------------------------------------------------------------------------
echo "\n[5] Checking Buyer Library & Orders Flow...\n";

// GET /api/library
$libRes = callApi($kernel, 'GET', '/api/library', [], $buyerToken);
$tester->assert("GET /api/library returns 200", $libRes->getStatusCode() === 200);
$libData = json_decode($libRes->getContent(), true);
$tester->assert("GET /api/library includes owned books", is_array($libData) && count($libData) > 0);

// Create order
$orderRes = callApi($kernel, 'POST', '/api/orders', [
    'book_ids' => [$unauthBook->id],
], $buyerToken);
$tester->assert("POST /api/orders creates new order (201)", $orderRes->getStatusCode() === 201);
$orderData = json_decode($orderRes->getContent(), true);
$orderNumber = $orderData['order']['order_number'] ?? null;
$tester->assert("Order number generated correctly", !empty($orderNumber));

// Clean up test order
if (!empty($orderData['order']['id'])) {
    \App\Models\Order::where('id', $orderData['order']['id'])->delete();
}

// -----------------------------------------------------------------------------
// 6. ADMIN API ENDPOINTS
// -----------------------------------------------------------------------------
echo "\n[6] Checking Admin Endpoints...\n";

// Login admin
$adminLogin = callApi($kernel, 'POST', '/api/auth/login', [
    'email' => 'admin@amania.com',
    'password' => 'password123',
]);
$tester->assert("POST /api/auth/login as Admin returns 200", $adminLogin->getStatusCode() === 200);
$adminToken = json_decode($adminLogin->getContent(), true)['token'] ?? null;

// GET /api/admin/dashboard
$dashRes = callApi($kernel, 'GET', '/api/admin/dashboard', [], $adminToken);
$tester->assert("GET /api/admin/dashboard returns 200", $dashRes->getStatusCode() === 200);
$dashData = json_decode($dashRes->getContent(), true);
$tester->assert("Admin dashboard contains summary metrics", isset($dashData['total_books_count']));

// GET /api/admin/orders
$adminOrdersRes = callApi($kernel, 'GET', '/api/admin/orders', [], $adminToken);
$tester->assert("GET /api/admin/orders returns 200", $adminOrdersRes->getStatusCode() === 200);

// GET /api/admin/reports
$reportsRes = callApi($kernel, 'GET', '/api/admin/reports', [], $adminToken);
$tester->assert("GET /api/admin/reports returns 200", $reportsRes->getStatusCode() === 200);

// GET /api/admin/settings
$settingsRes = callApi($kernel, 'GET', '/api/admin/settings', [], $adminToken);
$tester->assert("GET /api/admin/settings returns 200", $settingsRes->getStatusCode() === 200);

// Forbidden access for buyer to admin endpoints
$buyerToAdmin = callApi($kernel, 'GET', '/api/admin/dashboard', [], $buyerToken);
$tester->assert("Buyer accessing /api/admin/dashboard gets 403 Forbidden", $buyerToAdmin->getStatusCode() === 403);

// -----------------------------------------------------------------------------
// FINAL SUMMARY
// -----------------------------------------------------------------------------
$tester->summary();

exit($tester->hasFailures() ? 1 : 0);
