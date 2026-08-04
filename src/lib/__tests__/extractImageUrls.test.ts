import { describe, it, expect } from 'vitest';
import { extractImageUrls } from '@/lib/studyUtils';

describe('extractImageUrls', () => {
  it('returns an empty array for empty content', () => {
    expect(extractImageUrls('')).toEqual([]);
  });

  it('extracts URLs from HTML img tags', () => {
    const html = '<p>oi</p><img src="https://cdn.test/a.webp" /><img src="https://cdn.test/b.webp">';
    expect(extractImageUrls(html)).toEqual([
      'https://cdn.test/a.webp',
      'https://cdn.test/b.webp',
    ]);
  });

  it('extracts the imageUrl of an image-occlusion JSON payload', () => {
    const json = JSON.stringify({
      imageUrl: 'https://cdn.test/occlusion.webp',
      rects: [{ id: '1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
      canvasWidth: 800,
      canvasHeight: 600,
    });
    expect(extractImageUrls(json)).toEqual(['https://cdn.test/occlusion.webp']);
  });

  it('handles mixed HTML and occlusion JSON in the same string', () => {
    const mixed = `${JSON.stringify({ imageUrl: 'https://cdn.test/front.webp' })}<img src="https://cdn.test/back.webp" />`;
    expect(extractImageUrls(mixed)).toEqual([
      'https://cdn.test/back.webp',
      'https://cdn.test/front.webp',
    ]);
  });

  it('deduplicates repeated URLs', () => {
    const content = '<img src="https://cdn.test/a.webp" /><img src="https://cdn.test/a.webp" />';
    expect(extractImageUrls(content)).toEqual(['https://cdn.test/a.webp']);
  });

  it('unescapes escaped slashes coming from JSON serializers', () => {
    const content = '{"imageUrl":"https:\\/\\/cdn.test\\/x.webp"}';
    expect(extractImageUrls(content)).toEqual(['https://cdn.test/x.webp']);
  });

  it('returns nothing for content without images', () => {
    expect(extractImageUrls('<p>apenas texto</p>')).toEqual([]);
    expect(extractImageUrls('{"clozeTarget":1,"extra":""}')).toEqual([]);
  });

  it('is stateless across calls (regex lastIndex is reset)', () => {
    const content = '<img src="https://cdn.test/a.webp" />';
    expect(extractImageUrls(content)).toEqual(['https://cdn.test/a.webp']);
    expect(extractImageUrls(content)).toEqual(['https://cdn.test/a.webp']);
  });
});
