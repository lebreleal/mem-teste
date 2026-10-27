import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { studyQueueKey } from '@/lib/queryKeys';

describe('Study account isolation', () => {
  it('fetches Julia queue instead of reusing the admin queue', async () => {
    const client = new QueryClient();
    client.setQueryData(studyQueueKey('admin'), ['admin-card']);
    const result = await client.fetchQuery({ queryKey: studyQueueKey('julia'), staleTime: Infinity, queryFn: async () => ['julia-card'] });
    expect(result).toEqual(['julia-card']);
    expect(client.getQueryData(studyQueueKey('admin'))).toEqual(['admin-card']);
    client.clear();
  });
  it('isolates both deck and folder scopes', () => {
    expect(studyQueueKey('admin', 'deck')).not.toEqual(studyQueueKey('julia', 'deck'));
    expect(studyQueueKey('admin', undefined, 'folder')).not.toEqual(studyQueueKey('julia', undefined, 'folder'));
  });
});