/**
 * StudyDialogs — Leech interruption, skip confirm, community info, pro model, chat.
 * Extracted from Study.tsx (copy-paste integral).
 */

import { lazy, Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { LeechInterruptionState } from '@/hooks/useLeechDetection';
import { LEECH_THRESHOLD } from '@/hooks/useLeechDetection';

const ProModelConfirmDialog = lazy(() => import('@/components/ProModelConfirmDialog'));
const StudyChatModal = lazy(() => import('@/components/StudyChatModal'));

interface StudyDialogsProps {
  // Leech interruption
  leechInterruption: LeechInterruptionState | null;
  leechSkipConfirmOpen: boolean;
  setLeechSkipConfirmOpen: (v: boolean) => void;
  clearLeechInterruption: () => void;
  leechBypassOnceRef: React.MutableRefObject<Set<string>>;
  onStartLeechMode: (card: any) => void;
  localQueue: any[];
  currentCard: any;

  // Community info
  communityInfoOpen: boolean;
  setCommunityInfoOpen: (v: boolean) => void;
  sourceInfo: any;

  // Pro model
  pendingPro: boolean;
  confirmPro: () => void;
  cancelPro: () => void;
  baseTutorCost: number;

  // Chat
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  chatCardContext: { front: string; back: string } | undefined;
  explainInChat: string | false;
  activeStreamingResponse: string | null | undefined;
  isTutorLoading: boolean;
  onClearStreaming: () => void;
  resetKey: number;
  onHasMessagesChange: (v: boolean) => void;
  clearRef: React.MutableRefObject<(() => void) | null>;
}

const StudyDialogs = (props: StudyDialogsProps) => {
  return (
    <>
      <Dialog open={!!props.leechInterruption} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-base">Sessão pausada para reforço</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Você errou este card <strong className="text-destructive">{props.leechInterruption?.failCount ?? LEECH_THRESHOLD} vezes</strong> seguidas,
              então pausamos para evitar consolidar o erro.
            </p>
            <p>Se você fechar o app agora, vamos lembrar essa pausa e retomar este aviso quando voltar.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => props.setLeechSkipConfirmOpen(true)}
            >
              Continuar sem reforço
            </Button>
            <Button
              onClick={() => {
                if (!props.leechInterruption) {
                  props.clearLeechInterruption();
                  return;
                }
                const targetCard = props.leechInterruption.cardSnapshot
                  ?? props.localQueue.find(c => c.id === props.leechInterruption!.cardId)
                  ?? props.currentCard;
                if (!targetCard) {
                  props.clearLeechInterruption();
                  return;
                }
                props.clearLeechInterruption();
                void props.onStartLeechMode(targetCard);
              }}
            >
              Fazer mini-reforço
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={props.leechSkipConfirmOpen} onOpenChange={props.setLeechSkipConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Tem certeza que quer pular?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Pular o reforço pode manter a lacuna de base e aumentar a chance de erro repetido nesse mesmo tema.
            </p>
            <p>Se mesmo assim você quiser, liberamos continuar normalmente agora.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => props.setLeechSkipConfirmOpen(false)}>
              Voltar e revisar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (props.leechInterruption) {
                  props.leechBypassOnceRef.current.add(props.leechInterruption.leechKey);
                }
                props.clearLeechInterruption();
              }}
            >
              Continuar mesmo assim
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        <ProModelConfirmDialog open={props.pendingPro} onConfirm={props.confirmPro} onCancel={props.cancelPro} baseCost={props.baseTutorCost} />
        <StudyChatModal
          open={props.chatOpen}
          onOpenChange={props.setChatOpen}
          cardContext={props.chatCardContext}
          streamingResponse={props.explainInChat ? props.activeStreamingResponse : undefined}
          isStreamingResponse={props.explainInChat ? props.isTutorLoading : false}
          onClearStreaming={props.onClearStreaming}
          resetKey={props.resetKey}
          onHasMessagesChange={props.onHasMessagesChange}
          clearRef={props.clearRef}
        />
      </Suspense>

      <Dialog open={props.communityInfoOpen} onOpenChange={props.setCommunityInfoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Card de Comunidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Este cartão pertence a um baralho de comunidade
              {props.sourceInfo?.authorName && <> criado por <span className="font-medium text-foreground">{props.sourceInfo.authorName}</span></>}.
            </p>
            <p className="flex items-start gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground" />
              <span>
                A data de atualização indica quando o <strong className="text-foreground">conteúdo do baralho</strong> foi editado pelo criador — seja uma edição direta ou uma sugestão aceita da comunidade.
              </span>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StudyDialogs;
