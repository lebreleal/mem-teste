import {
  ArrowLeft, ChevronRight, Plus, FolderPlus, BookOpen, Brain, Download,
  CheckCheck, X, ArrowUpRight, Archive, Trash2, GripVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BreadcrumbItem } from './useDashboardState';

interface DashboardActionsProps {
  currentFolderId: string | null;
  breadcrumb: BreadcrumbItem[];
  onNavigateFolder: (id: string | null) => void;
  onNavigateUp: () => void;
  
  hasDecks: boolean;
  deckSelectionMode: boolean;
  selectedCount: number;
  isAllSelected: boolean;
  
  toggleSelectionMode: () => void;
  toggleSelectAll: () => void;
  
  onCreateFolder: () => void;
  onCreateDeck: () => void;
  onCreateAI: () => void;
  onImport: () => void;
  
  onBulkMove: () => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  reorderMode: boolean;
  toggleReorderMode: () => void;
}

const DashboardActions = ({
  currentFolderId, breadcrumb, onNavigateFolder, onNavigateUp,
  hasDecks, deckSelectionMode, selectedCount, isAllSelected,
  toggleSelectionMode, toggleSelectAll,
  onCreateFolder, onCreateDeck, onCreateAI, onImport,
  onBulkMove, onBulkArchive, onBulkDelete,
  reorderMode, toggleReorderMode,
}: DashboardActionsProps) => {
  return (
    <>
      {/* Breadcrumb */}
      {currentFolderId && (
        <div className="mb-2 flex items-center gap-1 text-sm">
          {breadcrumb.map((item, i) => (
            <span key={item.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <button
                onClick={() => onNavigateFolder(item.id)}
                className={`rounded px-1.5 py-0.5 transition-colors hover:bg-muted ${
                  i === breadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {item.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Title + Actions */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {currentFolderId && (
            <Button variant="ghost" size="icon" onClick={onNavigateUp}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasDecks && !deckSelectionMode && (
            <Button variant={reorderMode ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" onClick={toggleReorderMode} title={reorderMode ? 'Pronto' : 'Ordenar'}>
              <GripVertical className="h-4 w-4" />
            </Button>
          )}
          {hasDecks && !reorderMode && (
            <Button variant={deckSelectionMode ? 'secondary' : 'ghost'} size="sm" className="gap-1.5" onClick={toggleSelectionMode}>
              {deckSelectionMode ? <X className="h-4 w-4" /> : <CheckCheck className="h-4 w-4" />}
              <span className="hidden sm:inline">{deckSelectionMode ? 'Cancelar' : 'Selecionar'}</span>
            </Button>
          )}
          {!deckSelectionMode && (
            <>
              <Button variant="outline" onClick={onCreateFolder} className="gap-2">
                <FolderPlus className="h-4 w-4" /><span className="hidden sm:inline">Nova Pasta</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="gap-2"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Adicionar</span></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onCreateDeck}><BookOpen className="mr-2 h-4 w-4" /> Criar baralho</DropdownMenuItem>
                  <DropdownMenuItem onClick={onCreateAI}><Brain className="mr-2 h-4 w-4" style={{ color: 'hsl(var(--energy-purple))' }} /> Criar com IA</DropdownMenuItem>
                  <DropdownMenuItem onClick={onImport}><Download className="mr-2 h-4 w-4" /> Importar cartões</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Bulk selection bar */}
      {deckSelectionMode && selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 mb-3">
          <span className="text-sm font-medium text-foreground mr-auto">{selectedCount} selecionado{selectedCount > 1 ? 's' : ''}</span>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={toggleSelectAll}>
            <CheckCheck className="h-3.5 w-3.5" /><span className="hidden sm:inline">{isAllSelected ? 'Desmarcar' : 'Todos'}</span>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onBulkMove}>
            <ArrowUpRight className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Mover</span>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onBulkArchive}>
            <Archive className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Arquivar</span>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive" onClick={onBulkDelete}>
            <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Excluir</span>
          </Button>
        </div>
      )}
    </>
  );
};

export default DashboardActions;
