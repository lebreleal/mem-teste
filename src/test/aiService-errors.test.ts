import { describe, it, expect, vi, beforeEach } from 'vitest';
const { invoke, log } = vi.hoisted(() => ({ invoke: vi.fn(), log: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/lib/errorLogger', () => ({ logError: log }));
import { generateDeckCards, AIGenerationError } from '@/services/aiService';
const params = { textContent: 'A água evapora quando recebe calor.', cardCount: 3, detailLevel: 'standard' as const, cardFormats: ['qa' as const], aiModel: 'flash' };
describe('AI generation error handling', () => {
  beforeEach(() => vi.clearAllMocks());
  it('preserves the server denial and does not mark it retryable', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Non-2xx', context: new Response(JSON.stringify({ error: 'Créditos IA insuficientes' }), { status: 402 }) } });
    const error = await generateDeckCards(params).catch(e => e);
    expect(error).toBeInstanceOf(AIGenerationError);
    expect(error.message).toBe('Créditos IA insuficientes');
    expect(error.retryable).toBe(false);
    expect(log).toHaveBeenCalled();
  });
  it('rejects empty success instead of saving an empty deck', async () => {
    invoke.mockResolvedValue({ data: { cards: [] }, error: null });
    await expect(generateDeckCards(params)).rejects.toThrow('cartões válidos');
  });
  it('generates a test card from a mocked provider response', async () => {
    invoke.mockResolvedValue({ data: { cards: [{ front: 'O que provoca evaporação?', back: 'Calor.', type: 'basic' }] }, error: null });
    expect((await generateDeckCards(params)).cards).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith('generate-deck', expect.objectContaining({ body: expect.objectContaining({ textContent: params.textContent }) }));
  });
});