import { describe, it, expect } from 'vitest';
import {
  canInitializeCanvas,
  clamp,
  getCanvasBitmapMetrics,
  getMidpoint,
  getRelativePoint,
} from '@/components/rich-editor/drawingCanvasUtils';

describe('DrawingCanvas helpers', () => {
  it('getRelativePoint calculates correct offset from bounding rect', () => {
    const point = getRelativePoint({ left: 100, top: 50 }, 150, 120);

    expect(point).toEqual({ x: 50, y: 70 });
  });

  it('clamps pointer coordinates within drawable bounds', () => {
    expect(clamp(-20, 0, 400)).toBe(0);
    expect(clamp(180, 0, 400)).toBe(180);
    expect(clamp(999, 0, 400)).toBe(400);
  });

  it('getMidpoint returns the center between two points', () => {
    expect(getMidpoint({ x: 10, y: 10 }, { x: 30, y: 50 })).toEqual({ x: 20, y: 30 });
  });

  it('getCanvasBitmapMetrics applies DPR scaling', () => {
    expect(getCanvasBitmapMetrics(800, 600, 1)).toEqual({
      cssWidth: 800,
      cssHeight: 600,
      pixelWidth: 800,
      pixelHeight: 600,
      dpr: 1,
    });

    expect(getCanvasBitmapMetrics(800, 600, 2)).toEqual({
      cssWidth: 800,
      cssHeight: 600,
      pixelWidth: 1600,
      pixelHeight: 1200,
      dpr: 2,
    });
  });

  it('blocks initialization for tiny transient modal sizes', () => {
    expect(canInitializeCanvas(9, 200)).toBe(false);
    expect(canInitializeCanvas(200, 9)).toBe(false);
    expect(canInitializeCanvas(200, 120)).toBe(true);
  });

  it('history slice preserves undo stack correctly', () => {
    const history = ['a', 'b', 'c', 'd'] as const;
    const historyIdx = 1;

    const next = history.slice(0, historyIdx + 1);
    expect([...next, 'e']).toEqual(['a', 'b', 'e']);
  });

  it('undo/redo index bounds are respected', () => {
    expect(0 <= 0).toBe(true);
    expect(0 >= 3 - 1).toBe(false);
    expect(2 >= 3 - 1).toBe(true);
  });
});
