import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureRequests, type FeatureRequest } from '@/hooks/useFeatureRequests';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, ChevronUp, Plus, Trash2, MessageCircle,
  Lightbulb, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import FeatureDetailSheet from '@/components/feedback/FeatureDetailSheet';

const statusLabels: Record<string, { label: string; color: string }> = {
  open: { label: 'Aberto', color: 'bg-muted text-muted-foreground' },
  planned: { label: 'Planejado', color: 'bg-info/15 text-info' },
  in_progress: { label: 'Em progresso', color: 'bg-warning/15 text-warning' },
  done: { label: 'Concluído', color: 'bg-success/15 text-success' },
};

const typeConfig: Record<string, { label: string; icon: typeof Lightbulb; iconClass: string; bgClass: string }> = {
  sugestao: { label: 'Sugestão', icon: Lightbulb, iconClass: 'text-success', bgClass: 'bg-success/10' },
  problema: { label: 'Problema', icon: AlertTriangle, iconClass: 'text-destructive', bgClass: 'bg-destructive/10' },
};

const Feedback = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<'sugestao' | 'problema'>('sugestao');
  const [selectedFeature, setSelectedFeature] = useState<FeatureRequest | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { features, isLoading, createFeature, toggleVote, deleteFeature, updateFeature } = useFeatureRequests();

  const handleSubmit = () => {
    if (!newTitle.trim()) return;
    createFeature.mutate(
      { title: newTitle, description: newDesc, category: newType },
      {
        onSuccess: () => {
          setNewTitle('');
          setNewDesc('');
          setNewType('sugestao');
          setDialogOpen(false);
        },
      }
    );
  };

  const openDetail = (feature: FeatureRequest) => {
    setSelectedFeature(feature);
    setSheetOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3 max-w-2xl">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-display font-bold text-foreground">Feedback</h1>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Novo</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Novo Feedback</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* Type selector */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewType('sugestao')}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border-2 px-4 py-3 text-left transition-all",
                      newType === 'sugestao'
                        ? "border-success bg-success/10 ring-2 ring-success/20"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <Lightbulb className={cn("h-5 w-5", newType === 'sugestao' ? 'text-success' : 'text-muted-foreground')} />
                    <span className="text-sm font-semibold">Sugestão</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType('problema')}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border-2 px-4 py-3 text-left transition-all",
                      newType === 'problema'
                        ? "border-destructive bg-destructive/10 ring-2 ring-destructive/20"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <AlertTriangle className={cn("h-5 w-5", newType === 'problema' ? 'text-destructive' : 'text-muted-foreground')} />
                    <span className="text-sm font-semibold">Problema</span>
                  </button>
                </div>

                <Input
                  placeholder="Título curto e descritivo"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={120}
                />
                <Textarea
                  placeholder={newType === 'sugestao' ? 'Descreva sua sugestão de melhoria...' : 'Descreva o problema que encontrou...'}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={4}
                  maxLength={1000}
                />
                <Button
                  onClick={handleSubmit}
                  disabled={!newTitle.trim() || createFeature.isPending}
                  className="w-full"
                >
                  {createFeature.isPending ? 'Enviando...' : 'Enviar'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-2xl space-y-4">
        {/* Feature list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : features.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Lightbulb className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum feedback ainda. Seja o primeiro!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {features.map((feature) => {
              const st = statusLabels[feature.status] || statusLabels.open;
              const tc = typeConfig[feature.category] || typeConfig.sugestao;
              const TypeIcon = tc.icon;
              const isOwner = feature.user_id === user?.id;

              return (
                <Card
                  key={feature.id}
                  className="border-border/50 overflow-hidden cursor-pointer hover:border-border transition-colors"
                  onClick={() => openDetail(feature)}
                >
                  <CardContent className="flex gap-3 p-3 sm:p-4">
                    {/* Vote button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVote.mutate({ featureId: feature.id, hasVoted: !!feature.user_voted });
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-2 min-w-[48px] transition-colors border",
                        feature.user_voted
                          ? "bg-primary/10 border-primary/30 text-primary"
                          : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <ChevronUp className={cn("h-4 w-4", feature.user_voted && "text-primary")} />
                      <span className="text-sm font-bold tabular-nums">{feature.vote_count}</span>
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", tc.bgClass)}>
                            <TypeIcon className={cn("h-3.5 w-3.5", tc.iconClass)} />
                          </div>
                          <h3 className="text-sm font-semibold text-foreground leading-snug truncate">{feature.title}</h3>
                        </div>
                        {isOwner && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteFeature.mutate(feature.id);
                            }}
                            className="shrink-0 p-1 text-muted-foreground/50 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {feature.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {feature.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-[10px] px-1.5 py-0 border-0", st.color)}>
                          {st.label}
                        </Badge>
                        {(feature.comment_count ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                            <MessageCircle className="h-3 w-3" />
                            {feature.comment_count}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/60 ml-auto">
                          {feature.author_name} · {formatDistanceToNow(new Date(feature.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <FeatureDetailSheet
        feature={selectedFeature}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onVote={(id, voted) => toggleVote.mutate({ featureId: id, hasVoted: voted })}
        onUpdate={(id, updates) => updateFeature.mutate({ featureId: id, updates }, {
          onSuccess: () => {
            // Update the local selected feature so the sheet reflects changes
            if (selectedFeature && selectedFeature.id === id) {
              setSelectedFeature({ ...selectedFeature, ...updates });
            }
          }
        })}
      />
    </div>
  );
};

export default Feedback;
