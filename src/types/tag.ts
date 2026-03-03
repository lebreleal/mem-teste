/**
 * Domain types for the tagging system.
 */

export interface Tag {
  id: string;
  name: string;
  slug: string;
  description: string;
  parent_id: string | null;
  is_official: boolean;
  usage_count: number;
  created_by: string | null;
  created_at: string;
  merged_into_id: string | null;
  synonyms: string[];
}

export interface DeckTag {
  id: string;
  deck_id: string;
  tag_id: string;
  created_at: string;
  added_by: string | null;
}

export interface CardTag {
  id: string;
  card_id: string;
  tag_id: string;
  created_at: string;
  added_by: string | null;
}
