/**
 * Display formatting for AI credits (crown currency).
 * The balance is a numeric column, so it can carry long decimals — always
 * render it with a single decimal place in pt-BR.
 */
export function formatCredits(value: number | string | null | undefined): string {
  const raw = typeof value === 'string' ? Number(value) : value;
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
