'use client';
import { useState } from 'react';
import type { Language } from '@/types/api';
import { privacyCopy } from '@/lib/privacyCopy';
export function ClearProgressButton({ language = 'es' }: { language?: Language }) {
  const t = privacyCopy[language];
  const [message, setMessage] = useState('');
  function clear() {
    try {
      Object.keys(localStorage).filter(key => /^(tour-listening:|tour-progress:|tour-selection:|tour-reading:|tour-notice:|tour-welcome:)/.test(key)).forEach(key => localStorage.removeItem(key));
      setMessage(t.cleared);
    } catch {
      setMessage(t.clearError);
    }
  }
  return <div><button type="button" onClick={clear} className="min-h-11 underline">{t.clear}</button><p role="status">{message}</p></div>;
}
