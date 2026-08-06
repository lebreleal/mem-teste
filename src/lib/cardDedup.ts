/**
 * Deduplication of AI-generated flashcards — pure functions, no side effects.
 *
 * Why it exists: generation runs in parallel batches, so no batch sees what the
 * others produced. Two batches routinely emit the SAME fact with different
 * wording ("A linha mediana que divide o palato... é a {{c1::rafe palatina}}"
 * vs "A linha de fusão no meio do palato ósseo é a {{c1::Rafe Palatina}}").
 * A naive Jaccard over the whole front with a 0.9 threshold never catches those.
 *
 * Strategy (cheap, deterministic, order-independent in outcome):
 *  1. Exact match on the normalized front  -> duplicate.
 *  2. Same ANSWER KEY (cloze answers, or the back of a basic card) plus a
 *     moderate front overlap -> duplicate. This is what catches paraphrases:
 *     the tested fact is the answer, not the sentence around it.
 *  3. High content-word overlap on the front (>= 0.75, stopwords removed).
 *
 * Complexity: an inverted index maps content words -> card indexes, so each
 * card is only compared against cards that share at least one rare-ish word
 * (O(n * k) in practice instead of the previous O(n^2)).
 */

import type { GeneratedCard } from '@/types/ai';

/** Portuguese stopwords — they inflate similarity without carrying meaning. */
const STOPWORDS = new Set([
  'que', 'com', 'para', 'por', 'como', 'uma', 'dos', 'das', 'nos', 'nas',
  'the', 'and', 'são', 'seu', 'sua', 'seus', 'suas', 'pelo', 'pela', 'pelos',
  'pelas', 'seja', 'ser', 'ter', 'tem', 'quando', 'onde', 'qual', 'quais',
  'entre', 'sobre', 'esse', 'essa', 'este', 'esta', 'isso', 'aquilo', 'mais',
  'menos', 'muito', 'também', 'não', 'sem', 'seus', 'principal', 'principais',
  'chamada', 'chamado', 'denominada', 'denominado', 'conhecida', 'conhecido',
]);

const CLOZE_RE = /\{\{c\d+::(.*?)(?:::.*?)?\}\}/g;

/** Strip HTML, cloze syntax, accents-insensitive punctuation and case. */
export function normalizeText(text: string): string {
  return (text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(CLOZE_RE, '$1')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Content words of a text (stopwords and short tokens removed). */
export function contentWords(text: string): Set<string> {
  const words = normalizeText(text).split(' ');
  const out = new Set<string>();
  for (const w of words) {
    if (w.length > 3 && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

/**
 * The fact a card actually tests: the cloze answers, or the back of a basic card.
 * Normalized and sorted so wording/order differences don't matter.
 */
export function answerKey(card: Pick<GeneratedCard, 'front' | 'back'>): string {
  const answers: string[] = [];
  for (const m of (card.front || '').matchAll(CLOZE_RE)) {
    const a = normalizeText(m[1]);
    if (a) answers.push(a);
  }
  if (answers.length === 0) {
    const back = normalizeText(card.back || '');
    if (back) answers.push(back);
  }
  return answers.sort().join('|');
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.max(a.size, b.size);
}

/** Richer card wins a tie: more context on the front, longer answer. */
function score(card: GeneratedCard): number {
  return normalizeText(card.front).length + normalizeText(card.back).length;
}

export interface DedupOptions {
  /** Front overlap above which two cards are the same question. */
  frontThreshold?: number;
  /** Front overlap required when both cards test the SAME answer. */
  sameAnswerThreshold?: number;
}

/**
 * Remove duplicated/paraphrased cards, keeping the richest variant.
 * Input order is preserved for the survivors.
 */
export function deduplicateGeneratedCards(
  cards: GeneratedCard[],
  options: DedupOptions = {},
): GeneratedCard[] {
  const frontThreshold = options.frontThreshold ?? 0.75;
  const sameAnswerThreshold = options.sameAnswerThreshold ?? 0.45;

  const kept: number[] = [];
  const words: Set<string>[] = [];
  const norms: string[] = [];
  const keys: string[] = [];

  const byWord = new Map<string, number[]>();   // content word -> kept indexes
  const byNorm = new Map<string, number>();     // exact normalized front -> kept index
  const byKey = new Map<string, number[]>();    // answer key -> kept indexes

  const replace = (keptPos: number, i: number) => {
    kept[keptPos] = i;
    words[keptPos] = contentWords(cards[i].front);
    norms[keptPos] = normalizeText(cards[i].front);
    keys[keptPos] = answerKey(cards[i]);
  };

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const w = contentWords(card.front);
    const norm = normalizeText(card.front);
    const key = answerKey(card);
    if (!norm) continue;

    // Candidate set: exact front, same answer, or sharing a content word.
    const candidates = new Set<number>();
    const exact = byNorm.get(norm);
    if (exact !== undefined) candidates.add(exact);
    for (const p of byKey.get(key) ?? []) candidates.add(p);
    for (const word of w) {
      for (const p of byWord.get(word) ?? []) candidates.add(p);
    }

    let dupPos = -1;
    for (const p of candidates) {
      const sim = overlap(w, words[p]);
      const sameAnswer = !!key && keys[p] === key;
      if (norms[p] === norm || sim >= frontThreshold || (sameAnswer && sim >= sameAnswerThreshold)) {
        dupPos = p;
        break;
      }
    }

    if (dupPos >= 0) {
      // Keep the richer of the two, in the position already reserved.
      if (score(card) > score(cards[kept[dupPos]])) {
        const oldNorm = norms[dupPos];
        replace(dupPos, i);
        if (byNorm.get(oldNorm) === dupPos) byNorm.delete(oldNorm);
        byNorm.set(norm, dupPos);
        for (const word of w) {
          const list = byWord.get(word);
          if (list) { if (!list.includes(dupPos)) list.push(dupPos); }
          else byWord.set(word, [dupPos]);
        }
        const keyList = byKey.get(key);
        if (keyList) { if (!keyList.includes(dupPos)) keyList.push(dupPos); }
        else byKey.set(key, [dupPos]);
      }
      continue;
    }

    const pos = kept.length;
    kept.push(i);
    words.push(w);
    norms.push(norm);
    keys.push(key);
    if (!byNorm.has(norm)) byNorm.set(norm, pos);
    for (const word of w) {
      const list = byWord.get(word);
      if (list) list.push(pos); else byWord.set(word, [pos]);
    }
    const keyList = byKey.get(key);
    if (keyList) keyList.push(pos); else byKey.set(key, [pos]);
  }

  return kept
    .slice()
    .sort((a, b) => a - b)
    .map(i => cards[i]);
}
