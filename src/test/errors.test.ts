/**
 * Tests for the error classification and retry system.
 */

import { describe, it, expect, vi } from 'vitest';
import { AppError, classifyError, withRetryAndClassify } from '@/lib/errors';

describe('AppError', () => {
  it('stores code, message, and userMessage', () => {
    const err = new AppError('NETWORK_ERROR', 'fetch failed');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.message).toBe('fetch failed');
    expect(err.userMessage).toContain('conexão');
    expect(err.isRetryable).toBe(true);
  });

  it('non-retryable errors have isRetryable = false', () => {
    expect(new AppError('AUTH_REQUIRED', 'jwt expired').isRetryable).toBe(false);
    expect(new AppError('VALIDATION', 'bad input').isRetryable).toBe(false);
    expect(new AppError('NOT_FOUND', '404').isRetryable).toBe(false);
  });

  it('retryable errors include NETWORK_ERROR and RATE_LIMIT', () => {
    expect(new AppError('NETWORK_ERROR', 'fail').isRetryable).toBe(true);
    expect(new AppError('RATE_LIMIT', '429').isRetryable).toBe(true);
  });
});

describe('classifyError', () => {
  it('classifies network errors', () => {
    const err = classifyError(new Error('Failed to fetch'));
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.isRetryable).toBe(true);
  });

  it('classifies auth errors by status', () => {
    const err = classifyError({ message: 'unauthorized', status: 401 });
    expect(err.code).toBe('AUTH_REQUIRED');
  });

  it('classifies rate limit', () => {
    const err = classifyError({ message: 'too many requests', status: 429 });
    expect(err.code).toBe('RATE_LIMIT');
  });

  it('classifies DB constraint errors', () => {
    const err = classifyError({ message: 'duplicate key value violates', code: '23505' });
    expect(err.code).toBe('DB_ERROR');
  });

  it('classifies unknown errors', () => {
    const err = classifyError(new Error('something weird'));
    expect(err.code).toBe('UNKNOWN');
  });

  it('preserves existing AppError', () => {
    const original = new AppError('VALIDATION', 'bad');
    const result = classifyError(original);
    expect(result).toBe(original);
  });
});

describe('withRetryAndClassify', () => {
  it('returns result on success', async () => {
    const result = await withRetryAndClassify(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('retries on network error and succeeds', async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      if (calls < 3) throw new Error('Failed to fetch');
      return Promise.resolve('ok');
    };
    const result = await withRetryAndClassify(fn);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws classified error after max retries', async () => {
    const fn = () => { throw new Error('Failed to fetch'); };
    await expect(withRetryAndClassify(fn, { maxRetries: 2 })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('does NOT retry non-retryable errors', async () => {
    let calls = 0;
    const fn = () => { calls++; throw new AppError('VALIDATION', 'bad'); };
    await expect(withRetryAndClassify(fn)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(calls).toBe(1);
  });
});
