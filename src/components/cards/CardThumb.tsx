/**
 * Standardised card thumbnail.
 *
 * Every card list in the app (deck detail, manage deck) must render image
 * previews with the exact same box, radius, spacing and loading behaviour —
 * previously each list had its own markup, which produced the inconsistent
 * spacing the user reported between "provas passadas" and "histologia".
 */

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';

interface CardThumbProps {
  src?: string | null;
  /** Slightly larger box for occlusion cards is NOT allowed — keep it uniform. */
  className?: string;
}

const CardThumb = ({ src, className = '' }: CardThumbProps) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className={`relative h-11 w-16 shrink-0 overflow-hidden rounded-md border border-border/50 bg-muted/60 ${className}`}
    >
      {src ? (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" />}
          <img
            src={src}
            alt=""
            width={64}
            height={44}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            className={`h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
        </div>
      )}
    </div>
  );
};

export default CardThumb;
