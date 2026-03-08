import { useCardTags, useCardTagMutations } from '@/hooks/useTags';
import { TagInput } from '@/components/TagInput';
import { Tag as TagIcon } from 'lucide-react';

/** Inline tag display for card list items */
export const CardTagsInline = ({ cardId }: { cardId: string }) => {
  const { data: tags = [] } = useCardTags(cardId);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.slice(0, 3).map(tag => (
        <span key={tag.id} className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {tag.name}
        </span>
      ))}
      {tags.length > 3 && (
        <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>
      )}
    </div>
  );
};

/** Tag editor for card edit dialog */
export const CardTagEditor = ({ cardId }: { cardId: string }) => {
  const { data: tags = [] } = useCardTags(cardId);
  const { addTag, removeTag } = useCardTagMutations(cardId);
  return (
    <div className="space-y-1.5 border-t border-border/50 pt-3">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <TagIcon className="h-3 w-3" /> Tags do card
      </p>
      <TagInput
        tags={tags}
        onAdd={(tag) => addTag.mutate(tag)}
        onRemove={(tagId) => removeTag.mutate(tagId)}
        placeholder="Adicionar tag ao card..."
      />
    </div>
  );
};
