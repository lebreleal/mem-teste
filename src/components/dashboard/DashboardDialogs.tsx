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
import { ArrowLeft, ArrowUpRight, ChevronRight, CirclePlus, FolderOpen, Package } from 'lucide-react';
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

const DashboardDialogs = (props: DashboardDialogsProps) => {
  const handleMoveBreadcrumbClick = (itemId: string | null) => {
    if (itemId === null) {
      props.setMoveBrowseFolderId(null);
      props.setMoveParentDeckId(null);
      return;
    }
    if (itemId.startsWith('deck:')) {
      props.setMoveParentDeckId(itemId.replace('deck:', ''));
    } else {
      props.setMoveBrowseFolderId(itemId);
      props.setMoveParentDeckId(null);
    }
  };

  const handleMoveBack = () => {
    if (props.moveParentDeckId) {
      // Go back from deck: find its parent
      const currentDeck = props.decks.find(d => d.id === props.moveParentDeckId);
      if (currentDeck?.parent_deck_id) {
        props.setMoveParentDeckId(currentDeck.parent_deck_id);
      } else {
        props.setMoveParentDeckId(null);
      }
    } else if (props.moveBrowseFolderId) {
      const parent = props.folders.find(f => f.id === props.moveBrowseFolderId);
      props.setMoveBrowseFolderId(parent?.parent_id ?? null);
    }
  };

  const isInsideDeck = !!props.moveParentDeckId;
  const canGoBack = !!props.moveBrowseFolderId || !!props.moveParentDeckId;

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

      {/* Move Dialog */}
      <Dialog open={!!props.moveTarget} onOpenChange={open => { if (!open) { props.setMoveTarget(null); props.setMoveParentDeckId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5" /> Mover "{props.moveTarget?.name}"
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm flex-wrap">
              {props.moveBreadcrumb.map((item, i) => (
                <span key={item.id ?? 'root'} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <button onClick={() => handleMoveBreadcrumbClick(item.id)} className={`rounded px-1.5 py-0.5 transition-colors hover:bg-muted ${i === props.moveBreadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                    {item.name}
                  </button>
                </span>
              ))}
            </div>

            {/* Items list */}
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {canGoBack && (
                <button onClick={handleMoveBack} className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Voltar</span>
                </button>
              )}

              {/* Folders (only when not inside a deck) */}
              {!isInsideDeck && props.movableFolders.map(f => (
                <button key={f.id} onClick={() => { props.setMoveBrowseFolderId(f.id); props.setMoveParentDeckId(null); }} className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <span className="flex-1 text-left font-medium truncate">{f.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}

              {/* Decks as potential parents (when moving a deck) */}
              {props.moveTarget?.type === 'deck' && props.movableDecks.map(d => (
                <button key={d.id} onClick={() => props.setMoveParentDeckId(d.id)} className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
                  <Package className="h-4 w-4 text-accent-foreground" />
                  <span className="flex-1 text-left font-medium truncate">{d.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}

              {!canGoBack && props.movableFolders.length === 0 && props.movableDecks.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum item aqui</div>
              )}
            </div>

            <div className="flex justify-between gap-2 pt-1">
              {!isInsideDeck ? (
                <Button variant="outline" size="sm" onClick={props.onCreateFolderInMove} className="gap-1.5"><CirclePlus className="h-4 w-4" /> Nova pasta aqui</Button>
              ) : <div />}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { props.setMoveTarget(null); props.setMoveParentDeckId(null); }}>Cancelar</Button>
                <Button size="sm" onClick={props.onMoveSubmit}>
                  {isInsideDeck ? 'Mover como sub-deck' : 'Mover aqui'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!props.deleteTarget} onOpenChange={open => !open && props.setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Excluir "{props.deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {props.deleteTarget?.type === 'folder'
                ? 'A pasta será excluída. Baralhos dentro dela serão movidos para a raiz.'
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

      {/* Bulk move decks dialog */}
      <Dialog open={props.bulkMoveDeckOpen} onOpenChange={open => { if (!open) { props.setBulkMoveDeckOpen(false); props.setBulkMoveTargetFolder(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Mover {props.selectedDeckCount} baralho{props.selectedDeckCount > 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Mover para:</Label>
              <div className="rounded-lg border border-border/50 divide-y divide-border/50 max-h-48 overflow-y-auto">
                <button className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${props.bulkMoveTargetFolder === null ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50'}`}
                  onClick={() => props.setBulkMoveTargetFolder(null)}>
                  <FolderOpen className="h-4 w-4" /> Início (raiz)
                </button>
                {props.folders.filter(f => !f.is_archived).map(f => (
                  <button key={f.id} className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${props.bulkMoveTargetFolder === f.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50'}`}
                    onClick={() => props.setBulkMoveTargetFolder(f.id)}>
                    <FolderOpen className="h-4 w-4" /> {f.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => props.setBulkMoveDeckOpen(false)}>Cancelar</Button>
              <Button onClick={props.onBulkMoveSubmit}>Mover</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DashboardDialogs;