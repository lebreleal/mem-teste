/**
 * PastaRow — a folder (pasta) row rendered inside a Sala.
 * Hierarchy: Sala > Pasta > Deck. A pasta only contains decks.
 */

import { ChevronRight, Folder as FolderIcon, MoreVertical, Pencil, Archive, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PastaRowProps {
  id: string;
  name: string;
  deckCount: number;
  dueCount: number;
  onClick: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

const PastaRow = ({ name, deckCount, dueCount, onClick, onRename, onArchive, onDelete }: PastaRowProps) => (
  <div
    className="group flex items-center gap-3 px-4 py-4 cursor-pointer transition-all hover:bg-muted/50"
    onClick={onClick}
  >
    <FolderIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-foreground">{name}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {deckCount} {deckCount === 1 ? 'baralho' : 'baralhos'}
        {dueCount > 0 && <span className="text-primary font-medium"> · {dueCount} para hoje</span>}
      </p>
    </div>
    {(onRename || onArchive || onDelete) && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Ações da pasta"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          {onRename && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(); }}>
              <Pencil className="h-4 w-4 mr-2" /> Renomear
            </DropdownMenuItem>
          )}
          {onArchive && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(); }}>
              <Archive className="h-4 w-4 mr-2" /> Arquivar
            </DropdownMenuItem>
          )}
          {onDelete && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )}
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
  </div>
);

export default PastaRow;
