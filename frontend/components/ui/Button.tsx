import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary';

const base =
  'inline-flex items-center justify-center gap-2 rounded-[9px] px-[15px] py-[9px] text-[13.5px] font-semibold transition disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary: 'bg-acc text-white hover:opacity-90',
  secondary: 'border border-line bg-card text-fg2 hover:bg-rowhover',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  href?: string;
}

/** Spójny przycisk; jako <button> lub (z `href`) jako <a>. */
export function Button({
  variant = 'primary',
  className,
  href,
  children,
  ...rest
}: ButtonProps) {
  const classes = cn(base, variants[variant], className);
  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
