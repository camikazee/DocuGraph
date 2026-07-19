import { apiFetch } from './api';
import { getToken } from './auth';

/**
 * Best-effort zgłoszenie błędu klienta do lokalnego dziennika błędów backendu
 * (zamiast zewnętrznego Sentry). Ciche — nigdy nie rzuca; wymaga zalogowania.
 */
export async function reportClientError(
  message: string,
  stack?: string,
): Promise<void> {
  try {
    if (!getToken()) return;
    const me = await apiFetch<{ workspaces: { id: string }[] }>('/auth/me');
    const ws = me.workspaces?.[0]?.id;
    if (!ws) return;
    await apiFetch(`/workspaces/${ws}/client-errors`, {
      method: 'POST',
      body: JSON.stringify({
        message: message?.slice(0, 2000) || 'Unknown client error',
        stack: stack?.slice(0, 8000),
        url:
          typeof window !== 'undefined'
            ? window.location.pathname + window.location.search
            : undefined,
      }),
    });
  } catch {
    /* best-effort — swallow */
  }
}
