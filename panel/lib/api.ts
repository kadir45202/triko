// İstemci tarafı API istemcisi: JWT'yi localStorage'da tutar, 401'de
// refresh token ile bir kez yeniler, o da düşerse login'e yönlendirir.
'use client';

const AT_KEY = 'triko_at';
const RT_KEY = 'triko_rt';

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(AT_KEY, accessToken);
  localStorage.setItem(RT_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(AT_KEY);
  localStorage.removeItem(RT_KEY);
}

export function hasSession(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem(AT_KEY);
}

async function tryRefresh(): Promise<boolean> {
  const rt = localStorage.getItem(RT_KEY);
  if (!rt) return false;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = () =>
    fetch('/api' + path, {
      ...options,
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + (localStorage.getItem(AT_KEY) || ''),
        ...(options.headers || {}),
      },
    });

  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) res = await doFetch();
  if (res.status === 401) {
    clearTokens();
    window.location.href = '/login';
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'request_failed_' + res.status);
  }
  return res.json();
}

// Multipart görsel yükleme — content-type'ı tarayıcı belirler
export async function apiUpload<T = unknown>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const doFetch = () =>
    fetch('/api' + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + (localStorage.getItem(AT_KEY) || '') },
      body: form,
    });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) res = await doFetch();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'upload_failed_' + res.status);
  }
  return res.json();
}
