<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\SendNewsletterCampaign;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterSubscriber;
use App\Notifications\NewsletterIssue;
use App\Services\HtmlSanitizer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;

class NewsletterController extends Controller
{
    public function overview()
    {
        $counts = NewsletterSubscriber::selectRaw('status, count(*) as c')->groupBy('status')->pluck('c', 'status');
        $mailHost = (string) config('mail.mailers.smtp.host');

        return response()->json([
            'subscribed' => (int) ($counts['subscribed'] ?? 0),
            'pending' => (int) ($counts['pending'] ?? 0),
            'unsubscribed' => (int) ($counts['unsubscribed'] ?? 0),
            'new_last_30_days' => NewsletterSubscriber::where('status', 'subscribed')->where('confirmed_at', '>=', now()->subDays(30))->count(),
            'uses_gmail' => str_contains($mailHost, 'gmail'),
            'per_minute' => (int) config('mail.newsletter_per_minute', 20),
        ]);
    }

    public function subscribers(Request $request)
    {
        $q = NewsletterSubscriber::query()->latest();
        if ($request->filled('status')) {
            $q->where('status', $request->status);
        }
        if ($request->filled('search')) {
            $q->where('email', 'like', '%' . $request->search . '%');
        }

        return response()->json($q->paginate(20, ['id', 'email', 'status', 'source', 'user_id', 'confirmed_at', 'unsubscribed_at', 'created_at']));
    }

    public function destroySubscriber($id)
    {
        NewsletterSubscriber::findOrFail($id)->delete();

        return response()->json(['message' => 'Pelanggan dihapus dari daftar.']);
    }

    public function campaigns()
    {
        return response()->json(NewsletterCampaign::latest()->get(['id', 'subject', 'preheader', 'status', 'recipients_count', 'sent_at', 'created_at', 'updated_at']));
    }

    public function showCampaign($id)
    {
        return response()->json(NewsletterCampaign::findOrFail($id));
    }

    public function storeCampaign(Request $request)
    {
        $campaign = NewsletterCampaign::create($this->validated($request) + ['status' => 'draft', 'created_by' => $request->user()->id]);

        return response()->json(['message' => 'Draf newsletter disimpan.', 'campaign' => $campaign], 201);
    }

    public function updateCampaign(Request $request, $id)
    {
        $campaign = NewsletterCampaign::findOrFail($id);
        if ($campaign->status !== 'draft') {
            return response()->json(['message' => 'Newsletter yang sudah dikirim tidak bisa diubah.'], 422);
        }
        $campaign->update($this->validated($request));

        return response()->json(['message' => 'Draf newsletter disimpan.', 'campaign' => $campaign]);
    }

    public function destroyCampaign($id)
    {
        $campaign = NewsletterCampaign::findOrFail($id);
        if ($campaign->status === 'sending') {
            return response()->json(['message' => 'Newsletter sedang dikirim.'], 422);
        }
        $campaign->delete();

        return response()->json(['message' => 'Newsletter dihapus.']);
    }

    /** Kirim versi uji ke email admin yang sedang login. */
    public function test(Request $request, $id)
    {
        $campaign = NewsletterCampaign::findOrFail($id);
        Notification::route('mail', $request->user()->email)->notifyNow(new NewsletterIssue($campaign));

        return response()->json(['message' => "Email uji dikirim ke {$request->user()->email}."]);
    }

    public function send($id)
    {
        $campaign = NewsletterCampaign::findOrFail($id);
        if ($campaign->status !== 'draft') {
            return response()->json(['message' => 'Newsletter ini sudah dikirim.'], 422);
        }
        $count = NewsletterSubscriber::where('status', NewsletterSubscriber::SUBSCRIBED)->count();
        if ($count === 0) {
            return response()->json(['message' => 'Belum ada pelanggan yang terkonfirmasi.'], 422);
        }

        $campaign->update(['status' => 'sending', 'recipients_count' => $count]);
        SendNewsletterCampaign::dispatch($campaign->id);

        return response()->json(['message' => "Newsletter sedang dikirim ke {$count} pelanggan secara bertahap.", 'campaign' => $campaign]);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'subject' => 'required|string|max:150',
            'preheader' => 'nullable|string|max:150',
            'body' => 'required|string|max:200000',
        ], ['subject.required' => 'Isi subjek email.', 'body.required' => 'Isi newsletter masih kosong.']);
        $data['body'] = HtmlSanitizer::clean($data['body']);

        return $data;
    }
}
