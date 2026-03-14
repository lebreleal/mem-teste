/**
 * Classe info sub-header: classe name, settings, members, share, rating.
 * Removed: invite codes, community creation.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CreatorPanelSheet from '@/components/turma-detail/CreatorPanelSheet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useMyTurmaRating, useAllTurmaRatings } from '@/hooks/useTurmaRating';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft, Crown, Settings, Users, Check, Star, BarChart3, Share2, RefreshCw,
} from 'lucide-react';
import MembersTab from '@/components/turma-detail/MembersTab';

interface TurmaSubHeaderProps {
  turmaId: string;
  turmaName: string;
  ownerName?: string;
  createdAt?: string;
  inviteCode: string;
  shareSlug?: string;
  isAdmin: boolean;
  hasSubscription: boolean;
  hasExclusiveContent: boolean;
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
  turmaId, turmaName, ownerName, createdAt, inviteCode, shareSlug, isAdmin,
  hasSubscription, hasExclusiveContent, isSubscriber, activeSubscription, subscriptionPrice, subscribing,
  onSubscribe, onShowSettings, members, userId, mutations,
}: TurmaSubHeaderProps) => {
  const showCrown = hasSubscription || hasExclusiveContent;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showMembers, setShowMembers] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [showCreatorPanel, setShowCreatorPanel] = useState(false);

  // Rating
  const { myRating, submitRating } = useMyTurmaRating(turmaId);
  const { data: allRatings = [] } = useAllTurmaRatings(turmaId, showRating);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingInited, setRatingInited] = useState(false);

  const openRatingDialog = () => {
    setRatingValue(myRating?.rating ?? 0);
    setRatingComment(myRating?.comment ?? '');
    setRatingInited(true);
    setShowRating(true);
  };

  const handleSaveRating = () => {
    if (ratingValue < 1) return;
    submitRating.mutate({ rating: ratingValue, comment: ratingComment }, {
      onSuccess: () => { toast({ title: 'Avaliação salva!' }); },
      onError: () => toast({ title: 'Erro ao salvar', variant: 'destructive' }),
    });
  };

  return (
    <>
      <div className="border-b border-border/30 bg-card/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-display text-lg font-bold text-foreground truncate">{turmaName}</h1>
                <button
                  onClick={openRatingDialog}
                  className="shrink-0 p-0.5 rounded-full transition-colors hover:bg-muted/50"
                  title={myRating ? 'Sua avaliação' : 'Avaliar sala'}
                >
                  <Star className={`h-3.5 w-3.5 ${myRating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />
                </button>
              </div>
              <div className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
                {ownerName && <p>por <span className="font-medium text-primary">{ownerName}</span></p>}
                {createdAt && (
                  <p className="flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    {formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: ptBR })}
                  </p>
                )}
                {isSubscriber && (
                  <p className="flex items-center gap-1 text-[hsl(270,70%,55%)]">
                    <Check className="h-3 w-3" /> Inscrito
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {showCrown && !isSubscriber && !isAdmin && (
                <button onClick={() => setShowSubscribeModal(true)} className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/50 transition-colors" title="Seja assinante">
                  <Crown className="h-4 w-4 text-[hsl(270,70%,55%)]" />
                </button>
              )}
              {isAdmin && (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowCreatorPanel(true)} title="Painel do Criador">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onShowSettings}>
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                const link = shareSlug
                  ? `${window.location.origin}/c/${shareSlug}`
                  : `${window.location.origin}/c/${turmaId}`;
                navigator.clipboard.writeText(link);
                toast({ title: 'Link copiado!', description: link });
              }} title="Compartilhar sala">
                <Share2 className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMembers(true)} title="Seguidores">
                <Users className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Members Dialog */}
      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Seguidores</DialogTitle></DialogHeader>
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
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[hsl(270,70%,55%)] shrink-0" /> Conteúdos e materiais premium</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[hsl(270,70%,55%)] shrink-0" /> Badge de assinante</li>
              </ul>
            </div>

            {activeSubscription && isSubscriber ? (
              <div className="rounded-xl border border-[hsl(270,70%,55%)]/30 bg-[hsl(270,70%,55%)]/5 p-4 text-center space-y-1">
                <p className="text-sm font-semibold text-foreground">Assinatura ativa</p>
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

      {/* Rating Dialog */}
      <Dialog open={showRating} onOpenChange={setShowRating}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-400" /> Avaliar Sala
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRatingValue(n)} className="p-1 transition-transform hover:scale-110">
                  <Star className={`h-7 w-7 ${n <= ratingValue ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                </button>
              ))}
            </div>
            <Textarea
              placeholder="Comentário (opcional)"
              value={ratingComment}
              onChange={e => setRatingComment(e.target.value)}
              className="resize-none"
              rows={2}
            />
            <Button className="w-full" onClick={handleSaveRating} disabled={ratingValue < 1 || submitRating.isPending}>
              {submitRating.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
            {allRatings.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avaliações</p>
                {allRatings.map((r: any) => (
                  <div key={r.id} className="rounded-lg bg-muted/50 p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{r.user_name}</span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star key={n} className={`h-3 w-3 ${n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20'}`} />
                        ))}
                      </div>
                    </div>
                    {r.comment && <p className="text-xs text-muted-foreground">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Creator Panel Sheet */}
      {isAdmin && (
        <CreatorPanelSheet open={showCreatorPanel} onOpenChange={setShowCreatorPanel} turmaId={turmaId} />
      )}
    </>
  );
};

export default TurmaSubHeader;
