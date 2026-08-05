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
  /** What a new folder means at the current level: a top-level sala or a pasta inside a sala. */
  folderKind?: 'sala' | 'pasta';

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
  onMoveSubmit: (overrideParentDeckId?: string | null) => void;
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
  const ownFolders = folders.filter(f => !f.source_turma_id);
  const ownMovable = movableFolders.filter(f => !f.source_turma_id);
  const filteredFolders = q
    ? ownFolders.filter(f => !f.is_archived && f.name.toLowerCase().includes(q))
    : ownMovable;

  return (
    <div className="space-y-3 min-w-0">
      <div className="relative min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar sala..." className="pl-9 h-9 text-sm" />
      </div>
      <div className="max-h-64 w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border divide-y divide-border">
        {moveBrowseFolderId && !q && (
          <button onClick={() => {
            const parent = folders.find(f => f.id === moveBrowseFolderId);
            setMoveBrowseFolderId(parent?.parent_id ?? null);
          }} className="flex w-full max-w-full min-w-0 items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground truncate">Voltar</span>
          </button>
        )}
        {filteredFolders.map(f => (
          <button
            key={f.id}
            onClick={() => { setMoveBrowseFolderId(f.id); setSearchQuery(''); }}
            className="flex w-full max-w-full min-w-0 items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
          >
            <img loading="lazy" decoding="async" src={f.image_url || defaultSalaIcon} alt={f.name} className="h-8 w-8 rounded-lg object-cover shrink-0" />
            <span className="flex-1 min-w-0 text-left font-medium truncate">{f.name}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}
        {filteredFolders.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {q ? `Nenhum resultado para "${searchQuery}"` : 'Nenhuma sala disponível'}
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-1 min-w-0">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1 min-w-0">Cancelar</Button>
        <Button size="sm" onClick={onMoveSubmit} className="flex-1 min-w-0">{submitLabel}</Button>
      </div>
    </div>
  );
};

/**
 * Move dialog for decks.
 * Hierarquia: Sala > Pasta > Deck. Um deck só pode viver numa sala ou numa pasta.
 */
const DeckMoveDialog = ({
  moveTarget,
  setMoveTarget,
  moveBrowseFolderId,
  setMoveBrowseFolderId,
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
  onMoveSubmit: (overrideParentDeckId?: string | null) => void;
}) => {
  const [switchSala, setSwitchSala] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const currentDeck = decks.find(d => d.id === moveTarget.id);
  const currentFolderId = moveBrowseFolderId;
  const currentFolder = folders.find(f => f.id === currentFolderId);
  const parentSala = currentFolder?.parent_id ? folders.find(f => f.id === currentFolder.parent_id) : null;

  /** Pastas (nível 2) dentro da sala atual */
  const pastasInFolder = useMemo(() => {
    if (!currentFolderId || currentFolder?.parent_id) return [];
    return folders.filter(f => f.parent_id === currentFolderId && !f.is_archived);
  }, [currentFolderId, currentFolder, folders]);

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

  const handleMoveHere = () => onMoveSubmit(null);

  const handlePickSala = (salaId: string) => {
    setMoveBrowseFolderId(salaId);
    setMoveParentDeckId(null);
    setSwitchSala(false);
    setSearchQuery('');
  };

  // Fase: trocando de sala
  if (switchSala) {
    return (
      <div className="space-y-3 min-w-0">
        <button
          onClick={() => { setSwitchSala(false); setSearchQuery(''); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar</span>
        </button>
        <p className="text-sm text-muted-foreground">Selecione a sala de destino:</p>
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar sala..." className="pl-9 h-9 text-sm" />
        </div>
        <div className="max-h-56 w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border divide-y divide-border">
          {allSalas.map(f => (
            <button
              key={f.id}
              onClick={() => handlePickSala(f.id)}
              className={`flex w-full max-w-full min-w-0 items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors ${f.id === currentFolderId ? 'bg-primary/5' : ''}`}
            >
              <img loading="lazy" decoding="async" src={f.image_url || defaultSalaIcon} alt={f.name} className="h-8 w-8 rounded-lg object-cover shrink-0" />
              <span className="flex-1 min-w-0 text-left font-medium truncate">{f.name}</span>
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

  // Fase padrão: destino atual + pastas para entrar
  const isCurrentLocation = currentDeck?.folder_id === currentFolderId;

  return (
    <div className="space-y-3 min-w-0">
      {currentFolder && (
        <div className="flex items-center gap-2 px-1 min-w-0">
          {parentSala ? (
            <button
              onClick={() => setMoveBrowseFolderId(parentSala.id)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="truncate max-w-[120px]">{parentSala.name}</span>
            </button>
          ) : (
            <img loading="lazy" decoding="async" src={currentFolder.image_url || defaultSalaIcon} alt={currentFolder.name} className="h-6 w-6 rounded-md object-cover shrink-0" />
          )}
          {parentSala && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-sm font-medium text-foreground truncate min-w-0">{currentFolder.name}</span>
        </div>
      )}

      {pastasInFolder.length > 0 && (
        <div className="space-y-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium px-1">Mover para uma pasta:</p>
          <div className="max-h-48 w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border divide-y divide-border">
            {pastasInFolder.map(p => (
              <button
                key={p.id}
                onClick={() => setMoveBrowseFolderId(p.id)}
                className={`flex w-full max-w-full min-w-0 items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors ${currentDeck?.folder_id === p.id ? 'bg-primary/5' : ''}`}
              >
                <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 text-left font-medium truncate">{p.name}</span>
                {currentDeck?.folder_id === p.id && <span className="text-xs text-primary font-medium shrink-0">Atual</span>}
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      <Button size="sm" onClick={handleMoveHere} disabled={isCurrentLocation} className="w-full max-w-full text-sm">
        {isCurrentLocation
          ? 'O baralho já está aqui'
          : currentFolder?.parent_id ? 'Mover para esta pasta' : 'Mover para esta sala'}
      </Button>

      <Button variant="outline" size="sm" onClick={() => setSwitchSala(true)} className="w-full max-w-full gap-2 text-sm">
        <RefreshCw className="h-4 w-4" />
        Trocar de sala
      </Button>

      <Button variant="ghost" size="sm" onClick={handleClose} className="w-full max-w-full text-muted-foreground">
        Cancelar
      </Button>
    </div>
  );
};


const DashboardDialogs = (props: DashboardDialogsProps) => {
  const isInsideDeck = !!props.moveParentDeckId;
  const isPasta = props.folderKind === 'pasta';

  // Determine submit label for move
  const getMoveSubmitLabel = () => {
    if (isInsideDeck) return 'Mover aqui';
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
              {props.createType === 'folder'
                ? (isPasta ? 'Criar nova pasta' : 'Criar nova Sala')
                : 'Novo Baralho'}
            </DialogTitle>
            {props.createType === 'folder' && (
              <p className="text-sm text-muted-foreground text-center pt-1">
                {isPasta
                  ? 'Uma pasta organiza os baralhos dentro desta sala. (ex: "Cardiologia", "Semestre 1", "Revisões")'
                  : 'Uma sala organiza seus baralhos e matérias em um só lugar. (ex: "Medicina 2026", "Concurso Federal", "Residência Cardio")'}
              </p>
            )}
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); props.onCreateSubmit(); }} className="space-y-4">
            <div className="space-y-2">
              {props.createType !== 'folder' && <Label>Nome</Label>}
              <Input value={props.createName} onChange={e => props.setCreateName(e.target.value)} placeholder={props.createType === 'folder' ? (isPasta ? "ex: 'Cardiologia'" : "ex: 'Residência 2026'") : 'Ex: Vocabulário'} autoFocus maxLength={100} />
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
        <DialogContent className="!w-[calc(100vw-1rem)] !max-w-[40rem] p-4 sm:p-6 overflow-x-hidden">
          <DialogHeader className="min-w-0 pr-9">
            <DialogTitle className="font-display flex items-start gap-2 min-w-0">
              <ArrowUpRight className="h-5 w-5 shrink-0 mt-0.5" />
              <span className="min-w-0 text-base leading-snug break-words">
                Mover "{props.moveTarget?.name}"
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="min-w-0">
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
                ? 'A sala será excluída. Baralhos não arquivados dentro dela serão excluídos permanentemente. Itens arquivados serão preservados e movidos para o Início.'
                : 'Todos os cards e registros de revisão serão excluídos permanentemente.'}
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
