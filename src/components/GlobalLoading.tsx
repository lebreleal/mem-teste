/**
 * Global loading overlay triggered via custom events.
 *
 * Usage anywhere:
 *   window.dispatchEvent(new CustomEvent('global-loading', { detail: true }));
 *   // ... after work is done ...
 *   window.dispatchEvent(new CustomEvent('global-loading', { detail: false }));
 *
 * Or use the helper:
 *   import { showGlobalLoading, hideGlobalLoading } from '@/components/GlobalLoading';
 */

import { useEffect, useState } from 'react';

export function showGlobalLoading() {
  window.dispatchEvent(new CustomEvent('global-loading', { detail: true }));
}

export function hideGlobalLoading() {
  window.dispatchEvent(new CustomEvent('global-loading', { detail: false }));
}

const GlobalLoading = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const show = (e as CustomEvent<boolean>).detail;
      setVisible(show);
    };
    window.addEventListener('global-loading', handler);
    return () => window.removeEventListener('global-loading', handler);
  }, []);

  // Auto-hide safety net (max 5s)
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/60 backdrop-blur-[2px] animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary/30 border-t-primary" />
      </div>
    </div>
  );
};

export default GlobalLoading;
