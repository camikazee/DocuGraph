'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useToast } from '@/components/ui/Toast';

type Phase = 'accepting' | 'need-auth' | 'error' | 'no-token';

function InviteContent() {
  const router = useRouter();
  const { toast } = useToast();
  const token = useSearchParams().get('token') ?? '';
  const [phase, setPhase] = useState<Phase>('accepting');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setPhase('no-token');
      return;
    }
    if (!getToken()) {
      setPhase('need-auth');
      return;
    }
    apiFetch<{ workspaceId: string }>('/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(() => {
        toast('Invitation accepted — welcome aboard', 'success');
        router.replace('/dashboard');
      })
      .catch((err) => {
        setPhase('error');
        setMessage(
          err instanceof ApiError
            ? err.message
            : 'This invitation could not be accepted.',
        );
      });
  }, [token, router, toast]);

  // Po zalogowaniu wróć na ten sam link, by dokończyć akceptację.
  const authNext = `/invite?token=${encodeURIComponent(token)}`;

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-5 top-5">
        <ThemeSwitcher />
      </div>
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-30 blur-[120px]"
        style={{
          background: 'radial-gradient(circle,var(--acc),transparent 70%)',
        }}
      />
      <Card className="relative w-full max-w-md p-8 backdrop-blur">
        <div className="mb-6">
          <Logo />
        </div>

        {phase === 'accepting' && (
          <div className="py-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-fg">
              Accepting your invitation…
            </h1>
            <p className="mt-2 text-sm text-fg3">One moment.</p>
          </div>
        )}

        {phase === 'need-auth' && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              You&apos;ve been invited
            </h1>
            <p className="mt-1.5 text-sm text-fg3">
              Sign in or create your account with the email this invitation was
              sent to, and you&apos;ll join the workspace automatically.
            </p>
            <div className="mt-6 grid gap-2">
              <Button
                href={`/login?next=${encodeURIComponent(authNext)}`}
                className="w-full"
              >
                Sign in to accept
              </Button>
              <Button
                variant="secondary"
                href={`/register?next=${encodeURIComponent(authNext)}`}
                className="w-full"
              >
                Create an account
              </Button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              Invitation problem
            </h1>
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              {message}
            </div>
            <Button href="/dashboard" className="mt-6 w-full">
              Go to dashboard
            </Button>
          </>
        )}

        {phase === 'no-token' && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              Missing invitation token
            </h1>
            <p className="mt-1.5 text-sm text-fg3">
              This link is incomplete. Ask whoever invited you to resend it.
            </p>
            <Button href="/login" className="mt-6 w-full">
              Go to sign in
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-bg" />}>
      <InviteContent />
    </Suspense>
  );
}
