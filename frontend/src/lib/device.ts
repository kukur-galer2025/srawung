/**
 * Id perangkat untuk sesi baca: acak, dibuat sekali, disimpan di peramban ini.
 * Server memakainya untuk mengikat token sesi baca ke perangkat ini, sehingga token
 * yang dicuri tidak bisa dipakai di perangkat lain (lihat ReaderController).
 * Tidak ada batas jumlah perangkat: satu akun boleh membaca di banyak perangkat.
 */
const KEY = 'srawung_device';
let memory: string | null = null;

function random(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function readerDeviceId(): string {
  if (memory) return memory;
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      id = random();
      localStorage.setItem(KEY, id);
    }
    return (memory = id);
  } catch {
    // Penyimpanan diblokir (mode privat ketat): id berlaku selama halaman terbuka.
    return (memory = random());
  }
}
