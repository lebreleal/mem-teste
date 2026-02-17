/**
 * Service layer for feature requests and comments.
 */

import { supabase } from '@/integrations/supabase/client';
import type { FeatureRequest, FeatureComment } from '@/types/feedback';

/** Fetch feature requests with vote status, author names, and comment counts. */
export async function fetchFeatureRequests(userId: string, category?: string): Promise<FeatureRequest[]> {
  let query = supabase
    .from('feature_requests')
    .select('*')
    .order('vote_count', { ascending: false })
    .order('created_at', { ascending: false });

  if (category && category !== 'todas') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) throw error;

  let votedIds = new Set<string>();
  const { data: votes } = await supabase
    .from('feature_votes')
    .select('feature_id')
    .eq('user_id', userId);
  if (votes) votedIds = new Set(votes.map(v => v.feature_id));

  const userIds = [...new Set((data || []).map(f => f.user_id))];
  let nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', userIds);
    if (profiles) nameMap = new Map(profiles.map(p => [p.id, p.name]));
  }

  const featureIds = (data || []).map(f => f.id);
  let commentCountMap = new Map<string, number>();
  if (featureIds.length > 0) {
    const { data: comments } = await supabase.from('feature_comments').select('feature_id').in('feature_id', featureIds);
    if (comments) {
      comments.forEach(c => commentCountMap.set(c.feature_id, (commentCountMap.get(c.feature_id) || 0) + 1));
    }
  }

  return (data || []).map(f => ({
    ...f,
    user_voted: votedIds.has(f.id),
    author_name: nameMap.get(f.user_id) || 'Anônimo',
    comment_count: commentCountMap.get(f.id) || 0,
  })) as FeatureRequest[];
}

/** Create a feature request. */
export async function createFeatureRequest(userId: string, title: string, description: string, category: string) {
  const { error } = await supabase.from('feature_requests').insert({
    user_id: userId,
    title: title.trim(),
    description: description.trim(),
    category,
  });
  if (error) throw error;
}

/** Toggle vote on a feature request. */
export async function toggleVote(userId: string, featureId: string, hasVoted: boolean) {
  if (hasVoted) {
    const { error } = await supabase.from('feature_votes').delete().eq('user_id', userId).eq('feature_id', featureId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('feature_votes').insert({ user_id: userId, feature_id: featureId });
    if (error) throw error;
  }
}

/** Delete a feature request. */
export async function deleteFeatureRequest(featureId: string) {
  const { error } = await supabase.from('feature_requests').delete().eq('id', featureId);
  if (error) throw error;
}

/** Fetch comments for a feature request with author names. */
export async function fetchFeatureComments(featureId: string): Promise<FeatureComment[]> {
  const { data, error } = await supabase
    .from('feature_comments')
    .select('*')
    .eq('feature_id', featureId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const userIds = [...new Set((data || []).map(c => c.user_id))];
  let nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', userIds);
    if (profiles) nameMap = new Map(profiles.map(p => [p.id, p.name]));
  }

  return (data || []).map(c => ({
    ...c,
    author_name: nameMap.get(c.user_id) || 'Anônimo',
  })) as FeatureComment[];
}

/** Add a comment to a feature request. */
export async function addFeatureComment(userId: string, featureId: string, content: string) {
  const { error } = await supabase.from('feature_comments').insert({
    feature_id: featureId,
    user_id: userId,
    content: content.trim(),
  });
  if (error) throw error;
}

/** Delete a comment. */
export async function deleteFeatureComment(commentId: string) {
  const { error } = await supabase.from('feature_comments').delete().eq('id', commentId);
  if (error) throw error;
}

/** Update a feature request (title, description, category). */
export async function updateFeatureRequest(featureId: string, updates: { title?: string; description?: string; category?: string }) {
  const { error } = await supabase.from('feature_requests').update(updates).eq('id', featureId);
  if (error) throw error;
}
