import { fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import AuthForm from './AuthForm';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: () => new URLSearchParams(),
}));

function renderForm(mode: 'login' | 'register') {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <AuthForm mode={mode} />
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  (useRouter as jest.Mock).mockReturnValue({
    push: jest.fn(),
    replace: jest.fn(),
  });
});

describe('AuthForm — widok logowania', () => {
  it('pokazuje nagłówek, pola, przyciski OAuth', () => {
    renderForm('login');

    expect(
      screen.getByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();

    expect(
      screen.getByRole('link', { name: /Continue with GitHub/ }),
    ).toHaveAttribute('href', expect.stringContaining('/auth/github/login'));
    expect(
      screen.getByRole('link', { name: /Continue with Slack/ }),
    ).toHaveAttribute('href', expect.stringContaining('/auth/slack/login'));
  });

  it('logowanie jest wstępnie wypełnione kontem demo', () => {
    renderForm('login');
    expect(screen.getByLabelText('Work email')).toHaveValue('owner@demo.docugraph');
    expect(screen.getByLabelText('Password')).toHaveValue('Demo1234!');
  });

  it('własna walidacja: pusty submit pokazuje stylowane błędy', async () => {
    renderForm('login');
    fireEvent.change(screen.getByLabelText('Work email'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    // błędy walidacji renderowane w widoku (nie natywne)
    const errs = await screen.findAllByText(/required|valid email/i);
    expect(errs.length).toBeGreaterThan(0);
  });
});

describe('AuthForm — widok rejestracji', () => {
  it('pokazuje pole "Full name" i przycisk "Create account"', () => {
    renderForm('register');
    expect(
      screen.getByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeInTheDocument();
  });
});
