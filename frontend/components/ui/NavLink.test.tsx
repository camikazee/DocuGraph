import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { NavLink } from './NavLink';

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));

describe('NavLink', () => {
  it('podświetla aktywną trasę', () => {
    (usePathname as jest.Mock).mockReturnValue('/dashboard');
    render(<NavLink href="/dashboard">Overview</NavLink>);
    expect(screen.getByRole('link', { name: 'Overview' }).className).toContain(
      'text-slate-100',
    );
  });

  it('nieaktywna trasa jest przygaszona', () => {
    (usePathname as jest.Mock).mockReturnValue('/other');
    render(<NavLink href="/dashboard">Overview</NavLink>);
    expect(screen.getByRole('link', { name: 'Overview' }).className).toContain(
      'text-slate-400',
    );
  });
});
