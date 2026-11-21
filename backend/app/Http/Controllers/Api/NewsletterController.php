<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NewsletterSubscriber;
use App\Models\User;
use App\Services\EmailPreferences;
use Illuminate\Http\Request;

class NewsletterController extends Controller
{
    public function subscribe(Request $request)
    {
        $data = $request->validate(['email' => 'required|email:filter|max:255'], [
            'email.required' => 'Isi alamat email Anda.',
            'email.email' => 'Alamat email tidak valid.',
        ]);

        $user = $request->user('sanctum');
        $result = EmailPreferences::subscribe($data['email'], $user, 'footer');

        return response()->json([
            'status' => $result['status'],
            'message' => match ($result['status']) {
                'already' => 'Email ini sudah berlangganan. Terima kasih!',
                'subscribed' => 'Berhasil berlangganan newsletter Srawung.',
                default => 'Hampir selesai! Cek email Anda dan klik tautan konfirmasi.',
            },
        ]);
    }

    public function confirm(Request $request)
    {
        $data = $request->validate(['token' => 'required|string|max:64']);
        $sub = NewsletterSubscriber::where('token', $data['token'])->first();
        if (!$sub) {
            return response()->json(['message' => 'Tautan konfirmasi tidak valid.'], 404);
        }
        if ($sub->status !== NewsletterSubscriber::SUBSCRIBED) {
            $sub->fill(['status' => NewsletterSubscriber::SUBSCRIBED, 'confirmed_at' => now(), 'unsubscribed_at' => null])->save();
        }

        return response()->json(['message' => 'Langganan dikonfirmasi. Sampai jumpa di kotak masuk!', 'email' => $sub->email]);
    }

    /** Dari halaman /newsletter/berhenti?token=… */
    public function unsubscribe(Request $request)
    {
        $data = $request->validate(['token' => 'required|string|max:64']);

        return $this->doUnsubscribe($data['token']);
    }

    /** One-click unsubscribe (RFC 8058) — dipanggil langsung oleh Gmail/Outlook. */
    public function oneClick(string $token)
    {
        return $this->doUnsubscribe($token);
    }

    /** Matikan pengingat keranjang & promo wishlist dari tautan di email (tanpa login). */
    public function unsubscribeReminders(Request $request)
    {
        $data = $request->validate(['u' => 'required|integer', 't' => 'required|string|max:64']);
        $user = User::find($data['u']);
        if (!$user || !hash_equals(EmailPreferences::reminderToken($user), $data['t'])) {
            return response()->json(['message' => 'Tautan tidak valid atau sudah kedaluwarsa.'], 404);
        }
        $user->forceFill(['reminder_emails' => false])->save();

        return response()->json(['message' => 'Pengingat keranjang & kabar promo wishlist dimatikan. Anda tetap menerima email transaksi (invoice, status pesanan).']);
    }

    /** Preferensi email untuk pengguna yang login (halaman Profil). */
    public function preferences(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'newsletter' => EmailPreferences::newsletterStatus($user),
            'reminder_emails' => (bool) $user->reminder_emails,
        ]);
    }

    public function updatePreferences(Request $request)
    {
        $data = $request->validate([
            'newsletter' => 'sometimes|boolean',
            'reminder_emails' => 'sometimes|boolean',
        ]);
        $user = $request->user();

        if (array_key_exists('reminder_emails', $data)) {
            $user->forceFill(['reminder_emails' => $data['reminder_emails']])->save();
        }
        if (array_key_exists('newsletter', $data)) {
            if ($data['newsletter']) {
                EmailPreferences::subscribe($user->email, $user, 'profile');
            } elseif ($sub = NewsletterSubscriber::where('email', strtolower($user->email))->first()) {
                EmailPreferences::unsubscribe($sub);
            }
        }

        return $this->preferences($request)->setData([
            'newsletter' => EmailPreferences::newsletterStatus($user),
            'reminder_emails' => (bool) $user->fresh()->reminder_emails,
            'message' => 'Preferensi email disimpan.',
        ]);
    }

    private function doUnsubscribe(string $token)
    {
        $sub = NewsletterSubscriber::where('token', $token)->first();
        if (!$sub) {
            return response()->json(['message' => 'Tautan tidak valid.'], 404);
        }
        EmailPreferences::unsubscribe($sub);

        return response()->json(['message' => 'Anda berhenti berlangganan newsletter Srawung.', 'email' => $sub->email]);
    }
}
