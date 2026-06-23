'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { firstError, isEmail, required } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useToast } from '@/components/ui/Toast';

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = firstError(email, [required, isEmail]);
    setError(err);
    if (err) return;
    setLoading(true);
    try {
      await apiFetch('/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  }

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
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Reset your password</h1>
          <p className="mt-1 text-sm text-fg3">
            Enter your email and we&apos;ll send you a link to choose a new password.
          </p>
        </div>

        {sent ? (
          <div className="grid gap-5">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              If an account exists for <span className="font-medium">{email}</span>, a reset link
              is on its way. The link expires in an hour.
            </div>
            <Button href="/login" variant="secondary" className="w-full">
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="grid gap-4">
            <Input
              label="Work email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@company.com"
              autoComplete="email"
              error={error}
            />
            <Button type="submit" disabled={loading} className="mt-1 w-full">
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-fg3">
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-accfg hover:opacity-80">
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
