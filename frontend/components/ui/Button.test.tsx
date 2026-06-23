import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renderuje <button> domyślnie', () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  });

  it('renderuje <a> gdy podano href', () => {
    render(<Button href="/go">Go</Button>);
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link).toHaveAttribute('href', '/go');
  });
});
