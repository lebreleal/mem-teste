import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureComments, type FeatureRequest } from '@/hooks/useFeatureRequests';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronUp, MessageCircle, Send, Trash2, Lightbulb, AlertTriangle, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

interface Props {
  feature: FeatureRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVote: (featureId: string, hasVoted: boolean) => void;
  onUpdate?: (featureId: string, updates: { title?: string; description?: string; category?: string }) => void;
}

export default function FeatureDetailSheet({ feature, open, onOpenChange, onVote, onUpdate }: Props) {
  const { user } = useAuth();
  const { comments, isLoading, addComment, deleteComment } = useFeatureComments(feature?.id ?? null);
  const [newComment, setNewComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  if (!feature) return null;
  const st = statusLabels[feature.status] || statusLabels.open;
  const tc = typeConfig[feature.category] || typeConfig.sugestao;
  const TypeIcon = tc.icon;
  const isOwner = feature.user_id === user?.id;

  const handleSend = () => {
    if (!newComment.trim()) return;
    addComment.mutate(newComment, { onSuccess: () => setNewComment('') });
  };

  const startEditing = () => {
    setEditTitle(feature.title);
    setEditDesc(feature.description || '');
    setEditing(true);
  };

  const saveEdit = () => {
    if (!editTitle.trim()) return;
    onUpdate?.(feature.id, { title: editTitle.trim(), description: editDesc.trim() });
    setEditing(false);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) setEditing(false); onOpenChange(v); }}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="p-5 pb-4 border-b border-border/50">
          <div className="flex items-start gap-3">
            {/* Vote */}
            <button
              onClick={() => onVote(feature.id, !!feature.user_voted)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 min-w-[52px] transition-colors border shrink-0",
                feature.user_voted
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted"
              )}
            >
              <ChevronUp className={cn("h-4 w-4", feature.user_voted && "text-primary")} />
              <span className="text-sm font-bold tabular-nums">{feature.vote_count}</span>
            </button>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <Input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    maxLength={120}
                    className="text-sm font-semibold"
                    autoFocus
                  />
                  <Textarea
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    className="text-sm resize-none"
                    placeholder="Descrição..."
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} disabled={!editTitle.trim()} className="gap-1">
                      <Check className="h-3.5 w-3.5" /> Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="gap-1">
                      <X className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <SheetTitle className="text-base font-semibold leading-snug text-foreground">
                      {feature.title}
                    </SheetTitle>
                    {isOwner && onUpdate && (
                      <button
                        onClick={startEditing}
                        className="shrink-0 p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge className={cn("text-[10px] px-1.5 py-0 border-0 gap-1", tc.bgClass, tc.iconClass)}>
                      <TypeIcon className="h-2.5 w-2.5" />
                      {tc.label}
                    </Badge>
                    <Badge className={cn("text-[10px] px-1.5 py-0 border-0", st.color)}>
                      {st.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {feature.author_name} · {formatDistanceToNow(new Date(feature.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Description */}
        {!editing && feature.description && (
          <div className="px-5 py-4 border-b border-border/50">
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{feature.description}</p>
          </div>
        )}

        {/* Comments */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <MessageCircle className="h-3.5 w-3.5" />
            <span>{comments.length} comentário{comments.length !== 1 ? 's' : ''}</span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 text-center py-6">
              Nenhum comentário ainda. Seja o primeiro!
            </p>
          ) : (
            comments.map(c => {
              const isCOwner = c.user_id === user?.id;
              return (
                <div key={c.id} className="group rounded-lg bg-muted/40 px-3.5 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">{c.author_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground/60">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                      {isCOwner && (
                        <button
                          onClick={() => deleteComment.mutate(c.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground/50 hover:text-destructive transition-all"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                </div>
              );
            })
          )}
        </div>

        {/* Comment input */}
        <div className="border-t border-border/50 p-4">
          <div className="flex gap-2">
            <Textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Escreva um comentário..."
              rows={2}
              className="min-h-[44px] text-sm resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!newComment.trim() || addComment.isPending}
              className="shrink-0 h-11 w-11"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
