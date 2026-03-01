/**
 * Admin Tags Dashboard - Manage tags, merge, officialize, delete.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllTags, useTagAdminMutations } from '@/hooks/useTags';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Crown, Search, Trash2, Merge, Shield,
  Tag as TagIcon, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

const AdminTags = () => {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const { data: tags = [], isLoading } = useAllTags();
  const { updateTag, deleteTag, mergeTags } = useTagAdminMutations();

  const [search, setSearch] = useState('');
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [showMerge, setShowMerge] = useState(false);

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Acesso restrito.</p>
      </div>
    );
  }

  const filtered = tags.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const officialCount = tags.filter(t => t.is_official).length;
  const totalUsage = tags.reduce((s, t) => s + t.usage_count, 0);

  const handleToggleOfficial = (id: string, current: boolean) => {
    updateTag.mutate({ id, is_official: !current }, {
      onSuccess: () => toast.success(current ? 'Tag removida de oficiais' : 'Tag marcada como oficial'),
      onError: () => toast.error('Erro ao atualizar'),
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Excluir tag "${name}"? Todas as associações serão removidas.`)) return;
    deleteTag.mutate(id, {
      onSuccess: () => toast.success('Tag excluída'),
      onError: () => toast.error('Erro ao excluir'),
    });
  };

  const handleMerge = () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) return;
    mergeTags.mutate({ sourceId: mergeSource, targetId: mergeTarget }, {
      onSuccess: () => {
        toast.success('Tags mescladas com sucesso');
        setShowMerge(false);
        setMergeSource(null);
        setMergeTarget(null);
      },
      onError: () => toast.error('Erro ao mesclar'),
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-display text-xl font-bold text-foreground">Gerenciar Tags</h1>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border/50 bg-card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{tags.length}</p>
            <p className="text-[11px] text-muted-foreground">Tags totais</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{officialCount}</p>
            <p className="text-[11px] text-muted-foreground">Oficiais</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{totalUsage}</p>
            <p className="text-[11px] text-muted-foreground">Usos totais</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar tags..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowMerge(true)} className="gap-1.5">
            <Merge className="h-4 w-4" /> Mesclar
          </Button>
        </div>

        {/* Tags list */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/50 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-8 text-center">
                <TagIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma tag encontrada</p>
              </div>
            ) : filtered.map(tag => (
              <div key={tag.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  {tag.is_official ? (
                    <Crown className="h-4 w-4 text-warning" />
                  ) : (
                    <TagIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{tag.name}</p>
                    {tag.is_official && (
                      <Badge variant="secondary" className="text-[10px]">Oficial</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {tag.usage_count} uso{tag.usage_count !== 1 ? 's' : ''} · slug: {tag.slug}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleToggleOfficial(tag.id, tag.is_official)}
                    title={tag.is_official ? 'Remover oficial' : 'Marcar oficial'}
                  >
                    <Shield className={`h-4 w-4 ${tag.is_official ? 'text-warning' : 'text-muted-foreground'}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(tag.id, tag.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Merge Dialog */}
      <Dialog open={showMerge} onOpenChange={setShowMerge}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-5 w-5 text-primary" /> Mesclar Tags
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Selecione a tag de origem (será removida) e a de destino (receberá todas as associações).
          </p>
          <div className="space-y-3 mt-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Origem (será removida)</p>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={mergeSource ?? ''}
                onChange={e => setMergeSource(e.target.value || null)}
              >
                <option value="">Selecione...</option>
                {tags.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.usage_count})</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Destino (receberá tudo)</p>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={mergeTarget ?? ''}
                onChange={e => setMergeTarget(e.target.value || null)}
              >
                <option value="">Selecione...</option>
                {tags.filter(t => t.id !== mergeSource).map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.usage_count})</option>
                ))}
              </select>
            </div>
            <Button
              className="w-full"
              disabled={!mergeSource || !mergeTarget || mergeTags.isPending}
              onClick={handleMerge}
            >
              {mergeTags.isPending ? 'Mesclando...' : 'Mesclar Tags'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTags;
