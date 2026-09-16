'use client';

import { useId, useState, useEffect, useRef } from 'react';
import { trackEvent } from '@/lib/analytics';

type Language = 'fr' | 'es' | 'en';

const COPY: Record<Language, {
  summary: string;
  legend: string;
  ratingLabel: string;
  commentLabel: string;
  commentHint: string;
  submit: string;
  success: string;
  error: string;
}> = {
  en: {
    summary: 'Rate this tour',
    legend: 'What did you think of the tour?',
    ratingLabel: 'Rating',
    commentLabel: 'Comment (optional)',
    commentHint: 'Please avoid sharing personal information.',
    submit: 'Submit',
    success: 'Thank you for your feedback.',
    error: 'Something went wrong. Please try again.',
  },
  es: {
    summary: 'Valorar este tour',
    legend: '¿Qué te ha parecido el tour?',
    ratingLabel: 'Valoración',
    commentLabel: 'Comentario (opcional)',
    commentHint: 'Evita compartir información personal.',
    submit: 'Enviar',
    success: 'Gracias por tu comentario.',
    error: 'Algo salió mal. Inténtalo de nuevo.',
  },
  fr: {
    summary: 'Évaluer ce tour',
    legend: "Qu'avez-vous pensé de ce tour ?",
    ratingLabel: 'Note',
    commentLabel: 'Commentaire (facultatif)',
    commentHint: 'Veuillez éviter de partager des informations personnelles.',
    submit: 'Envoyer',
    success: 'Merci pour votre retour.',
    error: 'Une erreur est survenue. Veuillez réessayer.',
  },
};

export function TourFeedback({
  tourId,
  language,
}: {
  tourId: string;
  language: string;
}) {
  const lang: Language = (['fr', 'es', 'en'].includes(language.split('-')[0]) ? language.split('-')[0] : 'en') as Language;
  const copy = COPY[lang];

  const [ready, setReady] = useState(false);
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  const ratingId = useId();
  const commentId = useId();
  const sentRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.umami) {
      setReady(true);
      return;
    }
    const handler = () => setReady(true);
    window.addEventListener('umami-ready', handler);
    return () => window.removeEventListener('umami-ready', handler);
  }, []);

  useEffect(() => {
    setRating('');
    setComment('');
    setSending(false);
    setSent(false);
    setError(false);
    sentRef.current = false;
  }, [tourId]);

  if (!ready) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sentRef.current || sending) return;
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) return;
    setSending(true);
    setError(false);
    const ok = await trackEvent('tour_rating', {
      tour_id: tourId,
      language,
      rating: ratingNum,
      comment: comment.trim(),
    });
    if (ok) {
      sentRef.current = true;
      setSent(true);
    } else {
      setError(true);
    }
    setSending(false);
  };

  if (sent) {
    return (
      <div className="tour-information" role="status">
        {copy.success}
      </div>
    );
  }

  return (
    <details className="tour-information">
      <summary>{copy.summary}</summary>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <fieldset>
          <legend className="mb-2 font-medium">{copy.legend}</legend>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                htmlFor={`${ratingId}-${n}`}
                className="flex h-11 w-11 items-center justify-center rounded border border-gray-300 cursor-pointer select-none"
              >
                <input
                  type="radio"
                  id={`${ratingId}-${n}`}
                  name={ratingId}
                  value={n}
                  required
                  checked={rating === String(n)}
                  onChange={(e) => setRating(e.target.value)}
                  className="mr-1"
                />
                <span>{n}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={commentId} className="block mb-1 font-medium">
            {copy.commentLabel}
          </label>
          <textarea
            id={commentId}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={400}
            aria-describedby="comment-hint"
            className="w-full rounded border border-gray-300 p-2 min-h-11"
          />
          <p id="comment-hint" className="mt-1 text-sm text-gray-500">{copy.commentHint}</p>
        </div>
        {error && (
          <p role="alert" className="text-red-600">{copy.error}</p>
        )}
        <button
          type="submit"
          disabled={sending}
          className="h-11 px-4 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {copy.submit}
        </button>
      </form>
    </details>
  );
}
