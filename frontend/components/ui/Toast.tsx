'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { cn } from '@/lib/cn';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;
const LIFETIME = 4500;

const VARIANT: Record<
  ToastVariant,
  { title: string; ring: string; chip: string; bar: string; icon: JSX.Element }
> = {
  success: {
    title: 'Success',
    ring: 'border-emerald-500/30',
    chip: 'bg-emerald-500/15 text-emerald-400',
    bar: 'bg-emerald-400',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="m3.5 8.5 3 3 6-6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  error: {
    title: 'Something went wrong',
    ring: 'border-red-500/35',
    chip: 'bg-red-500/15 text-red-400',
    bar: 'bg-red-400',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  info: {
    title: 'Heads up',
    ring: 'border-acc/35',
    chip: 'bg-accsoft text-accfg',
    bar: 'bg-acc',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M8 7.5v3.5M8 5h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((s) => s.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++nextId;
    setItems((s) => [...s, { id, message, variant }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2.5">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const v = VARIANT[item.variant];

  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(dismiss, LIFETIME);
    return () => clearTimeout(timer);
  }, [dismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={dismiss}
      style={{
        animation: leaving
          ? 'toast-out 0.2s ease forwards'
          : 'toast-in 0.26s cubic-bezier(0.21,1.02,0.73,1) both',
      }}
      className={cn(
        'pointer-events-auto cursor-pointer overflow-hidden rounded-xl border bg-card/95 shadow-xl ring-1 ring-black/5 backdrop-blur',
        v.ring,
      )}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span className={cn('mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg', v.chip)}>
          {v.icon}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[12.5px] font-semibold text-fg">{v.title}</div>
          <div className="mt-0.5 break-words text-[12.5px] leading-snug text-fg3">{item.message}</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-md text-fg3 transition hover:bg-rowhover hover:text-fg"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {!leaving && (
        <div className="h-0.5 w-full bg-line2">
          <div
            className={cn('h-full origin-left', v.bar)}
            style={{ animation: `toast-progress ${LIFETIME}ms linear forwards` }}
          />
        </div>
      )}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
