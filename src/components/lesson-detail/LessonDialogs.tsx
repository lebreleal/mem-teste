/**
 * All dialogs for the LessonDetail page: add deck, edit pricing, rename file, PDF preview.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Globe, Lock } from 'lucide-react';
import DeckPreviewSheet from '@/components/community/DeckPreviewSheet';
import { lazy, Suspense } from 'react';
const PdfCanvasViewer = lazy(() => import('./PdfCanvasViewer'));

interface LessonDialogsProps {
  // Add deck dialog
  showAddDeck: boolean;
  setShowAddDeck: (v: boolean) => void;
  selectedDeckId: string;
  setSelectedDeckId: (v: string) => void;
  availableDecks: { id: string; name: string }[];
  priceType: 'free' | 'money' | 'credits';
  setPriceType: (v: 'free' | 'money' | 'credits') => void;
  price: string;
  setPrice: (v: string) => void;
  allowDownload: boolean;
  setAllowDownload: (v: boolean) => void;
  onAddDeck: () => void;
  isAddingDeck: boolean;
  // Edit pricing dialog
  editingDeck: any;
  setEditingDeck: (v: any) => void;
  editPriceType: 'free' | 'money' | 'credits';
  setEditPriceType: (v: 'free' | 'money' | 'credits') => void;
  editPrice: string;
  setEditPrice: (v: string) => void;
  editAllowDownload: boolean;
  setEditAllowDownload: (v: boolean) => void;
  onEditPricing: () => void;
  isEditingPricing: boolean;
  // Rename file dialog
  renamingFile: any;
  setRenamingFile: (v: any) => void;
  renameFileName: string;
  setRenameFileName: (v: string) => void;
  onRenameFile: () => void;
  isRenaming: boolean;
  // Preview sheet
  previewDeck: any;
  setPreviewDeck: (v: any) => void;
  userHasLinkedDeck: (tdId: string) => boolean;
  userOwnsDeck: (deckId: string) => boolean;
  onAddToCollection: (td: any) => void;
  onDownloadDeck: (td: any) => void;
  isAddingToCollection: boolean;
  isDownloading: boolean;
  // PDF preview
  pdfPreviewUrl: string | null;
  setPdfPreviewUrl: (v: string | null) => void;
  pdfPreviewRestricted: boolean;
}

const LessonDialogs = ({
  showAddDeck, setShowAddDeck, selectedDeckId, setSelectedDeckId, availableDecks,
  priceType, setPriceType, price, setPrice, allowDownload, setAllowDownload,
  onAddDeck, isAddingDeck,
  editingDeck, setEditingDeck, editPriceType, setEditPriceType, editPrice, setEditPrice,
  editAllowDownload, setEditAllowDownload, onEditPricing, isEditingPricing,
  renamingFile, setRenamingFile, renameFileName, setRenameFileName, onRenameFile, isRenaming,
  previewDeck, setPreviewDeck, userHasLinkedDeck, userOwnsDeck,
  onAddToCollection, onDownloadDeck, isAddingToCollection, isDownloading,
  pdfPreviewUrl, setPdfPreviewUrl, pdfPreviewRestricted,
}: LessonDialogsProps) => (
  <>
    {/* Add Deck Dialog */}
    <Dialog open={showAddDeck} onOpenChange={setShowAddDeck}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar Baralho à Aula</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Select value={selectedDeckId} onValueChange={setSelectedDeckId}>
            <SelectTrigger><SelectValue placeholder="Selecione um baralho" /></SelectTrigger>
            <SelectContent>
              {availableDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Visibilidade</p>
            <div className="flex gap-2">
              {([
                { value: 'free', label: 'Liberado', icon: Globe },
                { value: 'members_only', label: 'Assinantes', icon: Lock },
              ] as const).map(opt => (
                <Button key={opt.value} variant={priceType === opt.value ? 'default' : 'outline'} size="sm" onClick={() => setPriceType(opt.value as any)} className="gap-1.5 flex-1">
                  <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Permitir download</Label>
              <p className="text-xs text-muted-foreground">Cópia independente</p>
            </div>
            <Switch checked={allowDownload} onCheckedChange={setAllowDownload} />
          </div>
          <Button className="w-full" disabled={!selectedDeckId || isAddingDeck} onClick={onAddDeck}>
            {isAddingDeck ? 'Adicionando...' : 'Adicionar Baralho'}
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
              {([
                { value: 'free', label: 'Liberado', icon: Globe },
                { value: 'members_only', label: 'Assinantes', icon: Lock },
              ] as const).map(opt => (
                <Button key={opt.value} variant={editPriceType === opt.value ? 'default' : 'outline'} size="sm" onClick={() => setEditPriceType(opt.value as any)} className="gap-1.5 flex-1">
                  <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Permitir download</Label>
              <p className="text-xs text-muted-foreground">Cópia independente</p>
            </div>
            <Switch checked={editAllowDownload} onCheckedChange={setEditAllowDownload} />
          </div>
          <Button className="w-full" disabled={isEditingPricing} onClick={onEditPricing}>
            {isEditingPricing ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Rename File Dialog */}
    <Dialog open={!!renamingFile} onOpenChange={open => !open && setRenamingFile(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-display">Renomear anexo</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); onRenameFile(); }} className="space-y-4">
          <Input value={renameFileName} onChange={e => setRenameFileName(e.target.value)} autoFocus maxLength={200} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRenamingFile(null)}>Cancelar</Button>
            <Button type="submit" disabled={!renameFileName.trim() || isRenaming}>Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    {/* Deck Preview Sheet */}
    {previewDeck && (
      <DeckPreviewSheet
        open={!!previewDeck}
        onOpenChange={open => !open && setPreviewDeck(null)}
        deckId={previewDeck.deck_id}
        deckName={previewDeck.deck_name || 'Baralho'}
        cardCount={previewDeck.card_count ?? 0}
        alreadyLinked={userHasLinkedDeck(previewDeck.id)}
        alreadyOwns={userOwnsDeck(previewDeck.deck_id)}
        allowDownload={previewDeck.allow_download ?? false}
        onAddToCollection={() => onAddToCollection(previewDeck)}
        onDownload={() => onDownloadDeck(previewDeck)}
        isAdding={isAddingToCollection}
        isDownloading={isDownloading}
      />
    )}

    {/* PDF Preview Dialog */}
    <Dialog open={!!pdfPreviewUrl} onOpenChange={open => !open && setPdfPreviewUrl(null)}>
      <DialogContent className="sm:max-w-3xl h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border/50 shrink-0">
          <DialogTitle className="font-display text-sm">
            Visualizar PDF
            {pdfPreviewRestricted && (
              <span className="ml-2 text-[10px] font-semibold bg-muted px-2 py-0.5 rounded-full" style={{ color: 'hsl(270 60% 55%)' }}>
                Prévia limitada
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {pdfPreviewUrl && <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}><PdfCanvasViewer url={pdfPreviewUrl} restricted={pdfPreviewRestricted} /></Suspense>}
      </DialogContent>
    </Dialog>
  </>
);

export default LessonDialogs;
