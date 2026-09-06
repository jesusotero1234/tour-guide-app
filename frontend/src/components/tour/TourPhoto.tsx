'use client';

import { useEffect, useRef, useState, useId } from 'react';
import { TourImage } from '@/types/tourImages';

interface TourPhotoProps {
  photo: TourImage;
  language?: string;
}

const STRINGS: Record<string, Record<string, string>> = {
  en: {
    view: 'View',
    enlarge: 'Enlarge photo',
    close: 'Close',
    credits: 'Photo credits',
    unavailable: 'Image unavailable',
    changes: 'Changes',
  },
  es: {
    view: 'Ver',
    enlarge: 'Ampliar foto',
    close: 'Cerrar',
    credits: 'Créditos de la foto',
    unavailable: 'Imagen no disponible',
    changes: 'Cambios',
  },
  fr: {
    view: 'Voir',
    enlarge: 'Agrandir la photo',
    close: 'Fermer',
    credits: 'Crédits de la photo',
    unavailable: 'Image indisponible',
    changes: 'Modifications',
  },
  de: {
    view: 'Ansehen',
    enlarge: 'Foto vergrößern',
    close: 'Schließen',
    credits: 'Foto-Credits',
    unavailable: 'Bild nicht verfügbar',
    changes: 'Änderungen',
  },
  it: {
    view: 'Visualizza',
    enlarge: 'Ingrandisci foto',
    close: 'Chiudi',
    credits: 'Crediti foto',
    unavailable: 'Immagine non disponibile',
    changes: 'Modifiche',
  },
};

export function TourPhoto({ photo, language }: TourPhotoProps) {
  const lang = (language || 'en').toLowerCase().split('-')[0];
  const t = STRINGS[lang] || STRINGS.en;
  const dialogId = useId();
  const [showModal, setShowModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const prevOverflow = useRef<string | null>(null);
  const hasOpened = useRef(false);

  useEffect(() => {
    if (showModal) {
      hasOpened.current = true;
      prevOverflow.current = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialogRef.current?.showModal();
      closeRef.current?.focus();
    } else {
      if (hasOpened.current) {
        if (prevOverflow.current !== null) {
          document.body.style.overflow = prevOverflow.current;
          prevOverflow.current = null;
        }
        triggerRef.current?.focus();
      }
    }
  }, [showModal]);

  useEffect(() => {
    return () => {
      if (prevOverflow.current !== null) {
        document.body.style.overflow = prevOverflow.current;
      }
    };
  }, []);

  const openModal = () => {
    setShowModal(true);
  };

  const closeModal = () => {
    dialogRef.current?.close();
    setShowModal(false);
  };

  const handleImgError = () => {
    setImgError(true);
  };

  const credits = (
    <div className="mt-3 text-xs text-darkBrown/70">
      <p className="font-semibold">{t.credits}</p>
      <p className="mt-1">
        <a
          href={photo.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-darkBrown"
        >
          {photo.sourceTitle}
        </a>
      </p>
      {photo.author && <p className="mt-1">{photo.author}</p>}
      {photo.attribution && photo.attribution !== photo.author && (
        <p className="mt-1">{photo.attribution}</p>
      )}
      {photo.license && (
        <p className="mt-1">
          <a
            href={photo.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-darkBrown"
          >
            {photo.license}
          </a>
        </p>
      )}
      {photo.changes !== 'none' && (
        <p className="mt-1">
          <span className="font-semibold">{t.changes}:</span> {photo.changes}
        </p>
      )}
    </div>
  );

  const isDetail = photo.role === 'detail';

  const renderImage = () => {
    if (imgError) {
      return <p className="text-sm text-darkBrown/60">{t.unavailable}</p>;
    }
    return (
      // Wikimedia thumbnails retain their aspect ratio and have per-file attribution.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo.url}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading="lazy"
        onError={handleImgError}
        className="h-44 w-full rounded-xl bg-darkBrown/5 object-contain sm:h-52"
      />
    );
  };

  const renderModalImage = () => {
    if (imgError) {
      return <p className="text-sm text-darkBrown/60">{t.unavailable}</p>;
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo.url}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        onError={handleImgError}
        className="max-h-[65dvh] w-auto rounded-xl object-contain"
      />
    );
  };

  return (
    <figure className="mb-4">
      {isDetail ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={openModal}
          className="min-h-11 w-full cursor-pointer rounded-xl px-4 text-sm font-medium text-darkBrown focus-visible:ring-2 focus-visible:ring-darkBrown/40 focus-visible:outline-none"
        >
          {t.view}: {photo.caption}
        </button>
      ) : (
        <>
          <button
            ref={triggerRef}
            type="button"
            onClick={openModal}
            aria-label={`${t.enlarge}: ${photo.caption}`}
            disabled={imgError}
            className="block w-full cursor-pointer rounded-xl focus-visible:ring-2 focus-visible:ring-darkBrown/40 focus-visible:outline-none"
          >
            {renderImage()}
          </button>
          <figcaption className="mt-2 text-sm text-darkBrown/80">{photo.caption}</figcaption>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-darkBrown/70">{t.credits}</summary>
            {credits}
          </details>
        </>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={dialogId}
        onClose={() => setShowModal(false)}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl bg-surface-elevated p-5 shadow-lg backdrop:bg-black/70"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={dialogId} className="text-lg font-serif font-bold text-darkBrown">
            {photo.caption}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={closeModal}
            className="min-h-11 rounded-lg px-4 text-sm font-medium text-darkBrown focus-visible:ring-2 focus-visible:ring-darkBrown/40 focus-visible:outline-none"
          >
            {t.close}
          </button>
        </div>
        <div className="flex justify-center">
          {showModal && renderModalImage()}
        </div>
        {credits}
      </dialog>
    </figure>
  );
}
