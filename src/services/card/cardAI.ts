/**
 * Card AI operations — AI-powered card enhancement.
 * Single Responsibility: Only handles AI interactions for cards.
 */

import { supabase } from '@/integrations/supabase/client';
import { markdownToHtml } from '@/lib/markdownToHtml';

/** Enhance a card using AI. */
export async function enhanceCard(params: {
  front: string;
  back: string;
  cardType: string;
  aiModel: string;
  energyCost: number;
}) {
  const { data, error } = await supabase.functions.invoke('enhance-card', { body: params });
  if (error) throw error;

  // Convert markdown formatting from AI response to HTML
  if (data?.front) data.front = markdownToHtml(data.front);
  if (data?.back && typeof data.back === 'string') data.back = markdownToHtml(data.back);

  return data;
}
