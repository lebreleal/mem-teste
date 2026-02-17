/**
 * Service layer for AI-related backend operations.
 * Abstracts edge function invocations for deck generation, analysis, grading, and tutoring.
 */

import { supabase } from '@/integrations/supabase/client';
import type { GeneratedCard, CoverageAnalysis, DetailLevel, CardFormat } from '@/types/ai';

export interface GenerateDeckParams {
  textContent: string;
  cardCount: number;
  detailLevel: DetailLevel;
  cardFormats: CardFormat[];
  customInstructions?: string;
  aiModel: string;
  energyCost: number;
  pageImages?: string[];
}

export interface AnalyzeCoverageParams {
  textContent: string;
  existingCards: GeneratedCard[];
  aiModel: string;
}

export interface FillGapsParams {
  textContent: string;
  cardCount: number;
  detailLevel: DetailLevel;
  cardFormats: CardFormat[];
  existingCards: GeneratedCard[];
  aiModel: string;
  energyCost: number;
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
export async function generateDeckCards(params: GenerateDeckParams): Promise<GeneratedCard[]> {
  const { data, error } = await supabase.functions.invoke('generate-deck', {
    body: {
      textContent: params.textContent,
      cardCount: params.cardCount,
      detailLevel: params.detailLevel,
      cardFormats: params.cardFormats,
      customInstructions: params.customInstructions,
      action: 'generate',
      aiModel: params.aiModel,
      energyCost: params.energyCost,
      ...(params.pageImages?.length ? { pageImages: params.pageImages } : {}),
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.cards ?? [];
}

/** Analyze coverage of existing cards against source text. */
export async function analyzeCoverage(params: AnalyzeCoverageParams): Promise<CoverageAnalysis> {
  const { data, error } = await supabase.functions.invoke('generate-deck', {
    body: {
      textContent: params.textContent.slice(0, 15000),
      existingCards: params.existingCards,
      action: 'analyze',
      aiModel: params.aiModel,
    },
  });
  if (error) throw error;
  return data.analysis;
}

/** Generate cards to fill coverage gaps. */
export async function fillGaps(params: FillGapsParams): Promise<GeneratedCard[]> {
  const { data, error } = await supabase.functions.invoke('generate-deck', {
    body: {
      textContent: params.textContent.slice(0, 15000),
      cardCount: params.cardCount,
      detailLevel: params.detailLevel,
      cardFormats: params.cardFormats,
      existingCards: params.existingCards,
      action: 'fill-gaps',
      aiModel: params.aiModel,
      energyCost: params.energyCost,
    },
  });
  if (error) throw error;
  return data?.cards ?? [];
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
