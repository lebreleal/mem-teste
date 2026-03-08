/**
 * Domain error types — Clean Architecture: Use Cases communicate failures
 * through typed exceptions, not generic strings.
 *
 * Each error carries a `code` for programmatic handling and a `userMessage`
 * for display. This separates developer-facing details from user-facing text.
 */

export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_REQUIRED'
  | 'INSUFFICIENT_ENERGY'
  | 'RATE_LIMIT'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'DB_ERROR'
  | 'UNKNOWN';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly context?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, userMessage?: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage ?? fallbackUserMessage(code);
    this.context = context;
  }

  /** Is this a transient error that could succeed on retry? */
  get isRetryable(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'RATE_LIMIT';
  }
}

function fallbackUserMessage(code: ErrorCode): string {
  switch (code) {
    case 'NETWORK_ERROR': return 'Erro de conexão. Verifique sua internet e tente novamente.';
    case 'AUTH_REQUIRED': return 'Sessão expirada. Faça login novamente.';
    case 'INSUFFICIENT_ENERGY': return 'Créditos insuficientes para esta ação.';
    case 'RATE_LIMIT': return 'Muitas requisições. Aguarde um momento.';
    case 'NOT_FOUND': return 'Recurso não encontrado.';
    case 'VALIDATION': return 'Dados inválidos. Verifique e tente novamente.';
    case 'DB_ERROR': return 'Erro ao acessar o banco de dados. Tente novamente.';
    default: return 'Ocorreu um erro inesperado. Tente novamente.';
  }
}

/**
 * Classify a raw Supabase/network error into a typed AppError.
 * Central point for error normalization (Dependency Inversion — infrastructure
 * errors are translated to domain errors at the boundary).
 */
export function classifyError(err: unknown, context?: Record<string, unknown>): AppError {
  if (err instanceof AppError) return err;

  const msg = (err as any)?.message ?? String(err);
  const code = (err as any)?.code ?? '';
  const status = (err as any)?.status ?? (err as any)?.statusCode ?? 0;

  // Network errors
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_') || msg.includes('PGRST000')) {
    return new AppError('NETWORK_ERROR', msg, undefined, context);
  }

  // Auth errors
  if (status === 401 || status === 403 || code === 'PGRST301' || msg.includes('JWT')) {
    return new AppError('AUTH_REQUIRED', msg, undefined, context);
  }

  // Rate limiting
  if (status === 429) {
    return new AppError('RATE_LIMIT', msg, undefined, context);
  }

  // Not found
  if (status === 404 || code === 'PGRST116') {
    return new AppError('NOT_FOUND', msg, undefined, context);
  }

  // DB constraint errors
  if (code?.startsWith('23') || msg.includes('duplicate key') || msg.includes('violates')) {
    return new AppError('DB_ERROR', msg, undefined, context);
  }

  return new AppError('UNKNOWN', msg, undefined, context);
}

/**
 * Wrap an async operation with retry logic + error classification.
 * Retries only on transient errors (network, rate limit).
 */
export async function withRetryAndClassify<T>(
  fn: () => Promise<T>,
  opts?: { maxRetries?: number; context?: Record<string, unknown> },
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 3;
  let lastError: AppError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = classifyError(err, opts?.context);
      if (!lastError.isRetryable || attempt === maxRetries - 1) throw lastError;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  throw lastError ?? new AppError('UNKNOWN', 'Max retries exceeded');
}
