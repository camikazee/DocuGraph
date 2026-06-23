import { getToken } from './auth';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Cienki wrapper na fetch: dokleja base URL i token Bearer, parsuje JSON,
 * rzuca ApiError z czytelnym komunikatem z backendu.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  const isJson = res.headers
    .get('content-type')
    ?.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    const message =
      (body && (Array.isArray(body.message) ? body.message[0] : body.message)) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return body as T;
}

export const apiBaseUrl = BASE_URL;
