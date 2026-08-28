import { getToken } from './auth';

// Containers use the same-origin Next.js gateway so one image works under any
// public domain. Native frontend development may still override the API URL.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ResponseKind = 'json' | 'blob' | 'void';

async function apiRequest<T>(
  path: string,
  options: RequestInit,
  responseKind: ResponseKind,
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const isJson = res.headers
    .get('content-type')
    ?.includes('application/json');

  if (!res.ok) {
    const body = isJson
      ? await res.json().catch(() => null)
      : await res.text().catch(() => '');
    const message =
      (body &&
        typeof body === 'object' &&
        'message' in body &&
        (Array.isArray(body.message) ? body.message[0] : body.message)) ||
      (typeof body === 'string' && body) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, String(message));
  }

  if (responseKind === 'void' || res.status === 204) {
    return undefined as T;
  }
  if (responseKind === 'blob') {
    return (await res.blob()) as T;
  }
  return (isJson ? await res.json() : null) as T;
}

export function apiJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return apiRequest<T>(path, options, 'json');
}

export function apiForm<T>(
  path: string,
  body: FormData,
  options: Omit<RequestInit, 'body'> = {},
): Promise<T> {
  return apiRequest<T>(path, { ...options, body }, 'json');
}

export function apiBlob(
  path: string,
  options: RequestInit = {},
): Promise<Blob> {
  return apiRequest<Blob>(path, options, 'blob');
}

export function apiVoid(
  path: string,
  options: RequestInit = {},
): Promise<void> {
  return apiRequest<void>(path, options, 'void');
}

/** Backward-compatible JSON alias while feature adapters are introduced. */
export function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return apiJson<T>(path, options);
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export const apiBaseUrl = BASE_URL;
