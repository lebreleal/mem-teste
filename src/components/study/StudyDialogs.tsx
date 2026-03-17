/**
 * StudyDialogs — Community info, pro model, chat.
 * Leech system removed.
 */

import { lazy, Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ProModelConfirmDialog = lazy(() => import('@/components/ProModelConfirmDialog'));
const StudyChatModal = lazy(() => import('@/components/StudyChatModal'));

interface StudyDialogsProps {
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
