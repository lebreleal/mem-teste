export const MIN_CANVAS_SIZE = 10;

export interface RelativePoint {
  x: number;
  y: number;
}

export interface CanvasBitmapMetrics {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
}

export const getRelativePoint = (
  rect: Pick<DOMRect | DOMRectReadOnly, 'left' | 'top'>,
  clientX: number,
  clientY: number,
): RelativePoint => ({
  x: clientX - rect.left,
  y: clientY - rect.top,
});

export const getCanvasBitmapMetrics = (
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): CanvasBitmapMetrics => ({
  cssWidth,
  cssHeight,
  pixelWidth: Math.round(cssWidth * dpr),
  pixelHeight: Math.round(cssHeight * dpr),
  dpr,
});

export const canInitializeCanvas = (width: number, height: number) => (
  width >= MIN_CANVAS_SIZE && height >= MIN_CANVAS_SIZE
);
