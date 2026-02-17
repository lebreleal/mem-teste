/**
 * Mode selector (AI / File / Manual) for exam creation.
 */

import { Sparkles, FileUp, PenLine, CheckCircle2 } from 'lucide-react';
import type { CreationMode } from './types';

interface ExamModeSelectorProps {
  creationMode: CreationMode;
  onModeChange: (mode: CreationMode) => void;
}

const modes = [
  { mode: 'ai' as const, icon: Sparkles, label: 'IA + Baralho', desc: 'Gera a partir de um deck' },
  { mode: 'file' as const, icon: FileUp, label: 'IA + Arquivo', desc: 'Gera a partir de PDF/DOCX' },
  { mode: 'manual' as const, icon: PenLine, label: 'Manual', desc: 'Crie suas questões' },
];

const ExamModeSelector = ({ creationMode, onModeChange }: ExamModeSelectorProps) => (
  <div className="grid grid-cols-3 gap-2">
    {modes.map(({ mode, icon: Icon, label, desc }) => (
      <button
        key={mode}
        onClick={() => onModeChange(mode)}
        className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${
          creationMode === mode
            ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
            : 'border-border bg-card hover:bg-muted/50 hover:border-border/80'
        }`}
      >
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          creationMode === mode ? 'bg-primary/15' : 'bg-muted'
        }`}>
          <Icon className={`h-5 w-5 ${creationMode === mode ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <div className="text-center">
          <span className={`text-xs font-bold block ${creationMode === mode ? 'text-primary' : 'text-foreground'}`}>{label}</span>
          <span className="text-[9px] text-muted-foreground leading-tight">{desc}</span>
        </div>
        {creationMode === mode && (
          <div className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
            <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
          </div>
        )}
      </button>
    ))}
  </div>
);

export default ExamModeSelector;
