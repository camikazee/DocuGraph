'use client';

import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

const SIZES = {
  sm: 'max-w-[400px]',
  md: 'max-w-[460px]',
  lg: 'max-w-[620px]',
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Szerokość panelu. */
  size?: keyof typeof SIZES;
  /** Własna stopka — jeśli podana, ignoruje wbudowane przyciski. */
  footer?: React.ReactNode;
  /** Wbudowana stopka: po podaniu `onSubmit` pokazuje Cancel + przycisk akcji. */
  onSubmit?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  /** Blokuje przyciski i zamykanie (np. podczas zapisu). */
  submitting?: boolean;
  /** Wyłącza przycisk akcji (np. niepoprawny formularz). */
  submitDisabled?: boolean;
  /** Tekst po lewej w stopce (np. „Saved to your account"). */
  hint?: string;
}

/**
 * Bazowy modal do edycji mniejszych rzeczy: nagłówek + X, treść (`children`)
 * i opcjonalna stopka z akcjami. Zamknięcie: Esc, klik w tło lub X.
 *
 *   <Modal open={editing} onClose={close} title="Edit profile"
 *          onSubmit={save} submitting={saving} hint="Saved to your account">
 *     …pola formularza…
 *   </Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
  onSubmit,
  submitLabel = 'Save changes',
  cancelLabel = 'Cancel',
  submitting = false,
  submitDisabled = false,
  hint,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    (firstFocusable ?? dialog)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;
  const showDefaultFooter = !footer && !!onSubmit;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full overflow-hidden rounded-2xl border border-capbd bg-panel shadow-[0_24px_60px_-12px_rgba(0,0,0,.6)]',
          SIZES[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-line2 px-5 py-4">
          <h2 id={titleId} className="text-[15px] font-bold text-fg">
            {title}
          </h2>
          <button
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="text-fg3 transition hover:text-fg"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5">{children}</div>

        {footer && <div className="border-t border-line2 px-5 py-4">{footer}</div>}
        {showDefaultFooter && (
          <div className="flex items-center gap-3 border-t border-line2 px-5 py-4">
            {hint && <span className="text-[11.5px] text-fg3">{hint}</span>}
            <div className="ml-auto flex gap-2.5">
              <Button variant="secondary" onClick={onClose} disabled={submitting}>
                {cancelLabel}
              </Button>
              <Button onClick={onSubmit} disabled={submitting || submitDisabled}>
                {submitLabel}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
