/**
 * Supabase implementation of ICardRepository.
 * Infrastructure layer — depends on Supabase client.
 * This is the ONLY place where Supabase-specific card logic lives.
 */

import { supabase } from '@/integrations/supabase/client';
import { mapCardRow, type Card, type CardState } from '@/types/domain';
import type { ICardRepository, CardFilter, CardPage } from '@/types/repositories';

const CARD_COLS = 'id, deck_id, front_content, back_content, card_type, state, stability, difficulty, scheduled_date, learning_step, last_reviewed_at, origin_deck_id, created_at, updated_at' as const;

export class SupabaseCardRepository implements ICardRepository {
  async findById(id: string): Promise<Card | null> {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapCardRow(data) : null;
  }

  async findMany(filter: CardFilter, limit = 200, offset = 0): Promise<CardPage> {
    let query = supabase.from('cards').select('*', { count: 'exact' });

    if (filter.deckId) query = query.eq('deck_id', filter.deckId);
    if (filter.deckIds?.length) query = query.in('deck_id', filter.deckIds);
    if (filter.scheduledBefore) query = query.lte('scheduled_date', filter.scheduledBefore.toISOString());

    const stateMap: Record<CardState, number> = { new: 0, learning: 1, review: 2, relearning: 3 };
    if (filter.state) query = query.eq('state', stateMap[filter.state]);
    if (filter.cardType) query = query.eq('card_type', filter.cardType);

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const items = (data ?? []).map(mapCardRow);
    const total = count ?? items.length;
    return { items, total, hasMore: offset + items.length < total };
  }

  async create(deckId: string, input: { frontContent: string; backContent: string; cardType?: string }): Promise<Card> {
    const { data, error } = await supabase
      .from('cards')
      .insert({
        deck_id: deckId,
        front_content: input.frontContent,
        back_content: input.backContent,
        card_type: input.cardType ?? 'basic',
      })
      .select()
      .single();
    if (error) throw error;
    return mapCardRow(data);
  }

  async createBatch(deckId: string, cards: { frontContent: string; backContent: string; cardType: string }[]): Promise<Card[]> {
    const baseTime = Date.now();
    const rows = cards.map((c, idx) => ({
      deck_id: deckId,
      front_content: c.frontContent,
      back_content: c.backContent,
      card_type: c.cardType,
      state: 0,
      stability: 0,
      difficulty: 0,
      created_at: new Date(baseTime + idx).toISOString(),
    }));

    const BATCH_SIZE = 500;
    const allData: any[] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase.from('cards').insert(batch).select();
      if (error) throw error;
      if (data) allData.push(...data);
    }
    return allData.map(mapCardRow);
  }

  async update(id: string, frontContent: string, backContent: string): Promise<Card> {
    const { data, error } = await supabase
      .from('cards')
      .update({ front_content: frontContent, back_content: backContent })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapCardRow(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('cards').delete().eq('id', id);
    if (error) throw error;
  }

  async move(ids: string[], targetDeckId: string): Promise<void> {
    const { error } = await supabase.from('cards').update({ deck_id: targetDeckId } as any).in('id', ids);
    if (error) throw error;
  }

  async countByState(deckId: string): Promise<Record<CardState, number>> {
    const { data, error } = await supabase.rpc('count_descendant_cards_by_state', { p_deck_id: deckId });
    if (error) throw error;
    const row: any = Array.isArray(data) ? data[0] : data;
    return {
      new: Number(row?.new_count ?? 0),
      learning: Number(row?.learning_count ?? 0),
      review: Number(row?.review_count ?? 0),
      relearning: 0,
    };
  }
}
