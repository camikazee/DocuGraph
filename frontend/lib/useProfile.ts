'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from './api';
import { clearToken, getToken } from './auth';

export interface Profile {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    username: string | null;
    bio: string | null;
  };
  workspaces: { id: string; name: string; slug: string; role: string }[];
}

/**
 * Pobiera profil zalogowanego użytkownika. Strażnik trasy: przy braku/nieważnym
 * tokenie przekierowuje na /login. Wspólne dla ekranów za logowaniem.
 */
export function useProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    apiFetch<Profile>('/auth/me')
      .then(setProfile)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          router.replace('/login');
        } else {
          setError(err instanceof ApiError ? err.message : 'Failed to load');
        }
      });
  }, [router]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profile, error, reload };
}
