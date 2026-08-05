/**
 * Standard empty state for a collection with no cards (and, when applicable,
 * no sub-decks). Shared so every screen shows the exact same layout and the
 * same official icons.
 */

import { Button } from '@/components/ui/button';
import { IconDeck, IconAIGradient, IconImport } from '@/components/icons';

interface EmptyDeckStateProps {
  title?: string;
  onAdd: () => void;
  onAI?: () => void;
  onImport?: () => void;
  addLabel?: string;
}

const EmptyDeckState = ({
  title = 'Esta coleção não tem cartões',
  onAdd,
  onAI,
  onImport,
  addLabel = 'Adicionar cartões',
}: EmptyDeckStateProps) => (
  <div className="flex flex-col items-center justify-center gap-4 py-14 text-center">
    <IconDeck className="h-9 w-9 text-muted-foreground/40" />
    <p className="text-sm text-muted-foreground">{title}</p>

    <div className="flex w-full max-w-[280px] flex-col gap-3">
      <Button onClick={onAdd} className="w-full rounded-full h-11">
        {addLabel}
      </Button>

      {onAI && (
        <Button
          variant="outline"
          onClick={onAI}
          className="w-full rounded-full h-11 gap-2 border-transparent bg-gradient-to-r from-primary/60 via-accent/60 to-primary/60 bg-origin-border p-[1px]"
        >
          <span className="flex h-full w-full items-center justify-center gap-2 rounded-full bg-background">
            <IconAIGradient className="h-4 w-4" />
            Gerar cartões com IA
          </span>
        </Button>
      )}

      {onImport && (
        <Button variant="outline" onClick={onImport} className="w-full rounded-full h-11 gap-2">
          <IconImport className="h-4 w-4" />
          Importar colando texto
        </Button>
      )}
    </div>
  </div>
);

export default EmptyDeckState;
