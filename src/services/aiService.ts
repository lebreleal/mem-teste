/**
 * Service layer for AI-related backend operations.
 * Abstracts edge function invocations for deck generation and tutoring.
 */

import { supabase } from '@/integrations/supabase/client';
import { markdownToHtml } from '@/lib/markdownToHtml';
import type { GeneratedCard, DetailLevel, CardFormat } from '@/types/ai';

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
  energyCost: number;
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
  energyCost: number;
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
      energyCost: params.energyCost,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  interface RawCard { front: string; back: string; options?: string[]; type?: string; correctIndex?: number }
  const cards = (data?.cards ?? []).map((c: RawCard) => ({
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
