/**
 * ContentTab – Folder-based community content view (Google Drive style).
 * Uses turma_subjects as folders with parent_id for nesting.
 * Shows a "Top Decks" featured section at the top.
 */

import { useState, useMemo, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTurmaDetail } from './TurmaDetailContext';
import { useContentMutations } from './content/useContentMutations';
import { useContentImport } from './content/useContentImport';
import { useDeckTagsBatch, useTagDescendants } from '@/hooks/useTags';
import type { Tag } from '@/types/tag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Plus, FolderPlus, MoreVertical, ChevronRight,
  Layers, Pencil, Trash2, Eye, EyeOff,
  Upload, Download, Lock, Crown, Globe, Folder, FolderOpen,
  Copy, Link2, ClipboardList, Clock, Import, LogIn,
  Search, Sparkles, ArrowLeft, TrendingUp, Paperclip, Share2,
} from 'lucide-react';
import DeckPreviewSheet from '@/components/community/DeckPreviewSheet';
import SubscriberGateDialog from '@/components/turma-detail/SubscriberGateDialog';
import TrialStudyModal from '@/components/turma-detail/TrialStudyModal';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatRelativeTime = (dateStr: string) => {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  } catch { return ''; }
};

/* ── Deck Card (compact list item for Drive style) ── */
const DeckListItem = ({
  td,
  onClick,
  inCollection,
  subscriberOnly,
  canImport,
  isOwner,
  isAdmin,
  onEditPricing,
  onRemove,
  onTogglePublish,
  tags,
  downloads,
  fileCount,
  examCount,
}: {
  td: any;
  onClick: () => void;
  inCollection: boolean;
  subscriberOnly: boolean;
  canImport: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  onEditPricing: () => void;
  onRemove: () => void;
  onTogglePublish?: () => void;
  tags?: Tag[];
  downloads?: number;
  fileCount?: number;
  examCount?: number;
}) => (
  <div
    className={`group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer ${td.is_published === false ? 'opacity-50' : ''}`}
    onClick={onClick}
  >
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">{td.deck_name}</h3>
      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
        {td.shared_by_name && (
          <span>por <span className="font-medium text-foreground">{td.shared_by_name}</span></span>
        )}
        {td.created_at && (
          <span className="flex items-center gap-0.5">
            <Clock className="h-3 w-3 shrink-0" /> {formatRelativeTime(td.created_at)}
          </span>
        )}
        {td.is_published === false && (isAdmin || isOwner) && (
          <span className="flex items-center gap-0.5"><EyeOff className="h-3 w-3" /> Rascunho</span>
        )}
        {subscriberOnly && <Crown className="h-3.5 w-3.5 shrink-0 text-purple-500 fill-purple-500/20" />}
        {inCollection && (
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">✓ Inscrito</span>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1.5">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Layers className="h-3 w-3 shrink-0" /> {td.card_count ?? 0}
        </span>
        {(fileCount ?? 0) > 0 && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Paperclip className="h-3 w-3 shrink-0" /> {fileCount}
          </span>
        )}
        {(examCount ?? 0) > 0 && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ClipboardList className="h-3 w-3 shrink-0" /> {examCount}
          </span>
        )}
        {(downloads ?? 0) > 0 && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Link2 className="h-3 w-3 shrink-0" /> {downloads}
          </span>
        )}
      </div>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      {(isAdmin || isOwner) && (
        <div onClick={e => e.stopPropagation()} className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onTogglePublish && (
                <DropdownMenuItem onClick={onTogglePublish}>
                  {td.is_published === false ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
                  {td.is_published === false ? 'Publicar' : 'Despublicar'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onEditPricing}>
                <Pencil className="mr-2 h-4 w-4" /> Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onRemove}>
                <Trash2 className="mr-2 h-4 w-4" /> Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  </div>
);

/* ── Folder Item ── */
const FolderItem = ({
  folder,
  deckCount,
  canEdit,
  isAdmin,
  onClick,
  onEdit,
  onDelete,
}: {
  folder: any;
  deckCount: number;
  canEdit: boolean;
  isAdmin: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <div
    className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer"
    onClick={onClick}
  >
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
      <Folder className="h-4 w-4 text-warning" />
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="font-medium text-sm text-foreground truncate">{folder.name}</h3>
      <span className="text-[11px] text-muted-foreground">{deckCount} decks</span>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {canEdit && (
        <div onClick={e => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" /> Renomear
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  </div>
);

/* ── Top Deck Card (same layout as PublicDeckCard in Discover tab) ── */
const TopDeckCard = ({
  td,
  onClick,
  inCollection,
  downloads,
  fileCount,
  examCount,
}: {
  td: any;
  onClick: () => void;
  inCollection: boolean;
  downloads: number;
  fileCount?: number;
  examCount?: number;
}) => (
  <div
    className="group cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between gap-3"
    onClick={onClick}
  >
    <div className="space-y-1">
      <h3 className="font-display font-bold text-sm text-foreground line-clamp-2 leading-snug">{td.deck_name}</h3>
      {downloads > 0 && (
        <p className="text-[11px] text-muted-foreground">{downloads} inscritos</p>
      )}
    </div>

    <div className="flex items-center gap-3 text-[11px] text-foreground">
      <span className="flex items-center gap-1">
        <Layers className="h-3 w-3 shrink-0" />
        <span className="font-bold">{td.card_count ?? 0}</span>
      </span>
      {(fileCount ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <Paperclip className="h-3 w-3 shrink-0" /> <span className="font-bold">{fileCount}</span>
        </span>
      )}
      {(examCount ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <ClipboardList className="h-3 w-3 shrink-0" /> <span className="font-bold">{examCount}</span>
        </span>
      )}
    </div>

    {inCollection ? (
      <span className="inline-flex items-center justify-center w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
        ✓ Inscrito
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-full rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        Ver deck
      </span>
    )}
  </div>
);

/* ── Main ContentTab ── */
const ContentTab = () => {
  const ctx = useTurmaDetail();
  const {
    turmaId, turma, subjects, turmaDecks, turmaExams,
    canEdit, isAdmin, isMod, isSubscriber, user,
    mutations, examMutations, toast, navigate,
    setShowAddSubject, setNewName, setNewDesc,
    setEditingSubject, setEditItemName,
    subscriptionPrice,
    contentFolderId, setContentFolderId,
    contentBreadcrumb,
  } = ctx;

  const contentMut = useContentMutations();
  const importLogic = useContentImport();

  // ── Local state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDeck, setShowAddDeck] = useState(false);
  const [addDeckSectionId, setAddDeckSectionId] = useState<string | null>(null);
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<string>>(new Set());
  const [deckSearchQuery, setDeckSearchQuery] = useState('');
  const [priceType, setPriceType] = useState<'free' | 'money' | 'credits'>('free');
  const [allowDownload, setAllowDownload] = useState(false);
  const [editingDeck, setEditingDeck] = useState<any>(null);
  const [editPriceType, setEditPriceType] = useState<'free' | 'money' | 'credits'>('free');
  const [editAllowDownload, setEditAllowDownload] = useState(false);
  const [confirmImportItem, setConfirmImportItem] = useState<{ type: 'deck' | 'exam'; data: any } | null>(null);
  const [importMode, setImportMode] = useState<'hierarchy' | 'flat'>('hierarchy');
  const [gateDeck, setGateDeck] = useState<any>(null);
  const [trialDeck, setTrialDeck] = useState<{ deckId: string; deckName: string } | null>(null);

  // ── Batch tags for all community decks ──
  const allDeckIds = useMemo(() => turmaDecks.map((d: any) => d.deck_id), [turmaDecks]);
  const { data: deckTagsMap = {} } = useDeckTagsBatch(allDeckIds);

  // ── Subscriber-only validation ──
  const canSetSubscribersOnly = (turma?.subscription_price ?? 0) > 0;

  const handleSetDeckPriceType = (newPriceType: string, setter: (v: any) => void) => {
    if (newPriceType === 'members_only' && !canSetSubscribersOnly) {
      toast({ title: 'Defina um preço de assinatura primeiro', description: 'Vá em Configurações → Assinatura para definir o preço.', variant: 'destructive' });
      return;
    }
    setter(newPriceType);
  };

  // ── Count downloads (inscrições) per turma_deck ──
  const { data: downloadCounts = {} } = useQuery({
    queryKey: ['turma-deck-downloads', turmaId],
    queryFn: async () => {
      const turmaDeckIds = turmaDecks.map((td: any) => td.id);
      if (turmaDeckIds.length === 0) return {};
      const { data } = await supabase
        .from('decks')
        .select('source_turma_deck_id')
        .in('source_turma_deck_id', turmaDeckIds);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((d: any) => {
        counts[d.source_turma_deck_id] = (counts[d.source_turma_deck_id] || 0) + 1;
      });
      return counts;
    },
    enabled: turmaDecks.length > 0,
    staleTime: 5 * 60_000,
  });

  // ── Count files per lesson_id ──
  const { data: fileCountsByLesson = {} } = useQuery({
    queryKey: ['turma-file-counts', turmaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('turma_lesson_files' as any)
        .select('lesson_id')
        .eq('turma_id', turmaId);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((f: any) => {
        counts[f.lesson_id] = (counts[f.lesson_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!turmaId,
    staleTime: 5 * 60_000,
  });

  // ── Count exams per lesson_id ──
  const { data: examCountsByLesson = {} } = useQuery({
    queryKey: ['turma-exam-counts-by-lesson', turmaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('turma_exams' as any)
        .select('lesson_id')
        .eq('turma_id', turmaId)
        .eq('is_published', true);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((e: any) => {
        if (e.lesson_id) counts[e.lesson_id] = (counts[e.lesson_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!turmaId,
    staleTime: 5 * 60_000,
  });

  // ── Helper: get file/exam count for a turma_deck ──
  const getDeckFilesCount = (td: any) => td.lesson_id ? (fileCountsByLesson[td.lesson_id] || 0) : 0;
  const getDeckExamsCount = (td: any) => td.lesson_id ? (examCountsByLesson[td.lesson_id] || 0) : 0;

  const currentFolders = useMemo(() => {
    return subjects
      .filter((s: any) => (s.parent_id ?? null) === contentFolderId)
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [subjects, contentFolderId]);

  // ── Count decks recursively in a folder ──
  const countDecksInFolder = (folderId: string): number => {
    const direct = turmaDecks.filter((d: any) => d.subject_id === folderId && (isAdmin || d.is_published !== false)).length;
    const childFolders = subjects.filter((s: any) => s.parent_id === folderId);
    return direct + childFolders.reduce((sum: number, cf: any) => sum + countDecksInFolder(cf.id), 0);
  };

  // ── Current folder's decks ──
  const currentDecks = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return turmaDecks
      .filter((d: any) => d.subject_id === contentFolderId)
      .filter((d: any) => isAdmin || d.is_published !== false)
      .filter((d: any) => !q || (d.deck_name || '').toLowerCase().includes(q));
  }, [turmaDecks, contentFolderId, searchQuery, isAdmin]);

  // ── Top decks (most subscribed across the entire community) ──
  const topDecks = useMemo(() => {
    return [...turmaDecks]
      .filter((d: any) => isAdmin || d.is_published !== false)
      .sort((a: any, b: any) => (downloadCounts[b.id] || 0) - (downloadCounts[a.id] || 0))
      .slice(0, 8);
  }, [turmaDecks, downloadCounts, isAdmin]);

  const hasContent = turmaDecks.length > 0 || turmaExams.length > 0 || subjects.length > 0;
  const isRoot = contentFolderId === null;

  // ── Deck handlers ──
  const handleAddDeck = () => {
    if (selectedDeckIds.size === 0) return;
    // Only share root-level selected decks (parent NOT also selected)
    // The sharing system auto-publishes the subtree
    const allAvailable = importLogic.availableDecks;
    const rootsToShare = Array.from(selectedDeckIds).filter(id => {
      const deck = allAvailable.find(d => d.id === id);
      if (!deck?.parent_deck_id) return true;
      return !selectedDeckIds.has(deck.parent_deck_id);
    });
    if (rootsToShare.length === 0) return;
    let completed = 0;
    rootsToShare.forEach(deckId => {
      const finalPrice = priceType === 'free' ? 0 : 0;
      mutations.shareDeck.mutate({ deckId, subjectId: addDeckSectionId, lessonId: undefined, price: finalPrice, priceType, allowDownload } as any, {
        onSuccess: () => {
          completed++;
          if (completed === rootsToShare.length) {
            setShowAddDeck(false); setSelectedDeckIds(new Set()); setPriceType('free'); setAllowDownload(false); setDeckSearchQuery('');
            toast({ title: `${rootsToShare.length} baralho(s) adicionado(s)!` });
          }
        },
        onError: (e: any) => toast({ title: e.message?.includes('duplicate') ? 'Baralho já adicionado' : 'Erro', variant: 'destructive' }),
      });
    });
  };

  const openEditPricing = (td: any) => {
    setEditingDeck(td);
    setEditPriceType(td.price_type || 'free');
    setEditAllowDownload(td.allow_download ?? false);
  };

  const handleEditPricing = () => {
    if (!editingDeck) return;
    const finalPrice = editPriceType === 'free' ? 0 : 0;
    mutations.updateDeckPricing.mutate({ id: editingDeck.id, price: finalPrice, priceType: editPriceType, allowDownload: editAllowDownload }, {
      onSuccess: () => { setEditingDeck(null); toast({ title: 'Configuração atualizada!' }); },
      onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
    });
  };

  const handleDeckClick = (td: any) => {
    const subscriberOnly = !importLogic.isDeckFree(td);
    const canImportDeck = importLogic.canAccessDeck(td);
    if (subscriberOnly && !canImportDeck) { setGateDeck(td); return; }
    navigate(`/decks/${td.deck_id}/preview`, { state: { from: 'community', turmaId } });
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      {!isRoot && (
        <div className="flex items-center gap-1.5 text-sm">
          {contentBreadcrumb.map((item, idx) => (
            <span key={item.id ?? 'root'} className="flex items-center gap-1.5">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <button
                type="button"
                onClick={() => setContentFolderId(item.id)}
                className={`hover:text-primary transition-colors ${
                  idx === contentBreadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {item.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center gap-2">
        {!isRoot && (
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => {
            // Go up one level
            const currentFolder = subjects.find((s: any) => s.id === contentFolderId);
            setContentFolderId(currentFolder?.parent_id ?? null);
          }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {hasContent && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar decks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        )}
        {canEdit && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="outline" size="sm" onClick={() => { setShowAddSubject(true); setNewName(''); setNewDesc(''); }} className="gap-1.5">
              <FolderPlus className="h-4 w-4" /><span className="hidden sm:inline">Pasta</span>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => { setAddDeckSectionId(contentFolderId); setShowAddDeck(true); setAllowDownload(false); }}>
              <Plus className="h-4 w-4" /><span className="hidden sm:inline">Deck</span>
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {!hasContent ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 text-center">
          <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-display text-lg font-bold text-foreground">Nenhum conteúdo ainda</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {canEdit ? 'Crie uma pasta e adicione seus decks.' : 'O criador ainda não adicionou conteúdo.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Folders ── */}
          {currentFolders.length > 0 && (
            <div className="space-y-1.5">
              {currentFolders.map((folder: any) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  deckCount={countDecksInFolder(folder.id)}
                  canEdit={canEdit}
                  isAdmin={isAdmin}
                  onClick={() => setContentFolderId(folder.id)}
                  onEdit={() => {
                    setEditingSubject({ id: folder.id, name: folder.name });
                    setEditItemName(folder.name);
                  }}
                  onDelete={() => {
                    mutations.deleteSubject.mutate(folder.id, {
                      onSuccess: () => toast({ title: 'Pasta excluída' }),
                      onError: (e: any) => toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' }),
                    });
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Decks in current folder ── */}
          {currentDecks.length > 0 && (
            <div className="space-y-1.5">
              {currentDecks.map((td: any) => {
                const alreadyLinked = importLogic.userHasLinkedDeck(td.id);
                const alreadyOwns = importLogic.userOwnsDeck(td.deck_id);
                const inCollection = alreadyOwns || alreadyLinked;
                const subscriberOnly = !importLogic.isDeckFree(td);
                const canImportDeck = importLogic.canAccessDeck(td);
                const isDeckOwner = td.shared_by === user?.id;
                return (
                  <DeckListItem
                    key={td.id}
                    td={td}
                    onClick={() => handleDeckClick(td)}
                    inCollection={inCollection}
                    subscriberOnly={subscriberOnly}
                    canImport={canImportDeck}
                    isOwner={isDeckOwner}
                    isAdmin={isAdmin}
                    onEditPricing={() => openEditPricing(td)}
                    onRemove={() => mutations.unshareDeck.mutate(td.id, {
                      onSuccess: () => toast({ title: 'Baralho removido' }),
                      onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
                    })}
                    onTogglePublish={(isAdmin || isDeckOwner) ? () => {
                      mutations.toggleDeckPublished.mutate({ id: td.id, isPublished: td.is_published === false }, {
                        onSuccess: () => toast({ title: td.is_published === false ? 'Deck publicado' : 'Deck despublicado' }),
                        onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
                      });
                    } : undefined}
                    tags={deckTagsMap[td.deck_id]}
                    downloads={downloadCounts[td.id] || 0}
                    fileCount={getDeckFilesCount(td)}
                    examCount={getDeckExamsCount(td)}
                  />
                );
              })}
            </div>
          )}

          {/* Empty state for current folder */}
          {currentFolders.length === 0 && currentDecks.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-border py-8 text-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {isRoot ? 'Nenhum conteúdo nesta comunidade' : 'Pasta vazia'}
              </p>
              {canEdit && (
                <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => { setAddDeckSectionId(contentFolderId); setShowAddDeck(true); setAllowDownload(false); }}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar deck
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Confirm Import Dialog ── */}
      <Dialog open={!!confirmImportItem} onOpenChange={(open) => { if (!open) { setConfirmImportItem(null); setImportMode('hierarchy'); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar à coleção?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmImportItem?.type === 'deck'
              ? `O baralho "${confirmImportItem?.data?.deck_name}" será adicionado à sua pasta "${turma?.name}".`
              : `A prova "${confirmImportItem?.data?.title}" será adicionada à sua coleção de provas.`}
          </p>
          {confirmImportItem?.type === 'deck' && turmaDecks.filter((d: any) => d.parent_deck_id === confirmImportItem?.data?.deck_id).length > 0 && (
            <div className="space-y-2 mt-2">
              <p className="text-xs font-semibold text-muted-foreground">Este deck possui sub-decks. Como importar?</p>
              <div className="flex gap-2">
                <Button variant={importMode === 'hierarchy' ? 'default' : 'outline'} size="sm" className="flex-1 text-xs" onClick={() => setImportMode('hierarchy')}>Manter hierarquia</Button>
                <Button variant={importMode === 'flat' ? 'default' : 'outline'} size="sm" className="flex-1 text-xs" onClick={() => setImportMode('flat')}>Tudo em 1 deck</Button>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmImportItem(null)}>Cancelar</Button>
            <Button size="sm" onClick={() => {
              if (confirmImportItem?.type === 'deck') {
                const children = turmaDecks.filter((d: any) => d.parent_deck_id === confirmImportItem.data.deck_id);
                importLogic.addToCollection.mutate(
                  { ...confirmImportItem.data, _importMode: importMode, _childTds: children.length > 0 ? children : [] },
                  { onSuccess: (newDeck: any) => { if (newDeck?.id) navigate(`/decks/${newDeck.id}`, { state: { from: 'community', turmaId } }); } },
                );
              } else if (confirmImportItem?.type === 'exam') {
                importLogic.addExamToCollection.mutate(confirmImportItem.data, {
                  onSuccess: (result: any) => { if (result?.examId) navigate(`/exam/${result.examId}`, { state: { from: 'community', turmaId } }); },
                });
              }
              setConfirmImportItem(null);
            }}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Adicionar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Deck Dialog */}
      <Dialog open={showAddDeck} onOpenChange={v => { if (!v) { setShowAddDeck(false); setSelectedDeckIds(new Set()); setDeckSearchQuery(''); } else setShowAddDeck(true); }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Adicionar Baralhos</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar baralhos..." value={deckSearchQuery} onChange={e => setDeckSearchQuery(e.target.value)} className="pl-9 h-9" />
            </div>
            {(() => {
              const q = deckSearchQuery.toLowerCase();
              const allAvailable = importLogic.availableDecks;
              const filtered = allAvailable.filter(d => !q || d.name.toLowerCase().includes(q));
              const filteredIds = new Set(filtered.map(d => d.id));
              const allSelected = filtered.length > 0 && filtered.every(d => selectedDeckIds.has(d.id));

              // Build hierarchy
              const roots = filtered.filter(d => !d.parent_deck_id || !filteredIds.has(d.parent_deck_id));
              const childrenMap = new Map<string, typeof filtered>();
              filtered.forEach(d => {
                const pid = d.parent_deck_id;
                if (pid && filteredIds.has(pid)) {
                  if (!childrenMap.has(pid)) childrenMap.set(pid, []);
                  childrenMap.get(pid)!.push(d);
                }
              });
              const flatList: { deck: typeof filtered[0]; depth: number }[] = [];
              const walk = (items: typeof filtered, depth: number) => {
                items.forEach(d => {
                  flatList.push({ deck: d, depth });
                  const kids = childrenMap.get(d.id);
                  if (kids) walk(kids, depth + 1);
                });
              };
              walk(roots, 0);

              // Collect all descendants of a deck
              const getDescendants = (id: string): string[] => {
                const kids = childrenMap.get(id) ?? [];
                const result: string[] = [];
                kids.forEach(k => { result.push(k.id); result.push(...getDescendants(k.id)); });
                return result;
              };

              // Toggle with cascading to descendants
              const toggleDeck = (id: string) => {
                const next = new Set(selectedDeckIds);
                const descendants = getDescendants(id);
                if (next.has(id)) {
                  next.delete(id);
                  descendants.forEach(cid => next.delete(cid));
                } else {
                  next.add(id);
                  descendants.forEach(cid => next.add(cid));
                }
                setSelectedDeckIds(next);
              };

              // Recursive card count: sum own cards + all descendants
              const getCardCount = (d: typeof filtered[0]): number => {
                const own = (d.new_count ?? 0) + (d.learning_count ?? 0) + (d.review_count ?? 0);
                const kids = childrenMap.get(d.id) ?? [];
                return own + kids.reduce((sum, kid) => sum + getCardCount(kid), 0);
              };

              return (
                <div className="flex-1 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {flatList.length === 0 ? (
                    <div className="py-8 text-center">
                      <Layers className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Nenhum baralho disponível</p>
                    </div>
                  ) : (
                    <>
                      <label className="flex items-center gap-3 px-3 py-2.5 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => {
                            if (allSelected) setSelectedDeckIds(new Set());
                            else setSelectedDeckIds(new Set(filtered.map(d => d.id)));
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-xs font-semibold text-muted-foreground">Selecionar todos ({filtered.length})</span>
                      </label>
                      {flatList.map(({ deck: d, depth }) => (
                        <label key={d.id} className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors" style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: 12 }}>
                          <Checkbox
                            checked={selectedDeckIds.has(d.id)}
                            onCheckedChange={() => toggleDeck(d.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${depth === 0 ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>{d.name}</p>
                          </div>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Layers className="h-3 w-3" /> {getCardCount(d)}
                          </span>
                        </label>
                      ))}
                    </>
                  )}
                </div>
              );
            })()}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Visibilidade</p>
              <div className="flex gap-2">
                {([{ value: 'free', label: 'Liberado', icon: Globe }, { value: 'members_only', label: 'Assinantes', icon: Lock }] as const).map(opt => (
                  <Button key={opt.value} variant={priceType === opt.value ? 'default' : 'outline'} size="sm" onClick={() => handleSetDeckPriceType(opt.value, setPriceType)} className="gap-1.5 flex-1">
                    <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div className="space-y-0.5"><Label className="text-sm font-medium">Permitir download</Label><p className="text-xs text-muted-foreground">Cópia independente</p></div>
              <Switch checked={allowDownload} onCheckedChange={setAllowDownload} />
            </div>
            <Button className="w-full" disabled={selectedDeckIds.size === 0 || mutations.shareDeck.isPending} onClick={handleAddDeck}>
              {mutations.shareDeck.isPending ? 'Adicionando...' : `Adicionar ${selectedDeckIds.size > 0 ? `(${selectedDeckIds.size})` : ''}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Pricing Dialog */}
      <Dialog open={!!editingDeck} onOpenChange={open => !open && setEditingDeck(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Configuração</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Visibilidade</p>
              <div className="flex gap-2">
                {([{ value: 'free', label: 'Liberado', icon: Globe }, { value: 'members_only', label: 'Assinantes', icon: Lock }] as const).map(opt => (
                  <Button key={opt.value} variant={editPriceType === opt.value ? 'default' : 'outline'} size="sm" onClick={() => handleSetDeckPriceType(opt.value, setEditPriceType)} className="gap-1.5 flex-1">
                    <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div className="space-y-0.5"><Label className="text-sm font-medium">Permitir download</Label><p className="text-xs text-muted-foreground">Cópia independente</p></div>
              <Switch checked={editAllowDownload} onCheckedChange={setEditAllowDownload} />
            </div>
            <Button className="w-full" disabled={mutations.updateDeckPricing.isPending} onClick={handleEditPricing}>
              {mutations.updateDeckPricing.isPending ? 'Salvando...' : 'Salvar Configuração'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Exam Dialog */}
      <Dialog open={importLogic.showImportExam} onOpenChange={importLogic.setShowImportExam}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Import className="h-5 w-5 text-primary" /> Importar Prova
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione uma prova pessoal para importar.</p>
          <div className="flex-1 overflow-y-auto space-y-1 mt-2">
            {importLogic.loadingExams ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : importLogic.personalExams.length === 0 ? (
              <div className="text-center py-6">
                <ClipboardList className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma prova pessoal encontrada.</p>
              </div>
            ) : importLogic.personalExams.map((exam: any) => {
              const qCount = (importLogic.personalQuestionCounts as any)[exam.id] || 0;
              return (
                <div key={exam.id} className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-card-foreground truncate">{exam.title}</h4>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {qCount > 0 && <span>{qCount} questões</span>}
                      {exam.time_limit_seconds && <span>· {Math.round(exam.time_limit_seconds / 60)}min</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={importLogic.importingExamId === exam.id} onClick={() => importLogic.handleImportExamToTurma(exam)} className="gap-1.5 shrink-0">
                    {importLogic.importingExamId === exam.id ? 'Importando...' : 'Importar'}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscriber Gate Dialog */}
      <SubscriberGateDialog
        open={!!gateDeck}
        onOpenChange={open => !open && setGateDeck(null)}
        deckName={gateDeck?.deck_name || ''}
        cardCount={gateDeck?.card_count ?? 0}
        onTrial={() => {
          const deck = gateDeck;
          setGateDeck(null);
          setTrialDeck({ deckId: deck.deck_id, deckName: deck.deck_name });
        }}
        onSubscribe={() => {
          setGateDeck(null);
          ctx.handleSubscribe?.();
        }}
      />

      {/* Trial Study Modal */}
      <TrialStudyModal
        open={!!trialDeck}
        onOpenChange={open => !open && setTrialDeck(null)}
        deckId={trialDeck?.deckId || ''}
        deckName={trialDeck?.deckName || ''}
      />
    </div>
  );
};

export default ContentTab;
