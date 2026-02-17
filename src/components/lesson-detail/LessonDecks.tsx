/**
 * Lesson decks section with add, preview, collection, download, and edit actions.
 */

import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Plus, Layers, MoreVertical, Trash2, Copy, Lock,
  Pencil, Download, Eye, Link2, Crown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LessonDecksProps {
  turmaId: string;
  lessonDecks: any[];
  userDecks: any[];
  canEdit: boolean;
  isAdmin: boolean;
  isMod: boolean;
  isSubscriber: boolean;
  userId?: string;
  subscriptionPrice?: number;
  onShowAddDeck: () => void;
  onPreviewDeck: (td: any) => void;
  onAddToCollection: (td: any) => void;
  onDownloadDeck: (td: any) => void;
  onEditPricing: (td: any) => void;
  onUnshareDeck: (tdId: string) => void;
  isAddingToCollection: boolean;
  isDownloading: boolean;
}

const LessonDecks = ({
  turmaId, lessonDecks, userDecks, canEdit, isAdmin, isMod, isSubscriber,
  userId, subscriptionPrice, onShowAddDeck, onPreviewDeck,
  onAddToCollection, onDownloadDeck, onEditPricing, onUnshareDeck,
  isAddingToCollection, isDownloading,
}: LessonDecksProps) => {
  const navigate = useNavigate();

  const userOwnsDeck = (deckId: string) => userDecks.some(d => d.id === deckId);
  const userHasLinkedDeck = (turmaDeckId: string) => userDecks.some(d => (d as any).source_turma_deck_id === turmaDeckId && !d.is_archived);
  const isDeckFree = (td: any) => !td.price_type || td.price_type === 'free';
  const canAccessDeck = (td: any) => {
    if (isDeckFree(td)) return true;
    if (td.shared_by === userId || userOwnsDeck(td.deck_id)) return true;
    if (isAdmin || isMod || isSubscriber) return true;
    return false;
  };

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-bold text-foreground">Baralhos</h2>
        {canEdit && (
          <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-muted-foreground" onClick={onShowAddDeck}>
            <Plus className="h-3 w-3" /> Adicionar
          </Button>
        )}
      </div>
      {lessonDecks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 py-6 flex flex-col items-center gap-2">
          <Layers className="h-7 w-7 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/60">Nenhum baralho neste conteúdo</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card shadow-sm divide-y divide-border/50">
          {lessonDecks.map(td => {
            const isOwner = td.shared_by === userId;
            const alreadyLinked = userHasLinkedDeck(td.id);
            const alreadyOwns = userOwnsDeck(td.deck_id);
            const subscriberOnly = !isDeckFree(td);
            const canImport = canAccessDeck(td);
            const inCollection = alreadyOwns || alreadyLinked;
            const linkedDeck = alreadyLinked ? userDecks.find(d => (d as any).source_turma_deck_id === td.id) : null;
            return (
              <div key={td.id} className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-display font-semibold text-card-foreground truncate">{td.deck_name}</h3>
                    {subscriberOnly && (
                      <Crown className="h-3 w-3 shrink-0" style={{ color: 'hsl(270 60% 55%)' }} />
                    )}
                    {inCollection && (
                      <button
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-info bg-info/10 px-1.5 py-0.5 rounded-full shrink-0 hover:bg-info/20 transition-colors"
                        onClick={e => { e.stopPropagation(); navigate(`/decks/${linkedDeck?.id || td.deck_id}`); }}
                        title="Ir ao baralho"
                      >
                        <Link2 className="h-2.5 w-2.5" /> Na coleção
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{td.card_count ?? 0} cards</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onPreviewDeck(td)} title="Prévia">
                    <Eye className="h-4 w-4" />
                  </Button>
                  {!inCollection && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => {
                      if (subscriberOnly && !canImport) return;
                      onAddToCollection(td);
                    }} disabled={isAddingToCollection || (subscriberOnly && !canImport)} title={subscriberOnly && !canImport ? 'Apenas para assinantes' : 'Adicionar à coleção'}>
                      {subscriberOnly && !canImport ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  )}
                  {inCollection && !alreadyOwns && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onAddToCollection(td)} disabled={isAddingToCollection} title="Sincronizar">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {td.allow_download && !inCollection && canImport && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onDownloadDeck(td)} disabled={isDownloading} title="Baixar cópia">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {(isAdmin || isOwner) && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-3.5 w-3.5" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditPricing(td)}><Pencil className="mr-2 h-4 w-4" /> Editar Configuração</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => onUnshareDeck(td.id)}><Trash2 className="mr-2 h-4 w-4" /> Remover</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default LessonDecks;
