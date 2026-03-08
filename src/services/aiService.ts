/**
 * Service layer for AI-related backend operations.
 * Abstracts edge function invocations for deck generation, analysis, grading, and tutoring.
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

export interface GradeExamParams {
  questionId: string;
  userAnswer: string;
  correctAnswer: string;
  questionText: string;
  aiModel?: string;
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

export interface GenerateExamQuestionsParams {
  textContent: string;
  cardCount: number;
  detailLevel: string;
  cardFormats: string[];
  customInstructions: string;
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

  // Convert markdown formatting in AI-generated cards to HTML
  const cards = (data?.cards ?? []).map((c: any) => ({
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


/** Grade a written exam answer via edge function. */
export async function gradeExamAnswer(params: GradeExamParams) {
  const { aiModel, ...bodyParams } = params;
  const { data, error } = await supabase.functions.invoke('grade-exam', {
    body: { ...bodyParams, aiModel: aiModel || 'flash' },
  });
  if (error) throw error;
  if (data.error) throw new Error(data.error);
  return { score: data.score as number, feedback: data.feedback as string, freeGradingsRemaining: data.freeGradingsRemaining };
}

/** Invoke AI tutor for study hints/explanations. */
export async function invokeTutor(params: TutorParams): Promise<{ hint: string }> {
  const { data, error } = await supabase.functions.invoke('ai-tutor', {
    body: params,
  });
  if (error) throw error;
  return { hint: data.hint ?? 'Não foi possível gerar uma dica.' };
}

/** Invoke generate-deck for exam question generation. */
export async function invokeGenerateExamQuestions(params: GenerateExamQuestionsParams): Promise<any> {
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
  return data;
}
