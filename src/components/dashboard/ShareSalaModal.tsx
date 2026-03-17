/**
 * ShareSalaModal — Share room dialog.
 * Toggle visibility (public/private), editable short link, copy, participants list.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Crown, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { IconGlobe, IconEdit } from '@/components/icons';
import { fetchTurmaMembers } from '@/services/turma/turmaMembers';
import type { TurmaMember } from '@/types/turma';

interface ShareSalaModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  turmaId: string | undefined;
  shareSlug: string;
  isPublished: boolean;
  onTogglePublish: () => void;
  publishing: boolean;
  onCopyLink: () => void;
  ownerName?: string;
  // slug editing
  onSlugChange: (v: string) => void;
  onSlugSave: () => void;
  savingSlug: boolean;
}

const ShareSalaModal = ({
  open, onOpenChange, turmaId, shareSlug, isPublished,
  onTogglePublish, publishing, onCopyLink, ownerName,
  onSlugChange, onSlugSave, savingSlug,
}: ShareSalaModalProps) => {
  const [editingSlug, setEditingSlug] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ['turma-members-share', turmaId],
    queryFn: () => fetchTurmaMembers(turmaId!),
    enabled: !!turmaId && open,
    staleTime: 30_000,
  });

  const sortedMembers = (members ?? []).slice().sort((a, b) => {
    const order = { admin: 0, moderator: 1, member: 2 };
    return (order[a.role] ?? 2) - (order[b.role] ?? 2);
  });

  const fullLink = `${window.location.origin}/c/${shareSlug}`;

  const handleCopy = () => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setEditingSlug(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Compartilhar sala</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Visibility toggle */}
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <IconGlobe className={`h-5 w-5 shrink-0 ${isPublished ? 'text-primary' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isPublished ? 'Aberta para todos' : 'Só você tem acesso'}
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {isPublished
                    ? 'Sua sala aparece no Explorar e qualquer pessoa com o link pode entrar'
                    : 'Ative para publicar no Explorar e permitir que outros entrem pelo link'}
                </p>
              </div>
            </div>
            <Switch
              checked={isPublished}
              onCheckedChange={onTogglePublish}
              disabled={publishing}
            />
          </div>

          {/* Link section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {editingSlug ? (
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-muted-foreground shrink-0">/c/</span>
                  <Input
                    value={shareSlug}
                    onChange={(e) => onSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                    className="h-8 text-sm"
                    placeholder="seu-link"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={() => { onSlugSave(); setEditingSlug(false); }}
                    disabled={savingSlug || shareSlug.length < 3}
                    className="h-8 px-3 text-xs shrink-0"
                  >
                    {savingSlug ? '...' : 'Salvar'}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex-1 truncate rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    {fullLink}
                  </div>
                  <button
                    onClick={() => setEditingSlug(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                    title="Editar link"
                  >
                    <IconEdit className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <Button
              variant="default"
              className="w-full gap-2"
              onClick={handleCopy}
              disabled={!shareSlug}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copiado!' : 'Copiar link'}
            </Button>
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Quem entrou ({sortedMembers.length})
            </h3>

            {loadingMembers && (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-3.5 w-24" />
                  </div>
                ))}
              </div>
            )}

            {!loadingMembers && sortedMembers.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                Ninguém entrou ainda. Compartilhe o link!
              </p>
            )}

            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {sortedMembers.map((member) => (
                <MemberRow key={member.user_id} member={member} />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const MemberRow = ({ member }: { member: TurmaMember }) => {
  const initials = (member.user_name || 'A')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isOwner = member.role === 'admin';

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={isOwner ? 'bg-primary text-primary-foreground text-xs font-bold' : 'bg-muted text-muted-foreground text-xs font-medium'}>
          {initials}
        </AvatarFallback>
      </Avatar>
      <p className="text-sm text-foreground truncate flex-1">
        {member.user_name || 'Anônimo'}
      </p>
      {isOwner && <Crown className="h-3.5 w-3.5 text-yellow-500 dark:text-yellow-400 shrink-0" />}
    </div>
  );
};

export default ShareSalaModal;
