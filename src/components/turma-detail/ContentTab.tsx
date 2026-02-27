/**
 * ContentTab – Sections-based community content view.
 * Each section (subject) displays decks in a grid layout similar to marketplace.
 * Clicking a deck navigates to /decks/:id/preview.
 */

import { useState, useMemo, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTurmaDetail } from './TurmaDetailContext';
import { useContentMutations } from './content/useContentMutations';
import { useContentImport } from './content/useContentImport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Plus, FolderPlus, MoreVertical,
  Layers, Pencil, Trash2, Eye,
  Upload, Download, Lock, Crown, Globe,
  Copy, Link2, ClipboardList, Clock, Import, LogIn,
  Search, Sparkles,
} from 'lucide-react';
import DeckPreviewSheet from '@/components/community/DeckPreviewSheet';
import SubscriberGateDialog from '@/components/turma-detail/SubscriberGateDialog';
import TrialStudyModal from '@/components/turma-detail/TrialStudyModal';

/* ── Deck Card (marketplace-style) ── */
const DeckCard = ({
  td,
  onClick,
  inCollection,
  subscriberOnly,
  canImport,
  isOwner,
  isAdmin,
  onImport,
  onGate,
  onOpen,
  onEditPricing,
  onRemove,
}: {
  td: any;
  onClick: () => void;
  inCollection: boolean;
  subscriberOnly: boolean;
  canImport: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  onImport: () => void;
  onGate: () => void;
  onOpen: () => void;
  onEditPricing: () => void;
  onRemove: () => void;
}) => (
  <div
    className="group cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between gap-3"
    onClick={onClick}
  >
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <h3 className="font-display font-bold text-sm text-foreground line-clamp-2 leading-snug flex-1">
          {td.deck_name}
        </h3>
        {subscriberOnly && <Crown className="h-4 w-4 shrink-0 text-purple-500 fill-purple-500/20" />}
        {inCollection && <Link2 className="h-3.5 w-3.5 shrink-0 text-info" />}
      </div>
    </div>

    <div className="flex items-center gap-4">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Layers className="h-3.5 w-3.5 text-foreground" />
        <span className="font-bold text-foreground">{td.card_count ?? 0}</span>
        cards
      </span>
    </div>

    {inCollection ? (
      <span className="inline-flex items-center justify-center w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
        ✓ Na coleção
      </span>
    ) : subscriberOnly && !canImport ? (
      <span className="inline-flex items-center justify-center w-full rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground gap-1">
        <Lock className="h-3 w-3" /> Exclusivo
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-full rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        Ver deck
      </span>
    )}

    {/* Admin actions overlay */}
    {(isAdmin || isOwner) && (
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
  </div>
);

/* ── Exam Card (compact) ── */
const ExamCard = ({
  exam,
  imported,
  isAdmin,
  onImport,
  onOpen,
  onDelete,
}: {
  exam: any;
  imported: boolean;
  isAdmin: boolean;
  onImport: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) => (
  <div className="group relative cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between gap-3"
    onClick={imported ? onOpen : onImport}
  >
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
        <h3 className="font-display font-bold text-sm text-foreground line-clamp-2 leading-snug flex-1">
          {exam.title}
        </h3>
        {exam.subscribers_only && <Crown className="h-4 w-4 shrink-0 text-purple-500 fill-purple-500/20" />}
      </div>
    </div>
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>{exam.total_questions} questões</span>
      {exam.time_limit_seconds && (
        <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {Math.round(exam.time_limit_seconds / 60)}min</span>
      )}
    </div>
    {imported ? (
      <span className="inline-flex items-center justify-center w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
        ✓ Importada
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-full rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        Fazer prova
      </span>
    )}
    {isAdmin && (
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )}
  </div>
);

/* ── Section Header ── */
const SectionHeader = ({
  name,
  canEdit,
  isAdmin,
  onEdit,
  onDelete,
  onAddDeck,
}: {
  name: string;
  canEdit: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddDeck: () => void;
}) => (
  <div className="flex items-center justify-between mb-3">
    <h2 className="font-display text-base font-bold text-foreground">{name}</h2>
    {canEdit && (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={onAddDeck}>
          <Plus className="h-3.5 w-3.5" /> Deck
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" /> Renomear Seção
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                  <Trash2 className="mr-2 h-4 w-4" /> Excluir Seção
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
  const [gateDeck, setGateDeck] = useState<any>(null);
  const [trialDeck, setTrialDeck] = useState<{ deckId: string; deckName: string } | null>(null);

  // ── Subscriber-only validation ──
  const canSetSubscribersOnly = (turma?.subscription_price ?? 0) > 0;

  const handleSetDeckPriceType = (newPriceType: string, setter: (v: any) => void) => {
    if (newPriceType === 'members_only' && !canSetSubscribersOnly) {
      toast({
        title: 'Defina um preço de assinatura primeiro',
        description: 'Vá em Configurações → Assinatura para definir o preço.',
        variant: 'destructive',
      });
      return;
    }
    setter(newPriceType);
  };

  // ── Sections: root subjects only (no nesting) ──
  const sections = useMemo(() => {
    return subjects
      .filter((s: any) => !s.parent_id)
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [subjects]);

  // ── Decks grouped by section ──
  const getDecksBySection = (sectionId: string | null) => {
    const q = searchQuery.toLowerCase();
    return turmaDecks
      .filter((d: any) => d.subject_id === sectionId)
      .filter((d: any) => !q || (d.deck_name || '').toLowerCase().includes(q));
  };

  // ── Exams grouped by section ──
  const getExamsBySection = (sectionId: string | null) => {
    const q = searchQuery.toLowerCase();
    return turmaExams
      .filter((e: any) => e.subject_id === sectionId)
      .filter((e: any) => !q || (e.title || '').toLowerCase().includes(q));
  };

  const rootDecks = getDecksBySection(null);
  const rootExams = getExamsBySection(null);

  const hasContent = turmaDecks.length > 0 || turmaExams.length > 0 || sections.length > 0;

  // ── Deck handlers ──
  const handleAddDeck = () => {
    if (selectedDeckIds.size === 0) return;
    const deckArray = Array.from(selectedDeckIds);
    let completed = 0;
    deckArray.forEach(deckId => {
      const finalPrice = priceType === 'free' ? 0 : 0;
      mutations.shareDeck.mutate({ deckId, subjectId: addDeckSectionId, lessonId: undefined, price: finalPrice, priceType, allowDownload } as any, {
        onSuccess: () => {
          completed++;
          if (completed === deckArray.length) {
            setShowAddDeck(false); setSelectedDeckIds(new Set()); setPriceType('free'); setAllowDownload(false); setDeckSearchQuery('');
            toast({ title: `${deckArray.length} baralho(s) adicionado(s)!` });
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
    const alreadyLinked = importLogic.userHasLinkedDeck(td.id);
    const alreadyOwns = importLogic.userOwnsDeck(td.deck_id);
    const inCollection = alreadyOwns || alreadyLinked;
    const subscriberOnly = !importLogic.isDeckFree(td);
    const canImportDeck = importLogic.canAccessDeck(td);

    if (inCollection) {
      const personalId = importLogic.getPersonalDeckId(td.id) || (alreadyOwns ? td.deck_id : null);
      if (personalId) navigate(`/decks/${personalId}`, { state: { from: 'community', turmaId } });
      return;
    }

    if (subscriberOnly && !canImportDeck) {
      setGateDeck(td);
      return;
    }

    // Navigate to public deck preview
    navigate(`/decks/${td.deck_id}/preview`);
  };

  // ── Render section with its decks and exams ──
  const renderSection = (sectionId: string | null, sectionName: string, sectionSubject?: any) => {
    const sectionDecks = getDecksBySection(sectionId);
    const sectionExams = getExamsBySection(sectionId);

    if (sectionDecks.length === 0 && sectionExams.length === 0 && !canEdit) return null;

    return (
      <section key={sectionId ?? 'root'} className="mb-8">
        {sectionId !== null && (
          <SectionHeader
            name={sectionName}
            canEdit={canEdit}
            isAdmin={isAdmin}
            onAddDeck={() => { setAddDeckSectionId(sectionId); setShowAddDeck(true); setAllowDownload(false); }}
            onEdit={() => {
              if (sectionSubject) {
                setEditingSubject({ id: sectionSubject.id, name: sectionSubject.name });
                setEditItemName(sectionSubject.name);
              }
            }}
            onDelete={() => {
              mutations.deleteSubject.mutate(sectionSubject.id, {
                onSuccess: () => toast({ title: 'Seção excluída' }),
                onError: (e: any) => toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' }),
              });
            }}
          />
        )}

        {/* Decks grid */}
        {sectionDecks.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {sectionDecks.map((td: any) => {
              const alreadyLinked = importLogic.userHasLinkedDeck(td.id);
              const alreadyOwns = importLogic.userOwnsDeck(td.deck_id);
              const inCollection = alreadyOwns || alreadyLinked;
              const subscriberOnly = !importLogic.isDeckFree(td);
              const canImportDeck = importLogic.canAccessDeck(td);
              const isOwner = td.shared_by === user?.id;

              return (
                <div key={td.id} className="relative">
                  <DeckCard
                    td={td}
                    onClick={() => handleDeckClick(td)}
                    inCollection={inCollection}
                    subscriberOnly={subscriberOnly}
                    canImport={canImportDeck}
                    isOwner={isOwner}
                    isAdmin={isAdmin}
                    onImport={() => setConfirmImportItem({ type: 'deck', data: td })}
                    onGate={() => setGateDeck(td)}
                    onOpen={() => {
                      const personalId = importLogic.getPersonalDeckId(td.id) || (alreadyOwns ? td.deck_id : null);
                      if (personalId) navigate(`/decks/${personalId}`, { state: { from: 'community', turmaId } });
                    }}
                    onEditPricing={() => openEditPricing(td)}
                    onRemove={() => mutations.unshareDeck.mutate(td.id, {
                      onSuccess: () => toast({ title: 'Baralho removido' }),
                      onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
                    })}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Exams grid */}
        {sectionExams.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {sectionExams.map((exam: any) => {
              const imported = importLogic.userHasImportedExam(exam.id);
              const personalExamId = importLogic.getPersonalExamId(exam.id);
              return (
                <ExamCard
                  key={exam.id}
                  exam={exam}
                  imported={imported}
                  isAdmin={isAdmin || exam.created_by === user?.id}
                  onImport={() => setConfirmImportItem({ type: 'exam', data: exam })}
                  onOpen={() => { if (personalExamId) navigate(`/exam/${personalExamId}`, { state: { from: 'community', turmaId } }); }}
                  onDelete={() => examMutations.deleteExam.mutate(exam.id, {
                    onSuccess: () => toast({ title: 'Prova excluída' }),
                    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
                  })}
                />
              );
            })}
          </div>
        )}

        {/* Empty section (admin only) */}
        {sectionDecks.length === 0 && sectionExams.length === 0 && canEdit && sectionId !== null && (
          <div className="rounded-xl border-2 border-dashed border-border py-6 text-center">
            <p className="text-sm text-muted-foreground">Seção vazia</p>
            <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => { setAddDeckSectionId(sectionId); setShowAddDeck(true); setAllowDownload(false); }}>
              <Plus className="h-3.5 w-3.5" /> Adicionar deck
            </Button>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center gap-2">
        {hasContent && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar decks e provas..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => { setShowAddSubject(true); setNewName(''); setNewDesc(''); }} className="gap-1.5">
                <FolderPlus className="h-4 w-4" /><span className="hidden sm:inline">Seção</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" /><span className="hidden sm:inline">Adicionar</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => importLogic.setShowImportExam(true)}>
                    <ClipboardList className="mr-2 h-4 w-4" /> Prova
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {!hasContent ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 text-center">
          <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-display text-lg font-bold text-foreground">Nenhum conteúdo ainda</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {canEdit ? 'Crie uma seção e adicione seus decks.' : 'O criador ainda não adicionou conteúdo.'}
          </p>
        </div>
      ) : (
        <>
          {/* Sections */}
          {sections.map(section => renderSection(section.id, section.name, section))}
        </>
      )}

      {/* ── Confirm Import Dialog ── */}
      <Dialog open={!!confirmImportItem} onOpenChange={(open) => !open && setConfirmImportItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar à coleção?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmImportItem?.type === 'deck'
              ? `O baralho "${confirmImportItem?.data?.deck_name}" será adicionado à sua pasta "${turma?.name}".`
              : `A prova "${confirmImportItem?.data?.title}" será adicionada à sua coleção de provas.`}
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmImportItem(null)}>Cancelar</Button>
            <Button size="sm" onClick={() => {
              if (confirmImportItem?.type === 'deck') {
                importLogic.addToCollection.mutate(confirmImportItem.data, {
                  onSuccess: (newDeck: any) => { if (newDeck?.id) navigate(`/decks/${newDeck.id}`, { state: { from: 'community', turmaId } }); },
                });
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

      {/* Add Deck Dialog – Multi-select with search & folder grouping */}
      <Dialog open={showAddDeck} onOpenChange={v => { if (!v) { setShowAddDeck(false); setSelectedDeckIds(new Set()); setDeckSearchQuery(''); } else setShowAddDeck(true); }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Adicionar Baralhos</DialogTitle>
            {addDeckSectionId && (
              <p className="text-sm text-muted-foreground mt-1">
                Seção: <span className="font-medium text-foreground">{sections.find(s => s.id === addDeckSectionId)?.name}</span>
              </p>
            )}
          </DialogHeader>
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar baralhos..." value={deckSearchQuery} onChange={e => setDeckSearchQuery(e.target.value)} className="pl-9 h-9" />
            </div>
            {(() => {
              const q = deckSearchQuery.toLowerCase();
              const filtered = importLogic.availableDecks.filter(d => !q || d.name.toLowerCase().includes(q));
              // Group by folder
              const grouped = new Map<string | null, typeof filtered>();
              filtered.forEach(d => {
                const fId = (d as any).folder_id ?? null;
                if (!grouped.has(fId)) grouped.set(fId, []);
                grouped.get(fId)!.push(d);
              });
              // Resolve folder names from useDecks context (folders not directly available here, use parent info)
              const allSelected = filtered.length > 0 && filtered.every(d => selectedDeckIds.has(d.id));
              return (
                <div className="flex-1 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {filtered.length === 0 ? (
                    <div className="py-8 text-center">
                      <Layers className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Nenhum baralho disponível</p>
                    </div>
                  ) : (
                    <>
                      {/* Select all */}
                      <label className="flex items-center gap-3 px-3 py-2.5 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => {
                            if (allSelected) setSelectedDeckIds(new Set());
                            else setSelectedDeckIds(new Set(filtered.map(d => d.id)));
                          }}
                          className="h-4 w-4 rounded border-primary text-primary accent-primary"
                        />
                        <span className="text-xs font-semibold text-muted-foreground">Selecionar todos ({filtered.length})</span>
                      </label>
                      {Array.from(grouped.entries()).map(([folderId, decks]) => {
                        const folderName = folderId ? (decks[0] as any).folder_name || 'Pasta' : 'Sem pasta';
                        return (
                          <div key={folderId ?? 'none'}>
                            {grouped.size > 1 && (
                              <div className="px-3 py-1.5 bg-muted/20 border-b border-border">
                                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{folderName}</span>
                              </div>
                            )}
                            {decks.map(d => (
                              <label key={d.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={selectedDeckIds.has(d.id)}
                                  onChange={() => {
                                    const next = new Set(selectedDeckIds);
                                    if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                                    setSelectedDeckIds(next);
                                  }}
                                  className="h-4 w-4 rounded border-primary text-primary accent-primary"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
                                </div>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                  <Layers className="h-3 w-3" /> {(d as any).card_count ?? 0}
                                </span>
                              </label>
                            ))}
                          </div>
                        );
                      })}
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
