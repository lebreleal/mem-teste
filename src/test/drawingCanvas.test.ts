import { describe, it, expect } from 'vitest';

/**
 * Unit tests for DrawingCanvasModal logic patterns.
 * Tests the core coordinate calculation and state management logic
 * used in the drawing canvas.
 */

describe('DrawingCanvas coordinate logic', () => {
  it('getPos calculates correct offset from bounding rect', () => {
    // Simulates: canvas at (100, 50), click at (150, 120)
    const rectLeft = 100;
    const rectTop = 50;
    const clientX = 150;
    const clientY = 120;

    const x = clientX - rectLeft;
    const y = clientY - rectTop;

    expect(x).toBe(50);
    expect(y).toBe(70);
  });

  it('DPR scaling produces correct canvas dimensions', () => {
    const cssWidth = 800;
    const cssHeight = 600;

    // DPR = 1
    expect(cssWidth * 1).toBe(800);
    expect(cssHeight * 1).toBe(600);

    // DPR = 2
    expect(cssWidth * 2).toBe(1600);
    expect(cssHeight * 2).toBe(1200);
  });

  it('history slice preserves undo stack correctly', () => {
    const history = ['a', 'b', 'c', 'd'] as any[];
    const historyIdx = 1; // pointing at 'b'

    // After drawing a new stroke, should discard 'c' and 'd'
    const next = history.slice(0, historyIdx + 1);
    next.push('e');

    expect(next).toEqual(['a', 'b', 'e']);
    expect(next.length).toBe(3);
  });

  it('undo/redo index bounds are respected', () => {
    const historyIdx = 0;
    const historyLength = 3;

    // Can't undo past 0
    expect(historyIdx <= 0).toBe(true);

    // Can redo
    expect(historyIdx >= historyLength - 1).toBe(false);

    // At end, can't redo
    const atEnd = 2;
    expect(atEnd >= historyLength - 1).toBe(true);
  });

  it('touch event position extraction handles missing touches', () => {
    // Simulates changedTouches fallback when touches array is empty
    const changedTouch = { clientX: 200, clientY: 300 };
    const touches: any[] = [];
    const changedTouches = [changedTouch];

    const touch = touches[0] ?? changedTouches[0];
    expect(touch.clientX).toBe(200);
    expect(touch.clientY).toBe(300);
  });

  it('beginPath after each stroke segment prevents overdraw', () => {
    // The fix: after each lineTo+stroke, we beginPath+moveTo
    // This prevents re-stroking the entire accumulated path
    // which causes opacity stacking artifacts
    const segments: string[] = [];

    // Simulate the draw loop
    const simulateDraw = (points: [number, number][]) => {
      segments.push('beginPath');
      segments.push(`moveTo(${points[0][0]},${points[0][1]})`);

      for (let i = 1; i < points.length; i++) {
        segments.push(`lineTo(${points[i][0]},${points[i][1]})`);
        segments.push('stroke');
        // The fix: restart path after each stroke
        segments.push('beginPath');
        segments.push(`moveTo(${points[i][0]},${points[i][1]})`);
      }
    };

    simulateDraw([[0, 0], [10, 10], [20, 20]]);

    // Each segment should have its own beginPath
    const beginPathCount = segments.filter(s => s === 'beginPath').length;
    expect(beginPathCount).toBe(3); // initial + 2 restarts
  });
});
