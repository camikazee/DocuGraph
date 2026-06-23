'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { firstError, minLength, required } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useToast } from '@/components/ui/Toast';

function ResetForm() {
  const router = useRouter();
  const { toast } = useToast();
  const token = useSearchParams().get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string | null; confirm?: string | null }>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = {
      password: firstError(password, [required, minLength(8)]),
      confirm: confirm !== password ? 'Passwords do not match' : null,
    };
    setErrors(next);
    if (next.password || next.confirm) return;
    setLoading(true);
    try {
      await apiFetch('/auth/reset', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      toast('Password updated — please sign in', 'success');
      router.push('/login');
    } catch (err) {
      toast(
        err instanceof ApiError ? err.message : 'Could not reset password',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="grid gap-5">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          This reset link is missing its token. Request a fresh one to continue.
        </div>
        <Button href="/forgot-password" className="w-full">
          Request a new link
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <Input
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="••••••••"
        autoComplete="new-password"
        error={errors.password}
      />
      <Input
        label="Confirm new password"
        type="password"
        value={confirm}
        onChange={setConfirm}
        placeholder="••••••••"
        autoComplete="new-password"
        error={errors.confirm}
      />
      <Button type="submit" disabled={loading} className="mt-1 w-full">
        {loading ? 'Updating…' : 'Set new password'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-5 top-5">
        <ThemeSwitcher />
      </div>
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-30 blur-[120px]"
        style={{ background: 'radial-gradient(circle,var(--acc),transparent 70%)' }}
      />

      <Card className="relative w-full max-w-md p-8 backdrop-blur">
        <div className="mb-7">
          <div className="mb-5">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Choose a new password</h1>
          <p className="mt-1 text-sm text-fg3">
            Pick a strong password you don&apos;t use elsewhere.
          </p>
        </div>

        <Suspense fallback={<div className="py-8 text-center text-sm text-fg3">Loading…</div>}>
          <ResetForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-fg3">
          Back to{' '}
          <Link href="/login" className="font-medium text-accfg hover:opacity-80">
            sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
