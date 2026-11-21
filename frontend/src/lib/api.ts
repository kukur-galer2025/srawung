const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export async function fetchAPI(path: string, options: RequestInit = {}) {
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('amania_token');
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Terjadi kesalahan' }));
    throw new Error(error.message || error.error || 'Request failed');
  }
  return res.json();
}

/** Ambil file biner (mis. bukti transfer) dengan Bearer token, kembalikan object URL. */
export async function fetchBlobUrl(path: string): Promise<{ url: string; type: string }> {
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const token = typeof window !== 'undefined' ? localStorage.getItem('amania_token') : null;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('File tidak dapat dimuat');
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}

/** Unduh file terproteksi (mis. invoice PDF) dengan Bearer token. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const { url } = await fetchBlobUrl(path);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Unggah FormData dengan progres (XHR — fetch belum menyediakan progres unggahan).
 * Dipakai untuk file besar seperti PDF buku dan sampul beresolusi tinggi.
 */
export function uploadWithProgress(path: string, body: FormData, onProgress?: (loaded: number, total: number) => void): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Accept', 'application/json');
    const token = typeof window !== 'undefined' ? localStorage.getItem('amania_token') : null;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded, e.total);
    xhr.onload = () => {
      let data: { message?: string } = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* bukan JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      if (xhr.status === 413) return reject(new Error('File melebihi batas unggahan server. Naikkan upload_max_filesize & post_max_size di PHP/web server.'));
      reject(new Error(data.message || 'Unggahan gagal.'));
    };
    xhr.onerror = () => reject(new Error('Koneksi terputus saat mengunggah. Coba lagi.'));
    xhr.send(body);
  });
}

export const api = {
  get: (path: string, options?: RequestInit) => fetchAPI(path, { ...options, method: 'GET' }),
  post: (path: string, body?: unknown, options?: RequestInit) => {
    const isForm = body instanceof FormData;
    return fetchAPI(path, {
      ...options,
      method: 'POST',
      body: isForm ? body : JSON.stringify(body ?? {}),
    });
  },
  put: (path: string, body?: unknown, options?: RequestInit) => {
    const isForm = body instanceof FormData;
    return fetchAPI(path, {
      ...options,
      method: 'PUT',
      body: isForm ? body : JSON.stringify(body ?? {}),
    });
  },
  patch: (path: string, body?: unknown, options?: RequestInit) => {
    const isForm = body instanceof FormData;
    return fetchAPI(path, {
      ...options,
      method: 'PATCH',
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  },
  delete: (path: string, options?: RequestInit) => fetchAPI(path, { ...options, method: 'DELETE' }),
};
