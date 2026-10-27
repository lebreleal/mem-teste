/**
 * Service layer for AI-related backend operations.
 * Abstracts edge function invocations for deck generation and tutoring.
 */

import { supabase } from '@/integrations/supabase/client';
import { markdownToHtml } from '@/lib/markdownToHtml';
import type { GeneratedCard, DetailLevel, CardFormat } from '@/types/ai';
import { logError } from '@/lib/errorLogger';

export class AIGenerationError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'AIGenerationError';
  }
  get retryable() { return this.status === 429 || (this.status !== undefined && this.status >= 500); }
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface GenerateDeckParams {
  textContent: string;
  cardCount: number;
  detailLevel: DetailLevel;
  cardFormats: CardFormat[];
  customInstructions?: string;
  aiModel: string;
}

export interface GenerateDeckResult {
  cards: GeneratedCard[];
  usage?: TokenUsage;
}

export interface TutorParams {
  frontContent: string;
  backContent: string;
  action?: string;
  mcOptions?: string[];
  correctIndex?: number;
  selectedIndex?: number;
  aiModel: string;
}

/** Generate flashcards from text content via edge function. */
export async function generateDeckCards(params: GenerateDeckParams): Promise<GenerateDeckResult> {
  const { data, error } = await supabase.functions.invoke('generate-deck', {
    body: {
      textContent: params.textContent,
      cardCount: params.cardCount,
      detailLevel: params.detailLevel,
      cardFormats: params.cardFormats,
      customInstructions: params.customInstructions,
      aiModel: params.aiModel,
    },
  });
  if (error || data?.error) {
    let message = data?.error || error?.message || 'Falha ao gerar cartões.';
    const context: unknown = error && 'context' in error ? error.context : undefined;
    const status = context instanceof Response ? context.status : undefined;
    if (context instanceof Response) {
      try {
        const body: unknown = await context.clone().json();
        if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') message = body.error;
      } catch { /* Preserve the transport message when no JSON body is available. */ }
    }
    void logError({ message, component: 'AIDeckGeneration', metadata: { status, model: params.aiModel, cardCount: params.cardCount } });
    throw new AIGenerationError(message, status);
  }

  if (!Array.isArray(data?.cards) || data.cards.length === 0) {
    const message = 'A IA não retornou cartões válidos.';
    void logError({ message, component: 'AIDeckGeneration', metadata: { model: params.aiModel } });
    throw new AIGenerationError(message);
  }

  interface RawCard { front: string; back: string; options?: string[]; type?: string; correctIndex?: number }
  const validCards = data.cards.filter((c: RawCard) => c && typeof c.front === 'string' && c.front.trim() && typeof c.back === 'string');
  if (validCards.length !== data.cards.length) throw new AIGenerationError('A IA retornou cartões incompletos. Nada foi salvo.');
  const cards = validCards.map((c: RawCard) => ({
    ...c,
    front: markdownToHtml(c.front),
    back: markdownToHtml(c.back),
    options: c.options?.map((o: string) => markdownToHtml(o)),
  }));

  return { cards, usage: data?.usage };
}

/** Log aggregated token usage for a complete deck generation session. */
export async function logAggregatedTokenUsage(
  model: string,
  usage: TokenUsage,
  totalEnergyCost: number,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('ai_token_usage').insert({
    user_id: user.id,
    feature_key: 'generate_deck',
    model,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
    energy_cost: totalEnergyCost,
  });
}

/** Invoke AI tutor for study hints/explanations. */
export async function invokeTutor(params: TutorParams): Promise<{ hint: string }> {
  const { data, error } = await supabase.functions.invoke('ai-tutor', {
    body: params,
  });
  if (error) throw error;
  return { hint: data.hint ?? 'Não foi possível gerar uma dica.' };
}
