/**
 * All Dashboard dialogs — create, rename, move, delete, bulk move, duplicate warning.
 */

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, ArrowUpRight, ChevronRight, CirclePlus, Search, Layers, RefreshCw } from 'lucide-react';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';
import type { BreadcrumbItem } from './useDashboardState';

interface Folder { id: string; name: string; parent_id: string | null; is_archived: boolean; image_url?: string | null; source_turma_id?: string | null }
interface MovableDeck { id: string; name: string; parent_deck_id: string | null }

interface DashboardDialogsProps {
  // Create
  createType: 'deck' | 'folder' | null;
  setCreateType: (v: 'deck' | 'folder' | null) => void;
  createName: string;
  setCreateName: (v: string) => void;
  createParentDeckId: string | null;
  setCreateParentDeckId: (v: string | null) => void;
  onCreateSubmit: () => void;
  isCreating?: boolean;

  // Rename
  renameTarget: { type: 'deck' | 'folder'; id: string; name: string } | null;
  setRenameTarget: (v: any) => void;
  renameName: string;
  setRenameName: (v: string) => void;
  onRenameSubmit: () => void;

  // Move
  moveTarget: { type: 'deck' | 'folder'; id: string; name: string } | null;
  setMoveTarget: (v: any) => void;
  moveBrowseFolderId: string | null;
  setMoveBrowseFolderId: (v: string | null) => void;
  moveParentDeckId: string | null;
  setMoveParentDeckId: (v: string | null) => void;
  moveBreadcrumb: BreadcrumbItem[];
  movableFolders: Folder[];
  movableDecks: MovableDeck[];
  folders: Folder[];
  decks: { id: string; name: string; parent_deck_id: string | null; folder_id: string | null }[];
  onMoveSubmit: () => void;
  onCreateFolderInMove: () => void;

  // Delete
  deleteTarget: { type: 'deck' | 'folder'; id: string; name: string } | null;
  setDeleteTarget: (v: any) => void;
  onDeleteSubmit: () => void;

  // Duplicate warning
  duplicateWarning: { name: string; type: 'deck' | 'folder'; action: () => void } | null;
  setDuplicateWarning: (v: any) => void;
  setCreateNameFromDuplicate: (name: string) => void;

  // Bulk move
  bulkMoveDeckOpen: boolean;
  setBulkMoveDeckOpen: (v: boolean) => void;
  bulkMoveTargetFolder: string | null;
  setBulkMoveTargetFolder: (v: string | null) => void;
  selectedDeckCount: number;
  onBulkMoveSubmit: () => void;
}

/** Shared move browser for bulk move (folders) */
const FolderBrowser = ({
  folders,
  movableFolders,
  moveBrowseFolderId,
  setMoveBrowseFolderId,
  onMoveSubmit,
  onCancel,
  submitLabel,
}: {
  folders: Folder[];
  movableFolders: Folder[];
  moveBrowseFolderId: string | null;
  setMoveBrowseFolderId: (v: string | null) => void;
  onMoveSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const q = searchQuery.toLowerCase().trim();
  const filteredFolders = q
    ? folders.filter(f => !f.is_archived && f.name.toLowerCase().includes(q))
    : movableFolders;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar sala..." className="pl-9 h-9 text-sm" />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {moveBrowseFolderId && !q && (
          <button onClick={() => {
            const parent = folders.find(f => f.id === moveBrowseFolderId);
            setMoveBrowseFolderId(parent?.parent_id ?? null);
          }} className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Voltar</span>
          </button>
        )}
        {filteredFolders.map(f => (
          <button
            key={f.id}
            onClick={() => { setMoveBrowseFolderId(f.id); setSearchQuery(''); }}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
          >
            <img src={f.image_url || defaultSalaIcon} alt={f.name} className="h-8 w-8 rounded-lg object-cover shrink-0" />
            <span className="flex-1 text-left font-medium truncate">{f.name}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}
        {filteredFolders.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {q ? `Nenhum resultado para "${searchQuery}"` : 'Nenhuma sala disponível'}
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">Cancelar</Button>
        <Button size="sm" onClick={onMoveSubmit} className="flex-1">{submitLabel}</Button>
      </div>
    </div>
  );
};

/** Move dialog specifically for decks — 2 phases */
const DeckMoveDialog = ({
  moveTarget,
  setMoveTarget,
  moveBrowseFolderId,
  setMoveBrowseFolderId,
  moveParentDeckId,
  setMoveParentDeckId,
  folders,
  decks,
  onMoveSubmit,
}: {
  moveTarget: { type: 'deck' | 'folder'; id: string; name: string };
  setMoveTarget: (v: any) => void;
  moveBrowseFolderId: string | null;
  setMoveBrowseFolderId: (v: string | null) => void;
  moveParentDeckId: string | null;
  setMoveParentDeckId: (v: string | null) => void;
  folders: Folder[];
  decks: { id: string; name: string; parent_deck_id: string | null; folder_id: string | null }[];
  onMoveSubmit: () => void;
}) => {
  const [switchSala, setSwitchSala] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Current deck info
  const currentDeck = decks.find(d => d.id === moveTarget.id);
  const currentFolderId = moveBrowseFolderId;
  const currentFolder = folders.find(f => f.id === currentFolderId);

  // Is this deck a matéria (has children)?
  const isMateria = decks.some(d => d.parent_deck_id === moveTarget.id);

  // Get descendant deck IDs to exclude from targets
  const getDescendantIds = (deckId: string): string[] => {
    const children = decks.filter(d => d.parent_deck_id === deckId);
    return [deckId, ...children.flatMap(c => getDescendantIds(c.id))];
  };
  const excludeIds = new Set(getDescendantIds(moveTarget.id));

  // Matérias in the current folder (excluding self and descendants)
  const materiasInFolder = useMemo(() => {
    if (!currentFolderId) return [];
    return decks.filter(d =>
      d.folder_id === currentFolderId &&
      !d.parent_deck_id &&
      !excludeIds.has(d.id) &&
      decks.some(child => child.parent_deck_id === d.id) // has children = is matéria
    );
  }, [currentFolderId, decks, excludeIds]);

  // All own salas for switch mode (exclude community/followed folders)
  const allSalas = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return folders.filter(f => !f.is_archived && !f.parent_id && !f.source_turma_id && (q ? f.name.toLowerCase().includes(q) : true));
  }, [folders, searchQuery]);

  const handleClose = () => {
    setMoveTarget(null);
    setMoveParentDeckId(null);
    setSwitchSala(false);
    setSearchQuery('');
  };

  const handleMoveToRoot = () => {
    // Move to root of current sala (remove parent_deck_id)
    setMoveParentDeckId(null);
    onMoveSubmit();
  };

  const handleMoveToMateria = (materiaId: string) => {
    setMoveParentDeckId(materiaId);
    onMoveSubmit();
  };

  const handleMoveToSala = (salaId: string) => {
    setMoveBrowseFolderId(salaId);
    setMoveParentDeckId(null);
    setSwitchSala(false);
    setSearchQuery('');
  };

  const handleMoveConfirmSala = () => {
    onMoveSubmit();
  };

  // Phase: switching sala
  if (switchSala) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => { setSwitchSala(false); setSearchQuery(''); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar</span>
        </button>
        <p className="text-sm text-muted-foreground">Selecione a sala de destino:</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar sala..." className="pl-9 h-9 text-sm" />
        </div>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {allSalas.map(f => (
            <button
              key={f.id}
              onClick={() => handleMoveToSala(f.id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors ${f.id === currentFolderId ? 'bg-primary/5' : ''}`}
            >
              <img src={f.image_url || defaultSalaIcon} alt={f.name} className="h-8 w-8 rounded-lg object-cover shrink-0" />
              <span className="flex-1 text-left font-medium truncate">{f.name}</span>
              {f.id === currentFolderId && <span className="text-xs text-primary font-medium shrink-0">Atual</span>}
            </button>
          ))}
          {allSalas.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma sala encontrada</div>
          )}
        </div>
      </div>
    );
  }

  // If we already switched to a new sala, show confirmation
  if (currentFolderId && currentDeck && currentDeck.folder_id !== currentFolderId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
          <img src={currentFolder?.image_url || defaultSalaIcon} alt={currentFolder?.name} className="h-10 w-10 rounded-lg object-cover shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{currentFolder?.name}</p>
            <p className="text-xs text-muted-foreground">Sala de destino</p>
          </div>
        </div>

        {!isMateria && (() => {
          const materiasInNewFolder = decks.filter(d =>
            d.folder_id === currentFolderId &&
            !d.parent_deck_id &&
            !excludeIds.has(d.id) &&
            decks.some(child => child.parent_deck_id === d.id)
          );
          if (materiasInNewFolder.length === 0) return null;
          return (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium px-1">Mover para dentro de uma matéria:</p>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {materiasInNewFolder.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleMoveToMateria(m.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <span className="flex-1 text-left truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => { setMoveBrowseFolderId(currentDeck?.folder_id ?? null); }} className="flex-1">Voltar</Button>
          <Button size="sm" onClick={handleMoveConfirmSala} className="flex-1">Mover para esta sala</Button>
        </div>
      </div>
    );
  }

  // Default phase: within current sala
  return (
    <div className="space-y-3">
      {/* Current sala context */}
      {currentFolder && (
        <div className="flex items-center gap-2 px-1">
          <img src={currentFolder.image_url || defaultSalaIcon} alt={currentFolder.name} className="h-6 w-6 rounded-md object-cover shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{currentFolder.name}</span>
        </div>
      )}

      {!isMateria && materiasInFolder.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium px-1">Mover para uma matéria:</p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {materiasInFolder.map(m => (
              <button
                key={m.id}
                onClick={() => handleMoveToMateria(m.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors ${currentDeck?.parent_deck_id === m.id ? 'bg-primary/5' : ''}`}
              >
                <GraduationCap className="h-4 w-4 text-primary shrink-0" />
                <span className="flex-1 text-left font-medium truncate">{m.name}</span>
                {currentDeck?.parent_deck_id === m.id && <span className="text-xs text-primary font-medium shrink-0">Atual</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Move to root of sala (if currently inside a matéria) */}
      {currentDeck?.parent_deck_id && (
        <Button variant="outline" size="sm" onClick={handleMoveToRoot} className="w-full gap-2 text-sm">
          <Layers className="h-4 w-4" />
          Mover para raiz da sala
        </Button>
      )}

      {!isMateria && materiasInFolder.length === 0 && !currentDeck?.parent_deck_id && (
        <div className="px-4 py-4 text-center text-sm text-muted-foreground rounded-lg border border-border">
          Nenhuma matéria nesta sala para mover
        </div>
      )}

      {/* Switch sala button */}
      <Button variant="outline" size="sm" onClick={() => setSwitchSala(true)} className="w-full gap-2 text-sm">
        <RefreshCw className="h-4 w-4" />
        Trocar de sala
      </Button>

      <Button variant="ghost" size="sm" onClick={handleClose} className="w-full text-muted-foreground">
        Cancelar
      </Button>
    </div>
  );
};

const DashboardDialogs = (props: DashboardDialogsProps) => {
  const isInsideDeck = !!props.moveParentDeckId;

  // Determine submit label for move
  const getMoveSubmitLabel = () => {
    if (isInsideDeck) return 'Mover como sub-deck';
    if (props.moveBrowseFolderId) return 'Mover para esta sala';
    return 'Mover aqui';
  };

  return (
    <>
      {/* Create Dialog */}
      <Dialog open={!!props.createType} onOpenChange={open => { if (!open) { props.setCreateType(null); props.setCreateParentDeckId(null); } }}>
        <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle className="font-display text-center">
              {props.createType === 'folder' ? 'Criar nova Sala' : props.createParentDeckId === '__materia__' ? 'Nova Matéria' : props.createParentDeckId ? 'Novo Sub-deck' : 'Novo Deck'}
            </DialogTitle>
            {props.createType === 'folder' && (
              <p className="text-sm text-muted-foreground text-center pt-1">
                Uma sala organiza seus decks e matérias em um só lugar. (ex: "Medicina 2026", "Concurso Federal", "Residência Cardio")
              </p>
            )}
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); props.onCreateSubmit(); }} className="space-y-4">
            <div className="space-y-2">
              {props.createType !== 'folder' && <Label>Nome</Label>}
              <Input value={props.createName} onChange={e => props.setCreateName(e.target.value)} placeholder={props.createType === 'folder' ? "ex: 'Residência 2026'" : 'Ex: Vocabulário'} autoFocus maxLength={100} />
            </div>
            <div className={props.createType === 'folder' ? 'flex justify-center' : 'flex justify-end gap-2'}>
              {props.createType !== 'folder' && (
                <Button type="button" variant="outline" onClick={() => { props.setCreateType(null); props.setCreateParentDeckId(null); }}>Cancelar</Button>
              )}
              <Button type="submit" disabled={!props.createName.trim() || props.isCreating} className={props.createType === 'folder' ? 'px-8' : ''}>
                {props.createType === 'folder' ? 'PRÓXIMO' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!props.renameTarget} onOpenChange={open => !open && props.setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle className="font-display">Renomear</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); props.onRenameSubmit(); }} className="space-y-4">
            <Input value={props.renameName} onChange={e => props.setRenameName(e.target.value)} autoFocus maxLength={100} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => props.setRenameTarget(null)}>Cancelar</Button>
              <Button type="submit" disabled={!props.renameName.trim()}>Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Move Dialog (single item) */}
      <Dialog open={!!props.moveTarget} onOpenChange={open => { if (!open) { props.setMoveTarget(null); props.setMoveParentDeckId(null); } }}>
        <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)] w-full overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 min-w-0 overflow-hidden">
              <ArrowUpRight className="h-5 w-5 shrink-0" />
              <span className="truncate block">{`Mover "${props.moveTarget?.name}"`}</span>
            </DialogTitle>
          </DialogHeader>
          {props.moveTarget?.type === 'deck' ? (
            <DeckMoveDialog
              moveTarget={props.moveTarget}
              setMoveTarget={props.setMoveTarget}
              moveBrowseFolderId={props.moveBrowseFolderId}
              setMoveBrowseFolderId={props.setMoveBrowseFolderId}
              moveParentDeckId={props.moveParentDeckId}
              setMoveParentDeckId={props.setMoveParentDeckId}
              folders={props.folders}
              decks={props.decks}
              onMoveSubmit={props.onMoveSubmit}
            />
          ) : (
            <FolderBrowser
              folders={props.folders}
              movableFolders={props.movableFolders}
              moveBrowseFolderId={props.moveBrowseFolderId}
              setMoveBrowseFolderId={props.setMoveBrowseFolderId}
              onMoveSubmit={props.onMoveSubmit}
              onCancel={() => { props.setMoveTarget(null); props.setMoveParentDeckId(null); }}
              submitLabel={getMoveSubmitLabel()}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!props.deleteTarget} onOpenChange={open => !open && props.setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Excluir "{props.deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {props.deleteTarget?.type === 'folder'
                ? 'A sala será excluída. Baralhos não arquivados dentro dela serão excluídos permanentemente. Itens arquivados serão preservados e movidos para o Início.'
                : 'Todos os cards, sub-decks e registros de revisão serão excluídos permanentemente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={props.onDeleteSubmit} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Name Warning */}
      <AlertDialog open={!!props.duplicateWarning} onOpenChange={open => !open && props.setDuplicateWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Nome duplicado</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe {props.duplicateWarning?.type === 'folder' ? 'uma sala' : 'um baralho'} com o nome "{props.duplicateWarning?.name}" neste local.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => { if (props.duplicateWarning) { props.setCreateNameFromDuplicate(props.duplicateWarning.name + ' - Cópia'); props.setDuplicateWarning(null); } }}>Renomear</Button>
            <AlertDialogAction onClick={() => props.duplicateWarning?.action()}>Manter nome igual</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk move decks dialog */}
      <Dialog open={props.bulkMoveDeckOpen} onOpenChange={open => { if (!open) { props.setBulkMoveDeckOpen(false); props.setMoveBrowseFolderId(null); props.setMoveParentDeckId(null); } }}>
        <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-display">
              Mover {props.selectedDeckCount} baralho{props.selectedDeckCount > 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <FolderBrowser
            folders={props.folders}
            movableFolders={props.movableFolders}
            moveBrowseFolderId={props.moveBrowseFolderId}
            setMoveBrowseFolderId={props.setMoveBrowseFolderId}
            onMoveSubmit={props.onBulkMoveSubmit}
            onCancel={() => { props.setBulkMoveDeckOpen(false); props.setMoveBrowseFolderId(null); props.setMoveParentDeckId(null); }}
            submitLabel="Mover para esta sala"
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DashboardDialogs;
