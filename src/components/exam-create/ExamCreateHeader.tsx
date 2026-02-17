/**
 * Header for the ExamCreate page.
 */

import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Flame, Brain } from 'lucide-react';
import type { CreationMode } from './types';

interface ExamCreateHeaderProps {
  isEditing: boolean;
  creationMode: CreationMode;
  fileStep: 'upload' | 'loading' | 'pages' | 'config';
  streak: number;
  energy: number;
  onCreditsOpen: () => void;
  onBack: () => void;
}

const ExamCreateHeader = ({
  isEditing, creationMode, fileStep,
  streak, energy, onCreditsOpen, onBack,
}: ExamCreateHeaderProps) => {
  const navigate = useNavigate();

  const getTitle = () => {
    if (isEditing) return 'Editar Prova';
    if (creationMode === 'file' && fileStep === 'pages') return 'Selecionar Páginas';
    if (creationMode === 'file' && fileStep === 'config') return 'Configurar Prova';
    return 'Nova Prova';
  };

  const getSubtitle = () => {
    if (isEditing) return 'Modifique questões e configurações';
    if (creationMode === 'file' && fileStep === 'pages') return 'Escolha quais páginas usar';
    return 'Configure e crie sua prova';
  };

  return (
    <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-display text-base font-bold text-foreground">{getTitle()}</h1>
            <p className="text-[11px] text-muted-foreground">{getSubtitle()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/activity?tab=streak')}
            className="flex items-center gap-1 rounded-xl px-2.5 py-1 transition-colors hover:bg-muted/50"
            style={{ background: 'hsl(var(--warning) / 0.1)' }}
          >
            <Flame className="h-3.5 w-3.5" style={{ color: 'hsl(var(--warning))' }} />
            <span className="text-xs font-bold text-foreground tabular-nums">{streak}</span>
          </button>
          <button
            onClick={onCreditsOpen}
            className="flex items-center gap-1 rounded-xl px-2.5 py-1 transition-colors hover:bg-muted/50"
            style={{ background: 'hsl(var(--energy-purple) / 0.1)' }}
          >
            <Brain className="h-3.5 w-3.5" style={{ color: 'hsl(var(--energy-purple))' }} />
            <span className="text-xs font-bold text-foreground tabular-nums">{energy}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default ExamCreateHeader;
