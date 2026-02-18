/**
 * Community info sub-header: turma name, settings, members, invite, subscribe.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft, Crown, Settings, Users, UserPlus, Check,
} from 'lucide-react';
import MembersTab from '@/components/turma-detail/MembersTab';

interface TurmaSubHeaderProps {
  turmaId: string;
  turmaName: string;
  inviteCode: string;
  isAdmin: boolean;
  hasSubscription: boolean;
  isSubscriber: boolean;
  activeSubscription: any;
  subscriptionPrice: number;
  subscribing: boolean;
  onSubscribe: () => void;
  onShowSettings: () => void;
  members: any[];
  userId?: string;
  mutations: any;
}

const TurmaSubHeader = ({
  turmaId, turmaName, inviteCode, isAdmin,
  hasSubscription, isSubscriber, activeSubscription, subscriptionPrice, subscribing,
  onSubscribe, onShowSettings, members, userId, mutations,
}: TurmaSubHeaderProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showMembers, setShowMembers] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  return (
    <>
      <div className="border-b border-border/30 bg-card/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/turmas')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-lg font-bold text-foreground truncate">{turmaName}</h1>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {hasSubscription && !isSubscriber && !isAdmin && (
                <button onClick={() => setShowSubscribeModal(true)} className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/50 transition-colors" title="Seja assinante">
                  <Crown className="h-4 w-4 text-[hsl(270,70%,55%)]" />
                </button>
              )}
              {hasSubscription && isSubscriber && (
                <button onClick={() => setShowSubscribeModal(true)} className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/50 transition-colors" title="Assinatura ativa">
                  <Crown className="h-4 w-4 fill-[hsl(270,70%,55%)]" style={{ color: 'hsl(270, 70%, 55%)' }} />
                </button>
              )}
              {isAdmin && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onShowSettings}>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMembers(true)} title="Membros">
                <Users className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => { navigator.clipboard.writeText(inviteCode); toast({ title: 'Código copiado!', description: inviteCode }); }}>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Members Dialog */}
      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Membros</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <MembersTab
              members={members}
              userId={userId}
              isAdmin={isAdmin}
              mutations={mutations}
              toast={toast}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscribe Modal */}
      <Dialog open={showSubscribeModal} onOpenChange={setShowSubscribeModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-[hsl(270,70%,55%)]" /> Seja Assinante
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-[hsl(270,70%,55%)]/10 p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">O que você desbloqueia:</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[hsl(270,70%,55%)] shrink-0" /> Acesso a baralhos exclusivos para assinantes</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[hsl(270,70%,55%)] shrink-0" /> Conteúdos e materiais premium das aulas</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[hsl(270,70%,55%)] shrink-0" /> Badge de assinante na comunidade</li>
              </ul>
            </div>

            {activeSubscription && isSubscriber ? (
              <div className="rounded-xl border border-[hsl(270,70%,55%)]/30 bg-[hsl(270,70%,55%)]/5 p-4 text-center space-y-1">
                <p className="text-sm font-semibold text-foreground">Assinatura ativa</p>
                <p className="text-xs text-muted-foreground">Vence em {format(new Date(activeSubscription.expires_at), "dd 'de' MMMM, HH:mm", { locale: ptBR })}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/50 p-4 text-center space-y-1">
                {subscriptionPrice > 0 ? (
                  <><p className="text-2xl font-bold text-foreground">{subscriptionPrice} <span className="text-sm font-medium text-muted-foreground">Créditos IA</span></p><p className="text-xs text-muted-foreground">Válido por 7 dias</p></>
                ) : (
                  <><p className="text-2xl font-bold text-success">Grátis</p><p className="text-xs text-muted-foreground">Válido por 7 dias</p></>
                )}
              </div>
            )}

            <Button className="w-full gap-2" onClick={() => { setShowSubscribeModal(false); onSubscribe(); }}
              disabled={subscribing || (!!activeSubscription && isSubscriber)} style={{ backgroundColor: 'hsl(270, 70%, 55%)' }}>
              <Crown className="h-4 w-4" />
              {subscribing ? 'Processando...' : (activeSubscription && isSubscriber) ? 'Assinatura ativa' : subscriptionPrice > 0 ? `Assinar por ${subscriptionPrice} créditos` : 'Assinar Gratuitamente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TurmaSubHeader;