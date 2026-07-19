'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiBaseUrl, apiFetch, ApiError } from '@/lib/api';
import { setToken } from '@/lib/auth';
import { firstError, isEmail, minLength, required } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/Divider';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useToast } from '@/components/ui/Toast';
import { GithubIcon, SlackIcon } from '@/components/ui/icons';

interface AuthResult {
  accessToken: string;
}

interface FieldErrors {
  name?: string | null;
  email?: string | null;
  password?: string | null;
}

/** Zezwól tylko na wewnętrzne ścieżki (bez open-redirect na obce hosty). */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

function AuthFormInner({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const { toast } = useToast();
  const isRegister = mode === 'register';
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const withNext = (base: string) =>
    next === '/dashboard' ? base : `${base}?next=${encodeURIComponent(next)}`;

  const [name, setName] = useState('');
  // Logowanie wstępnie wypełnione kontem demo (ułatwia podgląd).
  const [email, setEmail] = useState(isRegister ? '' : 'owner@demo.docugraph');
  const [password, setPassword] = useState(isRegister ? '' : 'Demo1234!');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const next: FieldErrors = {
      email: firstError(email, [required, isEmail]),
      password: firstError(password, [
        required,
        minLength(isRegister ? 8 : 1),
      ]),
    };
    if (isRegister) {
      next.name = firstError(name, [required, minLength(2)]);
    }
    setErrors(next);
    return !next.name && !next.email && !next.password;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const path = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister
        ? { name, email, password }
        : { email, password };
      const res = await apiFetch<AuthResult>(path, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setToken(res.accessToken);
      toast(isRegister ? 'Account created' : 'Signed in', 'success');
      router.push(next);
    } catch (err) {
      toast(
        err instanceof ApiError ? err.message : 'Something went wrong',
        'error',
      );
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
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-sm text-fg3">
            {isRegister
              ? 'Start organizing your repository documentation'
              : 'Sign in to manage your repository documentation'}
          </p>
        </div>

        <div className="grid gap-2">
          <Button
            variant="secondary"
            href={`${apiBaseUrl}/auth/github/login`}
            className="w-full"
          >
            <GithubIcon /> Continue with GitHub
          </Button>
          <Button
            variant="secondary"
            href={`${apiBaseUrl}/auth/slack/login`}
            className="w-full"
          >
            <SlackIcon /> Continue with Slack
          </Button>
        </div>

        <div className="my-6">
          <Divider label="or continue with email" />
        </div>

        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          {isRegister && (
            <Input
              label="Full name"
              value={name}
              onChange={setName}
              placeholder="Ada Lovelace"
              autoComplete="name"
              error={errors.name}
            />
          )}
          <Input
            label="Work email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@company.com"
            autoComplete="email"
            error={errors.email}
          />
          <div>
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              error={errors.password}
            />
            {!isRegister && (
              <Link
                href="/forgot-password"
                className="mt-1.5 block w-full text-right text-[12px] text-accfg hover:opacity-80"
              >
                Forgot?
              </Link>
            )}
          </div>

          <Button type="submit" disabled={loading} className="mt-1 w-full">
            {loading
              ? 'Please wait…'
              : isRegister
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-fg3">
          {isRegister ? (
            <>
              Already have an account?{' '}
              <Link
                href={withNext('/login')}
                className="font-medium text-accfg hover:opacity-80"
              >
                Sign in
              </Link>
            </>
          ) : (
            <>
              Don&apos;t have an account?{' '}
              <Link
                href={withNext('/register')}
                className="font-medium text-accfg hover:opacity-80"
              >
                Sign up
              </Link>
            </>
          )}
        </p>
      </Card>
    </main>
  );
}

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-bg" />}>
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}
