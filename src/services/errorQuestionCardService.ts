import { supabase } from '@/integrations/supabase/client';
import { getOrCreateErrorDeck } from '@/services/errorDeckService';

export interface ErrorQuestionCardInput {
  questionId: string;
  questionText: string;
  correctAnswer?: string | null;
  correctIndices?: number[] | null;
  options?: string[] | null;
  explanation?: string | null;
  originDeckId: string;
}

type UpsertResult = 'created' | 'moved' | 'exists';

const MARKER_PREFIX = 'error-question';

const stripHtml = (value: string) => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const getCorrectAnswer = (input: ErrorQuestionCardInput): string => {
  const direct = (input.correctAnswer ?? '').trim();
  if (direct) return direct;

  if (!input.options || !input.correctIndices || input.correctIndices.length === 0) {
    return 'Não informada';
  }

  const answers = input.correctIndices
    .map((idx) => input.options?.[idx])
    .filter((v): v is string => Boolean(v));

  return answers.length > 0 ? answers.join(' | ') : 'Não informada';
};

export async function upsertQuestionIntoErrorDeck(
  userId: string,
  input: ErrorQuestionCardInput,
): Promise<UpsertResult> {
  const errorDeckId = await getOrCreateErrorDeck(userId);
  const marker = `<!--${MARKER_PREFIX}:${input.questionId}-->`;

  const { data: existing, error: existingError } = await supabase
    .from('cards')
    .select('id, deck_id, origin_deck_id')
    .ilike('front_content', `%${marker}%`)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    if (existing.deck_id === errorDeckId) return 'exists';

    const { error: moveError } = await supabase
      .from('cards')
      .update({
        deck_id: errorDeckId,
        origin_deck_id: existing.origin_deck_id ?? existing.deck_id,
      } as any)
      .eq('id', existing.id);

    if (moveError) throw moveError;
    return 'moved';
  }

  const plainQuestion = stripHtml(input.questionText);
  const plainExplanation = stripHtml(input.explanation ?? '');
  const correctAnswer = getCorrectAnswer(input);

  const frontContent = `${plainQuestion}\n${marker}`;
  const backContent = [
    `Resposta correta: ${correctAnswer}`,
    plainExplanation ? `Explicação: ${plainExplanation}` : null,
  ].filter(Boolean).join('\n\n');

  const { error: createError } = await supabase
    .from('cards')
    .insert({
      deck_id: errorDeckId,
      origin_deck_id: input.originDeckId,
      front_content: frontContent,
      back_content: backContent,
      card_type: 'basic',
      state: 1,
    } as any);

  if (createError) throw createError;
  return 'created';
}
