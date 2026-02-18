/**
 * Renders the list of folders and decks in the current view.
 * Includes pending (background-generating) decks as ghost items.
 * Supports drag-to-reorder via grip handles.
 */

import {
  FolderOpen, MoreVertical, Pencil, Trash2, Archive, ArrowUpRight,
  ChevronRight, GraduationCap, Link2, Loader2, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import DeckRow from './DeckRow';
import { usePendingDecks } from '@/stores/usePendingDecks';
import { useDragReorder } from '@/hooks/useDragReorder';
import type { DeckWithStats } from '@/hooks/useDecks';

interface Folder { id: string; name: string; parent_id: string | null; is_archived: boolean }

interface DeckListProps {
  isLoading: boolean;
  currentFolders: Folder[];
  currentDecks: DeckWithStats[];
  currentFolderId?: string | null;
  searchQuery?: string;
  
  // DeckRow props
  deckSelectionMode: boolean;
  selectedDeckIds: Set<string>;
  expandedDecks: Set<string>;
  toggleExpand: (id: string) => void;
  toggleDeckSelection: (id: string) => void;
  getSubDecks: (parentId: string) => DeckWithStats[];
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
  getCommunityLinkId: (deck: DeckWithStats) => string | null;
  navigateToCommunity: (id: string) => void;
  getFolderDueCount: (folderId: string) => number;
  getFolderCommunityLinkId: (folderId: string) => string | null;
  folderHasCommunityLink: (folderId: string) => boolean;
  
  // Actions
  onFolderClick: (id: string) => void;
  onRenameFolder: (folder: Folder) => void;
  onMoveFolder: (folder: Folder) => void;
  onArchiveFolder: (id: string) => void;
  onDeleteFolder: (folder: Folder) => void;
  
  onCreateSubDeck: (deckId: string) => void;
  onRenameDeck: (deck: DeckWithStats) => void;
  onMoveDeck: (deck: DeckWithStats) => void;
  onArchiveDeck: (id: string) => void;
  onDeleteDeck: (deck: DeckWithStats) => void;

  // Reorder callbacks
  onReorderFolders?: (reordered: Folder[]) => void;
  onReorderDecks?: (reordered: DeckWithStats[]) => void;
}

const DeckList = ({
  isLoading, currentFolders, currentDecks, currentFolderId, searchQuery = '',
  onFolderClick, onRenameFolder, onMoveFolder, onArchiveFolder, onDeleteFolder,
  onRenameDeck, onMoveDeck, onArchiveDeck, onDeleteDeck, getFolderDueCount, getFolderCommunityLinkId,
  folderHasCommunityLink, navigateToCommunity, onReorderFolders, onReorderDecks,
  ...deckRowProps
}: DeckListProps) => {
  const { pendingDecks } = usePendingDecks();

  const q = searchQuery.toLowerCase();
  const filteredFolders = q ? currentFolders.filter(f => f.name.toLowerCase().includes(q)) : currentFolders;
  const filteredDecks = q ? currentDecks.filter(d => d.name.toLowerCase().includes(q)) : currentDecks;

  const folderDrag = useDragReorder({
    items: filteredFolders,
    getId: (f) => f.id,
    onReorder: (reordered) => onReorderFolders?.(reordered),
  });

  const deckDrag = useDragReorder({
    items: filteredDecks,
    getId: (d) => d.id,
    onReorder: (reordered) => onReorderDecks?.(reordered),
  });

  // Filter pending decks for current folder
  const visiblePending = q ? [] : pendingDecks.filter(p => p.folderId === (currentFolderId ?? null));

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card shadow-sm divide-y divide-border/50">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
            <div className="h-6 w-6 rounded bg-muted shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
            <div className="flex gap-1.5">
              <div className="h-5 w-8 rounded-full bg-muted" />
              <div className="h-5 w-8 rounded-full bg-muted" />
              <div className="h-5 w-8 rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (filteredFolders.length === 0 && filteredDecks.length === 0 && visiblePending.length === 0) {
    if (q) {
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-8 text-center px-4">
          <Search className="h-7 w-7 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum resultado para "{searchQuery}"</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-8 sm:py-12 text-center px-4">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <GraduationCap className="h-7 w-7 text-primary" />
        </div>
        <h3 className="font-display text-lg font-bold text-foreground">Nenhum baralho ainda</h3>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">Crie seu primeiro baralho para começar a estudar.</p>
        <p className="mt-3 text-xs text-muted-foreground">Use o botão <strong>+ Adicionar</strong> acima para criar</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm divide-y divide-border/50">
      {/* Pending (background generating) decks */}
      {visiblePending.map(pending => {
        const progressPct = pending.progress.total > 0 ? (pending.progress.current / pending.progress.total) * 100 : 0;
        return (
          <div
            key={pending.id}
            className="flex items-center gap-3 px-5 py-4 opacity-50 pointer-events-none select-none"
          >
            <div className="flex h-6 w-6 items-center justify-center shrink-0">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-semibold text-foreground truncate">{pending.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={progressPct} className="h-1.5 flex-1 max-w-[120px]" />
                <p className="text-[10px] text-muted-foreground">
                  {pending.status === 'saving' ? 'Salvando...' : `Gerando lote ${pending.progress.current}/${pending.progress.total}`}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        );
      })}

      {/* Folders */}
      {folderDrag.displayItems.map(folder => {
        const dragHandlers = folderDrag.getHandlers(folder);
        const hasCommunityItems = folderHasCommunityLink(folder.id);
        return (
          <div
            key={folder.id}
            draggable={dragHandlers.draggable}
            onDragStart={dragHandlers.onDragStart}
            onDragOver={dragHandlers.onDragOver}
            onDragEnter={dragHandlers.onDragEnter}
            onDragLeave={dragHandlers.onDragLeave}
            onDrop={dragHandlers.onDrop}
            onDragEnd={dragHandlers.onDragEnd}
            className={`group flex items-center gap-3 px-3 sm:px-5 py-4 hover:bg-muted/50 transition-all cursor-pointer ${dragHandlers.className}`}
            onClick={() => onFolderClick(folder.id)}
          >
            <FolderOpen className="h-6 w-6 text-primary fill-primary/10 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-display font-semibold text-foreground truncate">{folder.name}</h3>
                {(() => {
                  const linkId = getFolderCommunityLinkId(folder.id);
                  return linkId ? (
                    <button className="shrink-0 text-info hover:text-info/70 transition-colors" onClick={(e) => { e.stopPropagation(); navigateToCommunity(linkId); }} title="Ver na comunidade">
                      <Link2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null;
                })()}
              </div>
              {(() => {
                const due = getFolderDueCount(folder.id);
                return (
                  <p className="text-xs text-muted-foreground">
                    {due > 0 ? `Cartões para hoje: ${due}` : 'Pasta'}
                  </p>
                );
              })()}
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onRenameFolder(folder)}>
                    <Pencil className="mr-2 h-4 w-4" /> Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMoveFolder(folder)}>
                    <ArrowUpRight className="mr-2 h-4 w-4" /> Mover para...
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onArchiveFolder(folder.id)}>
                    <Archive className="mr-2 h-4 w-4" /> Arquivar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className={hasCommunityItems ? 'opacity-40 pointer-events-none' : 'text-destructive focus:text-destructive'}
                    disabled={hasCommunityItems}
                    onClick={() => !hasCommunityItems && onDeleteFolder(folder)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    {hasCommunityItems && <span className="ml-1 text-[10px]">(remova itens vinculados)</span>}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        );
      })}

      {/* Decks */}
      {deckDrag.displayItems.map(deck => {
        const dragHandlers = deckDrag.getHandlers(deck);
        return (
          <DeckRow
            key={deck.id}
            deck={deck}
            onRename={onRenameDeck}
            onMove={onMoveDeck}
            onArchive={onArchiveDeck}
            onDelete={onDeleteDeck}
            navigateToCommunity={navigateToCommunity}
            dragHandlers={dragHandlers}
            {...deckRowProps}
          />
        );
      })}
    </div>
  );
};

export default DeckList;
