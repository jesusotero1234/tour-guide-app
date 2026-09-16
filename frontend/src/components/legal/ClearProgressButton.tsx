'use client';
import { useState } from 'react';
export function ClearProgressButton({ french = false }: { french?: boolean }) {
  const [message, setMessage] = useState('');
  function clear() {
    try {
      Object.keys(localStorage).filter(key => /^(tour-listening:|tour-progress:|tour-selection:|tour-reading:|tour-notice:|tour-welcome:)/.test(key)).forEach(key => localStorage.removeItem(key));
      setMessage(french ? 'Progression et préférences effacées sur cet appareil.' : 'Progreso y preferencias borrados en este dispositivo.');
    } catch {
      setMessage(french ? 'Le navigateur ne permet pas d’effacer les données.' : 'El navegador no permite borrar los datos.');
    }
  }
  return <div><button type="button" onClick={clear} className="min-h-11 underline">{french ? 'Effacer progression et préférences' : 'Borrar progreso y preferencias'}</button><p role="status">{message}</p></div>;
}
