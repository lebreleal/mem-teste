/**
 * All Dashboard dialogs — create, rename, move, delete, bulk move, duplicate warning.
 */

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
import { ArrowLeft, ArrowUpRight, ChevronRight, CirclePlus, FolderOpen } from 'lucide-react';
import type { BreadcrumbItem } from './useDashboardState';

interface Folder { id: string; name: string; parent_id: string | null; is_archived: boolean }
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

/** Shared move browser used by both single and bulk move dialogs */
const MoveBrowser = ({
  folders,
  decks,
  movableFolders,
  movableDecks,
  moveBreadcrumb,
  moveBrowseFolderId,
  setMoveBrowseFolderId,
  moveParentDeckId,
  setMoveParentDeckId,
  showDecks,
  onCreateFolderInMove,
  onMoveSubmit,
  onCancel,
  submitLabel,
}: {
  folders: Folder[];
  decks: { id: string; name: string; parent_deck_id: string | null; folder_id: string | null }[];
  movableFolders: Folder[];
  movableDecks: MovableDeck[];
  moveBreadcrumb: BreadcrumbItem[];
  moveBrowseFolderId: string | null;
  setMoveBrowseFolderId: (v: string | null) => void;
  moveParentDeckId: string | null;
  setMoveParentDeckId: (v: string | null) => void;
  showDecks: boolean;
  onCreateFolderInMove?: () => void;
  onMoveSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) => {
  const isInsideDeck = !!moveParentDeckId;
  const canGoBack = !!moveBrowseFolderId || !!moveParentDeckId;

  const handleBreadcrumbClick = (itemId: string | null) => {
    if (itemId === null) {
      setMoveBrowseFolderId(null);
      setMoveParentDeckId(null);
      return;
    }
    if (itemId.startsWith('deck:')) {
      setMoveParentDeckId(itemId.replace('deck:', ''));
    } else {
      setMoveBrowseFolderId(itemId);
      setMoveParentDeckId(null);
    }
  };

  const handleBack = () => {
    if (moveParentDeckId) {
      const currentDeck = decks.find(d => d.id === moveParentDeckId);
      setMoveParentDeckId(currentDeck?.parent_deck_id ?? null);
    } else if (moveBrowseFolderId) {
      const parent = folders.find(f => f.id === moveBrowseFolderId);
      setMoveBrowseFolderId(parent?.parent_id ?? null);
    }
  };

  /** Check if a deck has sub-decks */
  const deckHasChildren = (deckId: string) => decks.some(d => d.parent_deck_id === deckId);

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs sm:text-sm flex-wrap min-w-0 overflow-hidden">
        {moveBreadcrumb.map((item, i) => (
          <span key={item.id ?? 'root'} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
            <button
              onClick={() => handleBreadcrumbClick(item.id)}
              className={`rounded px-1.5 py-0.5 transition-colors hover:bg-muted truncate max-w-[100px] sm:max-w-[140px] ${i === moveBreadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
            >
              {item.name}
            </button>
          </span>
        ))}
      </div>

      {/* Items list */}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {canGoBack && (
          <button onClick={handleBack} className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Voltar</span>
          </button>
        )}

        {/* Folders (only when not inside a deck) */}
        {!isInsideDeck && movableFolders.map(f => (
          <button key={f.id} onClick={() => { setMoveBrowseFolderId(f.id); setMoveParentDeckId(null); }} className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
            <FolderOpen className="h-4 w-4 text-primary shrink-0" />
            <span className="flex-1 text-left font-medium truncate">{f.name}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}

        {/* Decks as potential parents */}
        {showDecks && movableDecks.map(d => {
          const hasChildren = deckHasChildren(d.id);
          return (
            <button
              key={d.id}
              onClick={() => hasChildren ? setMoveParentDeckId(d.id) : setMoveParentDeckId(d.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span className="flex-1 text-left font-medium truncate">{d.name}</span>
              {hasChildren && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
          );
        })}

        {!canGoBack && movableFolders.length === 0 && (!showDecks || movableDecks.length === 0) && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum item aqui</div>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center justify-between gap-2">
          {!isInsideDeck && onCreateFolderInMove ? (
            <Button variant="outline" size="sm" onClick={onCreateFolderInMove} className="gap-1.5 text-xs shrink-0">
              <CirclePlus className="h-3.5 w-3.5" /> Nova pasta
            </Button>
          ) : <div />}
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
            <Button size="sm" onClick={onMoveSubmit} className="whitespace-nowrap">{submitLabel}</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DashboardDialogs = (props: DashboardDialogsProps) => {
  const isInsideDeck = !!props.moveParentDeckId;

  return (
    <>
      {/* Create Dialog */}
      <Dialog open={!!props.createType} onOpenChange={open => { if (!open) { props.setCreateType(null); props.setCreateParentDeckId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {props.createType === 'folder' ? 'Nova Pasta' : props.createParentDeckId ? 'Novo Sub-deck' : 'Novo Baralho'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); props.onCreateSubmit(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={props.createName} onChange={e => props.setCreateName(e.target.value)} placeholder={props.createType === 'folder' ? 'Ex: Medicina' : 'Ex: Vocabulário'} autoFocus maxLength={100} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { props.setCreateType(null); props.setCreateParentDeckId(null); }}>Cancelar</Button>
              <Button type="submit" disabled={!props.createName.trim() || props.isCreating}>Criar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!props.renameTarget} onOpenChange={open => !open && props.setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
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
        <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 min-w-0 overflow-hidden">
              <ArrowUpRight className="h-5 w-5 shrink-0" />
              <span className="truncate block max-w-[calc(100%-2rem)]">Mover "{props.moveTarget?.name}"</span>
            </DialogTitle>
          </DialogHeader>
          <MoveBrowser
            folders={props.folders}
            decks={props.decks}
            movableFolders={props.movableFolders}
            movableDecks={props.movableDecks}
            moveBreadcrumb={props.moveBreadcrumb}
            moveBrowseFolderId={props.moveBrowseFolderId}
            setMoveBrowseFolderId={props.setMoveBrowseFolderId}
            moveParentDeckId={props.moveParentDeckId}
            setMoveParentDeckId={props.setMoveParentDeckId}
            showDecks={props.moveTarget?.type === 'deck'}
            onCreateFolderInMove={props.onCreateFolderInMove}
            onMoveSubmit={props.onMoveSubmit}
            onCancel={() => { props.setMoveTarget(null); props.setMoveParentDeckId(null); }}
            submitLabel={isInsideDeck ? 'Mover como sub-deck' : 'Mover aqui'}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!props.deleteTarget} onOpenChange={open => !open && props.setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Excluir "{props.deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {props.deleteTarget?.type === 'folder'
                ? 'A pasta será excluída. Baralhos não arquivados dentro dela serão excluídos permanentemente. Itens arquivados serão preservados e movidos para o Início.'
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
              Já existe {props.duplicateWarning?.type === 'folder' ? 'uma pasta' : 'um baralho'} com o nome "{props.duplicateWarning?.name}" neste local.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => { if (props.duplicateWarning) { props.setCreateNameFromDuplicate(props.duplicateWarning.name + ' - Cópia'); props.setDuplicateWarning(null); } }}>Renomear</Button>
            <AlertDialogAction onClick={() => props.duplicateWarning?.action()}>Manter nome igual</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk move decks dialog — uses same navigation browser as single move */}
      <Dialog open={props.bulkMoveDeckOpen} onOpenChange={open => { if (!open) { props.setBulkMoveDeckOpen(false); props.setMoveBrowseFolderId(null); props.setMoveParentDeckId(null); } }}>
        <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-display">
              Mover {props.selectedDeckCount} baralho{props.selectedDeckCount > 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <MoveBrowser
            folders={props.folders}
            decks={props.decks}
            movableFolders={props.movableFolders}
            movableDecks={props.movableDecks}
            moveBreadcrumb={props.moveBreadcrumb}
            moveBrowseFolderId={props.moveBrowseFolderId}
            setMoveBrowseFolderId={props.setMoveBrowseFolderId}
            moveParentDeckId={props.moveParentDeckId}
            setMoveParentDeckId={props.setMoveParentDeckId}
            showDecks={true}
            onCreateFolderInMove={props.onCreateFolderInMove}
            onMoveSubmit={props.onBulkMoveSubmit}
            onCancel={() => { props.setBulkMoveDeckOpen(false); props.setMoveBrowseFolderId(null); props.setMoveParentDeckId(null); }}
            submitLabel={props.moveParentDeckId ? 'Mover como sub-deck' : 'Mover aqui'}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DashboardDialogs;
