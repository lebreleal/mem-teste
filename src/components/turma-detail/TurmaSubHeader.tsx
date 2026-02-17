/**
 * Community info sub-header: turma name, settings, calendar, invite, subscribe.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft, Crown, Settings, Calendar as CalendarIcon, UserPlus, BookOpen, Check, X,
} from 'lucide-react';

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
  lessonDates: Date[];
  lessonDateMap: Map<string, any[]>;
}

const TurmaSubHeader = ({
  turmaId, turmaName, inviteCode, isAdmin,
  hasSubscription, isSubscriber, activeSubscription, subscriptionPrice, subscribing,
  onSubscribe, onShowSettings, lessonDates, lessonDateMap,
}: TurmaSubHeaderProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [calendarOpen, setCalendarOpen] = useState(() => {
    try { return localStorage.getItem(`turma-cal-${turmaId}`) === 'visible'; } catch { return false; }
  });
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  const toggleCalendar = () => {
    setCalendarOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(`turma-cal-${turmaId}`, next ? 'visible' : 'hidden'); } catch {}
      return next;
    });
  };

  const selectedDateKey = format(calendarDate, 'yyyy-MM-dd');
  const selectedDayLessons = lessonDateMap.get(selectedDateKey) ?? [];

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
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleCalendar} title="Calendário">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => { navigator.clipboard.writeText(inviteCode); toast({ title: 'Código copiado!', description: inviteCode }); }}>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Modal */}
      <Dialog open={calendarOpen} onOpenChange={(open) => { setCalendarOpen(open); try { localStorage.setItem(`turma-cal-${turmaId}`, open ? 'visible' : 'hidden'); } catch {} }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Calendário</DialogTitle></DialogHeader>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={calendarDate}
              onSelect={(d) => d && setCalendarDate(d)}
              locale={ptBR}
              className="p-0 pointer-events-auto"
              modifiers={{ hasLesson: lessonDates }}
              modifiersClassNames={{ hasLesson: 'bg-primary/20 font-bold text-primary' }}
            />
          </div>
          {selectedDayLessons.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{format(calendarDate, "dd 'de' MMMM", { locale: ptBR })}</p>
              {selectedDayLessons.map((l: any) => (
                <div key={l.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => { setCalendarOpen(false); navigate(`/turmas/${turmaId}/lessons/${l.id}`); }}>
                  <BookOpen className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground truncate">{l.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground/60">Nenhum conteúdo neste dia</p>
          )}
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
