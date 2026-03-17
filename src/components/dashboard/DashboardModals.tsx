/**
 * DashboardModals — Extra modals extracted from Dashboard.tsx.
 * Includes: Info dialog, Detach alert, Sala image crop dialog,
 * Leave sala alert, Add menu sheet.
 */

import { useState } from 'react';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconInfo } from '@/components/icons';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import SalaImageCropDialog from '@/components/dashboard/SalaImageCropDialog';

interface DashboardModalsProps {
  // Info dialog
  addMenuInfoType: 'deck' | 'materia' | 'deck-manual' | 'deck-ia' | null;
  setAddMenuInfoType: (v: 'deck' | 'materia' | 'deck-manual' | 'deck-ia' | null) => void;

  // Detach
  detachTarget: { id: string; name: string } | null;
  setDetachTarget: (v: { id: string; name: string } | null) => void;
  detaching: boolean;
  handleDetachDeck: () => void;

  // Sala image (crop dialog)
  salaImageOpen: boolean;
  setSalaImageOpen: (v: boolean) => void;
  onSalaImageCropped: (file: File) => void;

  // Leave sala
  leaveSalaConfirm: { folderId: string; turmaId: string } | null;
  setLeaveSalaConfirm: (v: { folderId: string; turmaId: string } | null) => void;
  handleLeaveSala: () => void;

  // Add menu sheet
  salaAddMenuOpen: boolean;
  setSalaAddMenuOpen: (v: boolean) => void;
  onCreateDeckManual: () => void;
  onCreateDeckAI: () => void;
  onCreateMateria: () => void;
  onImportCards: () => void;
}

const DashboardModals = (props: DashboardModalsProps) => {
  const [addMenuStep, setAddMenuStep] = useState<'main' | 'create-deck'>('main');

  return (
    <>
      {/* Info modal for add menu items */}
      <Dialog open={props.addMenuInfoType !== null} onOpenChange={(v) => { if (!v) props.setAddMenuInfoType(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
               {props.addMenuInfoType === 'materia' && 'O que é uma Matéria?'}
               {props.addMenuInfoType === 'deck' && 'O que é um Baralho?'}
               {props.addMenuInfoType === 'deck-manual' && 'Criar baralho manualmente'}
               {props.addMenuInfoType === 'deck-ia' && 'Criar baralho com IA'}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed pt-2 space-y-2">
              {props.addMenuInfoType === 'materia' && (
                <>
                  <p>Uma <strong>Matéria</strong> é um agrupador que organiza seus decks por tema ou disciplina.</p>
                  <p>Por exemplo, dentro da matéria <em>"Farmacologia"</em> você pode ter os decks <em>"Antibióticos"</em>, <em>"Anti-inflamatórios"</em>, etc.</p>
                  <p>Ao estudar, você pode revisar todos os decks de uma matéria de uma só vez.</p>
                </>
              )}
               {props.addMenuInfoType === 'deck' && (
                 <>
                   <p>Um <strong>Baralho</strong> é um conjunto de flashcards sobre um assunto específico.</p>
                   <p>Você pode criar baralhos manualmente ou usar a IA para gerar cartões automaticamente.</p>
                 </>
               )}
               {props.addMenuInfoType === 'deck-manual' && (
                 <>
                   <p>Você escolhe o nome do baralho e adiciona os cartões (flashcards) um a um.</p>
                   <p>Ideal quando você quer ter controle total sobre o conteúdo dos seus cartões.</p>
                 </>
               )}
              {props.addMenuInfoType === 'deck-ia' && (
                <>
                  <p>Envie seu material de estudo (PDF, imagem ou texto) e a inteligência artificial gera os cartões automaticamente.</p>
                  <p>Ideal para transformar anotações, slides ou apostilas em flashcards rapidamente.</p>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Detach community deck alert */}
      <AlertDialog open={!!props.detachTarget} onOpenChange={(open) => !open && props.setDetachTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copiar para meu deck pessoal</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Uma cópia independente de <strong>"{props.detachTarget?.name}"</strong> será criada no seu deck pessoal.</p>
              <p>A cópia:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Será um deck <strong>pessoal e editável</strong></li>
                <li><strong>Não receberá</strong> atualizações automáticas da comunidade</li>
                <li>O deck original da comunidade <strong>permanecerá intacto</strong></li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={props.detaching}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={props.handleDetachDeck} disabled={props.detaching}>
              {props.detaching ? 'Copiando...' : 'Confirmar cópia'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sala image crop dialog */}
      <SalaImageCropDialog
        open={props.salaImageOpen}
        onOpenChange={props.setSalaImageOpen}
        onSave={props.onSalaImageCropped}
      />




      {/* Leave Sala Confirmation */}
      <AlertDialog open={!!props.leaveSalaConfirm} onOpenChange={(open) => { if (!open) props.setLeaveSalaConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair da sala?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Tem certeza que deseja sair desta sala?</span>
              <span className="block text-sm font-medium text-foreground/80 mt-2">
                📊 Suas estatísticas e progresso de estudo ficam salvos por 30 dias. Se voltar a entrar nesse período, tudo estará como antes.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={props.handleLeaveSala} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sair da sala
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add menu sheet for own sala */}
      <Sheet open={props.salaAddMenuOpen} onOpenChange={(v) => { props.setSalaAddMenuOpen(v); if (!v) setAddMenuStep('main'); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 pt-4">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base font-bold">
              {addMenuStep === 'main' ? 'Adicionar' : 'Criar baralho'}
            </SheetTitle>
          </SheetHeader>

          {addMenuStep === 'main' && (
            <div className="flex flex-col gap-1">
              <button
                className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
                onClick={() => setAddMenuStep('create-deck')}
              >
                <span className="text-sm font-medium text-foreground">Criar baralho</span>
                <button
                  onClick={(e) => { e.stopPropagation(); props.setAddMenuInfoType('deck'); }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <IconInfo className="h-3.5 w-3.5" />
                </button>
                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
              <button
                className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
                onClick={() => { props.setSalaAddMenuOpen(false); setAddMenuStep('main'); props.onCreateMateria(); }}
              >
                <span className="text-sm font-medium text-foreground">Criar matéria</span>
                <button
                  onClick={(e) => { e.stopPropagation(); props.setAddMenuInfoType('materia'); }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
              <button
                className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
                onClick={() => { props.setSalaAddMenuOpen(false); setAddMenuStep('main'); props.onImportCards(); }}
              >
                <span className="text-sm font-medium text-foreground">Importar cartões</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
            </div>
          )}

          {addMenuStep === 'create-deck' && (
            <div className="flex flex-col gap-1">
              <button
                className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
                onClick={() => { props.setSalaAddMenuOpen(false); setAddMenuStep('main'); props.onCreateDeckManual(); }}
              >
                <span className="text-sm font-medium text-foreground">Criar baralho manualmente</span>
                <button
                  onClick={(e) => { e.stopPropagation(); props.setAddMenuInfoType('deck-manual'); }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
              <button
                className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
                onClick={() => { props.setSalaAddMenuOpen(false); setAddMenuStep('main'); props.onCreateDeckAI(); }}
              >
                <span className="text-sm font-medium text-foreground">Criar baralho com IA</span>
                <button
                  onClick={(e) => { e.stopPropagation(); props.setAddMenuInfoType('deck-ia'); }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
              <Button variant="ghost" size="sm" className="mt-2 self-start text-xs gap-1" onClick={() => setAddMenuStep('main')}>
                <ChevronLeft className="h-3.5 w-3.5" /> Voltar
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default DashboardModals;
