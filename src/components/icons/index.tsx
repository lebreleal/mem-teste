/**
 * Centralized Icon Library — Clean Architecture
 * All custom SVG icons used across the app live here.
 * Import from '@/components/icons' everywhere.
 */
import React from 'react';

interface IconProps {
  className?: string;
  active?: boolean;
}

/* ─── Image / Media ─── */
export const IconImage = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M20 7V6H4v5.586L6.586 9a2 2 0 0 1 2.828 0l3.086 3.086L13.586 11a2 2 0 0 1 2.828 0L20 14.586zm2 9.999V5.882C22 4.842 21.147 4 20.095 4H3.905A1.894 1.894 0 0 0 2 5.882v12.236C2 19.158 2.853 20 3.905 20h16.19A1.894 1.894 0 0 0 22 18.118v-1.119m-2 .352-5-4.937-1.086 1.086 1.793 1.793a1 1 0 0 1-1.414 1.414l-2.5-2.5L8 10.414l-4 4V18h16z" clipRule="evenodd" />
  </svg>
);

export const IconImageOcclusion = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M2 18v-1.5h2V18h2v2H4a2 2 0 0 1-2-2M4 4h2v2H4v1.5H2V6a2 2 0 0 1 2-2M3.486 13.5H2v-3h2L6.586 8a2 2 0 0 1 2.828 0L13 11.586l.586-.586a2 2 0 0 1 2.828 0l5.086 5 .5.5V18a2 2 0 0 1-2 2h-2v-2h2v-.586l-5-5-.586.586 1.293 1.293a1 1 0 0 1-1.414 1.414L8 9.414 4.5 13l-.5.5h-.514M10 6V4h4v2zM18 6V4h2a2 2 0 0 1 2 2v1.5h-2V6zM20 10.5h2v3h-2z" />
    <path d="M14 18v2h-4v-2z" />
  </svg>
);

export const IconUpload = ({ className = 'h-8 w-8 text-muted-foreground' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

/* ─── Drawing Tools ─── */
export const IconRect = ({ className = 'h-5 w-5', active }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

export const IconPolygon = ({ className = 'h-5 w-5', active }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} className={className}>
    <path d="M12 2l9 7-3.5 10h-11L3 9z" />
  </svg>
);

export const IconFreehand = ({ className = 'h-5 w-5', active }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" className={className}>
    <path d="M7.5 18s6.269-1.673 9.5-7c1.601-2.64-6.5-.5-8-3-1.16-2.5 8-3 8-3" />
  </svg>
);

export const IconEraser = ({ className = 'h-5 w-5', active }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} className={className}>
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </svg>
);

export const IconHand = ({ className = 'h-6 w-6' }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 11.5V14m0-2.5v-6a1.5 1.5 0 1 1 3 0m-3 6a1.5 1.5 0 0 0-3 0v2C6 17 7 21 12 21s6-4 6-7.5v-6a1.5 1.5 0 0 0-3 0m-3-2V11m0-5.5v-1a1.5 1.5 0 0 1 3 0v3m0 0V11" />
  </svg>
);

/* ─── Eye / Preview ─── */
export const IconEyeOpen = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" fillRule="evenodd" d="M12 5c7 0 10 7 10 7s-3 7-10 7S2 12 2 12s3-7 10-7m0 2c-2.764 0-4.77 1.364-6.16 2.86a12.4 12.4 0 0 0-1.543 2.07L4.255 12l.042.07a12.4 12.4 0 0 0 1.544 2.07C7.23 15.636 9.236 17 12 17s4.77-1.364 6.16-2.86a12.4 12.4 0 0 0 1.543-2.07l.042-.07-.042-.07a12.4 12.4 0 0 0-1.544-2.07C16.77 8.365 14.764 7 12 7m0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6" clipRule="evenodd" />
  </svg>
);

export const IconEyeClosed = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
    <rect width="2" height="24.106" x="2.833" y="4.246" fill="currentColor" rx="1" transform="rotate(-45 2.833 4.246)" />
    <path fill="currentColor" fillRule="evenodd" d="M4.319 8.561C2.733 10.291 2 12 2 12s3 7 10 7c.88 0 1.697-.11 2.453-.304l-1.728-1.728A8 8 0 0 1 12 17c-2.764 0-4.77-1.364-6.16-2.86a12.4 12.4 0 0 1-1.543-2.07L4.255 12l.042-.07a12.4 12.4 0 0 1 1.437-1.953zm13.947 5.462a12.4 12.4 0 0 0 1.437-1.952l.042-.071-.042-.07a12.4 12.4 0 0 0-1.544-2.07C16.77 8.365 14.764 7 12 7q-.372 0-.725.032L9.547 5.304A9.9 9.9 0 0 1 12 5c7 0 10 7 10 7s-.733 1.71-2.318 3.439z" clipRule="evenodd" />
  </svg>
);

/* ─── AI / Sparkle ─── */
export const IconSparkle = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20" className={className}>
    <path fill="currentColor" fillRule="evenodd" d="m5.745 3.156.242.483c.08.161.211.292.373.373l.483.241a.833.833 0 0 1 0 1.49l-.483.242a.83.83 0 0 0-.373.373l-.242.483a.833.833 0 0 1-1.49 0l-.242-.483a.83.83 0 0 0-.373-.373l-.483-.241a.833.833 0 0 1 0-1.49l.483-.242a.83.83 0 0 0 .373-.373l.242-.483a.833.833 0 0 1 1.49 0m6.25 1.47a.833.833 0 0 0-1.49 0l-.881 1.762a5.83 5.83 0 0 1-2.61 2.609l-1.762.881a.833.833 0 0 0 0 1.49l1.763.882a5.83 5.83 0 0 1 2.609 2.609l.88 1.762a.833.833 0 0 0 1.491 0l.882-1.762a5.83 5.83 0 0 1 2.608-2.609l1.763-.881a.833.833 0 0 0 0-1.49l-1.763-.882a5.83 5.83 0 0 1-2.608-2.609z" clipRule="evenodd" />
  </svg>
);

export const IconAIGradient = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
    <path fill="url(#ai_toolbar_grad)" fillRule="evenodd" d="m6.894 3.787.29.58a1 1 0 0 0 .447.447l.58.29a1 1 0 0 1 0 1.789l-.58.29a1 1 0 0 0-.447.447l-.29.58a1 1 0 0 1-1.788 0l-.29-.58a1 1 0 0 0-.447-.447l-.58-.29a1 1 0 0 1 0-1.79l.58-.289a1 1 0 0 0 .447-.447l.29-.58a1 1 0 0 1 1.788 0m7.5 1.764a1 1 0 0 0-1.788 0l-1.058 2.115a7 7 0 0 1-3.13 3.13l-2.115 1.058a1 1 0 0 0 0 1.789L8.418 14.7a7 7 0 0 1 3.13 3.13l1.058 2.116a1 1 0 0 0 1.788 0l1.058-2.115a7 7 0 0 1 3.13-3.13l2.115-1.058a1 1 0 0 0 0-1.79l-2.115-1.057a7 7 0 0 1-3.13-3.13zm-1.057 3.01.163-.327.163.326a9 9 0 0 0 4.025 4.025l.326.163-.326.163a9 9 0 0 0-4.025 4.025l-.163.326-.163-.326a9 9 0 0 0-4.025-4.025l-.326-.163.326-.163a9 9 0 0 0 4.025-4.025" clipRule="evenodd" />
    <defs><linearGradient id="ai_toolbar_grad" x1="3.236" x2="22.601" y1="3.234" y2="4.913" gradientUnits="userSpaceOnUse"><stop stopColor="#00B3FF" /><stop offset="0.33" stopColor="#3347FF" /><stop offset="0.66" stopColor="#FF306B" /><stop offset="1" stopColor="#FF9B23" /></linearGradient></defs>
  </svg>
);

/* ─── Cloze ─── */
export const IconCloze = ({ className = 'h-3.5 w-3.5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M3 17.25V19a2 2 0 0 0 2 2h1.75v-2H5v-1.75zm0-3.5h2v-3.5H3zm0-7h2V5h1.75V3H5a2 2 0 0 0-2 2zM10.25 3v2h3.5V3zm7 0v2H19v1.75h2V5a2 2 0 0 0-2-2zM21 10.25h-2v3.5h2zm0 7h-2V19h-1.75v2H19a2 2 0 0 0 2-2zM13.75 21v-2h-3.5v2z" clipRule="evenodd" />
  </svg>
);

export const IconClozePlus = ({ className = 'h-3.5 w-3.5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M3 17.25V19a2 2 0 0 0 2 2h1.75v-2H5v-1.75zm0-3.5h2v-3.5H3zm0-7h2V5h1.75V3H5a2 2 0 0 0-2 2zM10.25 3v2h3.5V3zm7 0v2H19v1.75h2V5a2 2 0 0 0-2-2zM21 10.25h-2v3.5h2zm0 7h-2V19h-1.75v2H19a2 2 0 0 0 2-2zM13.75 21v-2h-3.5v2z" clipRule="evenodd" />
    <path d="M13 8h-2v3H8v2h3v3h2v-3h3v-2h-3z" />
  </svg>
);

/* ─── Drawing / Pen ─── */
export const IconDrawing = ({ className = 'h-3.5 w-3.5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M14.78 10.746 13 11l.254-1.78a1 1 0 0 1 .283-.565l3.65-3.65 1.807 1.809-3.65 3.649a1 1 0 0 1-.565.283M19.704 6.104l-1.808-1.808 1.026-1.026a1 1 0 0 1 1.414 0l.394.394a1 1 0 0 1 0 1.414zM11.873 11.354c-1.267-1.35-2.71-2.42-4.034-2.934-.66-.257-1.366-.405-2.039-.31-.714.1-1.35.473-1.756 1.147-.443.735-.579 1.498-.465 2.241.11.718.441 1.357.833 1.899.746 1.035 1.867 1.93 2.675 2.576l.065.051q.415.33.763.605c.835.659 1.397 1.102 1.771 1.523.217.244.31.42.352.558.026.09.041.2.026.35h-.032c-.343-.006-.892-.137-1.582-.413-1.366-.548-2.897-1.509-3.743-2.354a1 1 0 0 0-1.414 1.415c1.078 1.076 2.855 2.17 4.413 2.795.772.31 1.588.544 2.293.556.353.006.766-.042 1.142-.244.415-.223.716-.598.832-1.083.129-.542.136-1.07-.018-1.59-.152-.511-.437-.939-.774-1.318-.503-.567-1.256-1.16-2.12-1.839q-.322-.253-.66-.523c-.868-.693-1.792-1.436-2.367-2.235-.28-.388-.433-.73-.478-1.03-.042-.275-.004-.567.201-.908.07-.115.152-.175.321-.199.211-.03.556.007 1.037.194.958.372 2.161 1.225 3.3 2.439a1 1 0 1 0 1.458-1.369" />
  </svg>
);

/* ─── Text Color ─── */
export const IconTextColor = ({ className = 'h-3.5 w-3.5', currentColor }: IconProps & { currentColor?: string }) => (
  <span className="relative inline-flex items-center justify-center">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 6 7.226 19.367a.953.953 0 0 1-1.801-.625L9.94 5.36A2 2 0 0 1 11.836 4h.328a2 2 0 0 1 1.895 1.36l4.516 13.382a.953.953 0 0 1-1.801.625z" />
      <path d="M8 14h8v2H8z" />
    </svg>
    {currentColor && (
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-3.5 rounded-full" style={{ backgroundColor: currentColor }} />
    )}
  </span>
);

/* ─── Link ─── */
export const IconLink = ({ className = 'h-3.5 w-3.5' }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

/* ─── Close / X ─── */
export const IconClose = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M16.293 17.707a1 1 0 0 0 1.414-1.414L13.414 12l4.293-4.293a1 1 0 0 0-1.414-1.414L12 10.586 7.707 6.293a1 1 0 0 0-1.414 1.414L10.586 12l-4.293 4.293a1 1 0 1 0 1.414 1.414L12 13.414z" clipRule="evenodd" />
  </svg>
);

/* ─── Checkmark ─── */
export const IconCheck = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M20.707 6.299a1 1 0 0 1 0 1.414L9.713 18.707a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414l4.293 4.293L19.293 6.299a1 1 0 0 1 1.414 0" clipRule="evenodd" />
  </svg>
);

/* ─── Info / Question ─── */
export const IconInfo = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" d="M11 17a1 1 0 1 0 2 0 1 1 0 0 0-2 0m1-15a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m0-14a4 4 0 0 0-3.841 2.885c-.174.6.347 1.115.971 1.115.48 0 .854-.407 1.056-.842A2 2 0 0 1 14 10c0 1.77-2.348 1.778-2.89 4.007-.13.537.338.993.89.993s.977-.47 1.217-.968C13.907 12.607 16 12.088 16 10a4 4 0 0 0-4-4" />
  </svg>
);

/* ─── Swap / Invertido ─── */
export const IconSwap = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" />
  </svg>
);

/* ─── Trash / Delete ─── */
export const IconTrash = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" fillRule="evenodd" d="M7 2a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2zm-.585 4a2.5 2.5 0 0 0-2.473 2.87l1.581 10.574A3 3 0 0 0 8.49 22h7.02a3 3 0 0 0 2.967-2.556l1.58-10.574A2.5 2.5 0 0 0 17.586 6zM6 8h12.08C17.827 9.825 16 20 16 20H8S6.232 9.782 6 8" clipRule="evenodd" />
  </svg>
);

/* ─── Cursor / Select ─── */
export const IconCursor = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M4 2l14 10.5-5.5 1.5L16 21l-3 1-3.5-7L4 18z" />
  </svg>
);
