/**
 * Page selection step: select which extracted pages to include.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, ChevronLeft } from 'lucide-react';
import type { PageItem } from './types';

interface PageSelectionStepProps {
  pages: PageItem[];
  deckName: string;
  onDeckNameChange: (v: string) => void;
  selectedCount: number;
  totalCredits: number;
  energy: number;
  onTogglePage: (idx: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onContinue: () => void;
}

const PageSelectionStep = ({
  pages, deckName, onDeckNameChange, selectedCount, totalCredits, energy,
  onTogglePage, onSelectAll, onDeselectAll, onContinue,
}: PageSelectionStepProps) => (
  <div className="flex flex-col gap-3 flex-1 min-h-0">
    <div className="space-y-1">
      <Label className="text-xs">Nome da coleção</Label>
      <Input value={deckName} onChange={e => onDeckNameChange(e.target.value)} maxLength={100} className="text-sm" />
    </div>

    <div className="flex items-center justify-between">
      <p className="text-sm font-bold text-foreground">Selecione as páginas que serão usadas</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={onSelectAll}>Selecionar tudo</Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={onDeselectAll}>Desmarcar tudo</Button>
      </div>
    </div>

    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide max-h-[55dvh] sm:max-h-[60vh]">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {pages.map((page, idx) => (
          <button
            key={idx}
            onClick={() => onTogglePage(idx)}
            className={`relative rounded-xl border-2 overflow-hidden transition-all ${
              page.selected
                ? 'border-primary shadow-md ring-2 ring-primary/20'
                : 'border-border opacity-60 hover:opacity-80'
            }`}
          >
            {page.thumbnailUrl ? (
              <img src={page.thumbnailUrl} alt={`Página ${page.pageNumber}`} className="w-full aspect-[4/3] object-cover bg-white" />
            ) : (
              <div className="w-full aspect-[4/3] bg-muted flex items-center justify-center p-2">
                <p className="text-[8px] text-muted-foreground line-clamp-4 text-center leading-tight">
                  {page.textContent.slice(0, 120)}...
                </p>
              </div>
            )}
            {page.selected && (
              <div className="absolute top-1.5 right-1.5">
                <CheckCircle2 className="h-5 w-5 text-primary drop-shadow-md" fill="hsl(var(--background))" />
              </div>
            )}
            <p className="text-center text-[10px] font-medium text-muted-foreground py-1">{page.pageNumber}</p>
          </button>
        ))}
      </div>
    </div>

    <div className="flex items-center justify-between pt-2 border-t border-border/50">
      <div className="text-xs text-muted-foreground">
        <span className="font-bold text-foreground">{selectedCount}</span> páginas selecionadas ·{' '}
        <span className="font-bold" style={{ color: totalCredits > energy ? 'hsl(var(--destructive))' : 'hsl(var(--energy-purple))' }}>
          {totalCredits} créditos IA
        </span>
        {' '}(você tem {energy})
      </div>
      <Button onClick={onContinue} disabled={selectedCount === 0 || !deckName.trim()} className="gap-2">
        Continuar com {selectedCount} páginas <ChevronLeft className="h-4 w-4 rotate-180" />
      </Button>
    </div>
  </div>
);

export default PageSelectionStep;
