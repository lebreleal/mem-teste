import { describe, it, expect } from 'vitest';
import { deduplicateGeneratedCards, answerKey, contentWords } from '@/lib/cardDedup';
import type { GeneratedCard } from '@/types/ai';

const cloze = (front: string): GeneratedCard => ({ front, back: '', type: 'cloze' });
const basic = (front: string, back: string): GeneratedCard => ({ front, back, type: 'basic' });

describe('answerKey', () => {
  it('uses cloze answers, order-independent', () => {
    expect(answerKey(cloze('A {{c1::rafe}} e o {{c2::palato}}.')))
      .toBe(answerKey(cloze('O {{c1::palato}} e a {{c2::rafe}}.')));
  });

  it('falls back to the back of a basic card', () => {
    expect(answerKey(basic('Qual artéria irriga?', 'A artéria maxilar.'))).toBe('a arteria maxilar');
  });
});

describe('contentWords', () => {
  it('drops stopwords and short tokens', () => {
    expect([...contentWords('A linha que divide o palato')]).toEqual(['linha', 'divide', 'palato']);
  });
});

describe('deduplicateGeneratedCards', () => {
  it('keeps distinct cards untouched', () => {
    const cards = [
      cloze('O palato ósseo é formado pelo {{c1::processo palatino da maxila}}.'),
      basic('Qual nervo garante a sensibilidade da cavidade oral?', 'O nervo trigêmeo.'),
    ];
    expect(deduplicateGeneratedCards(cards)).toHaveLength(2);
  });

  it('removes exact duplicates', () => {
    const c = cloze('A {{c1::mucosa jugal}} reveste a face interna das bochechas.');
    expect(deduplicateGeneratedCards([c, { ...c }])).toHaveLength(1);
  });

  it('removes paraphrases that test the same answer', () => {
    const cards = [
      cloze('A linha mediana que divide o palato longitudinalmente é a {{c1::rafe palatina}}.'),
      cloze('A linha de fusão localizada no meio do palato ósseo é a {{c1::Rafe Palatina}}.'),
    ];
    const out = deduplicateGeneratedCards(cards);
    expect(out).toHaveLength(1);
    // keeps the richer variant
    expect(out[0].front).toContain('longitudinalmente');
  });

  it('does not merge different facts that share vocabulary', () => {
    const cards = [
      cloze('O palato ósseo é formado pelo {{c1::processo palatino da maxila}}.'),
      cloze('O palato mole contém o {{c1::septo músculo-aponeurótico}}.'),
    ];
    expect(deduplicateGeneratedCards(cards)).toHaveLength(2);
  });

  it('keeps sibling clozes with distinct answers in the same sentence', () => {
    const cards = [
      cloze('As glândulas maiores são as {{c1::parótidas}}.'),
      cloze('As glândulas maiores incluem as {{c1::submandibulares}}.'),
    ];
    expect(deduplicateGeneratedCards(cards)).toHaveLength(2);
  });

  it('preserves the original order of survivors', () => {
    const cards = [
      cloze('Primeiro fato sobre o {{c1::vestíbulo oral}} e seus limites.'),
      cloze('Segundo fato sobre o {{c1::bucinador}} e a amamentação.'),
      cloze('Primeiro fato sobre o {{c1::vestíbulo oral}} e seus limites.'),
    ];
    const out = deduplicateGeneratedCards(cards);
    expect(out).toHaveLength(2);
    expect(out[0].front).toContain('vestíbulo');
    expect(out[1].front).toContain('bucinador');
  });
});
