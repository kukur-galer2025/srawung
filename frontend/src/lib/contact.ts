/** Kontak admin Srawung (format internasional tanpa "+", untuk tautan wa.me). */
export const ADMIN_WHATSAPP = '6285181836438';

/** Tautan chat WhatsApp ke admin, opsional dengan pesan pembuka. */
export const waAdminUrl = (text?: string) =>
  `https://wa.me/${ADMIN_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
