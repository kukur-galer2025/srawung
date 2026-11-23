/**
 * JSON-LD untuk <script type="application/ld+json">. Tanda "<" diganti kode unicode agar judul atau
 * sinopsis buku (isian kreator) tidak bisa menutup tag script lalu menjalankan kode di peramban pembaca.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
