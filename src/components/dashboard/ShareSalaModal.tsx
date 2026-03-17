/**
 * ShareSalaModal — Clean share dialog for a Sala.
 * Shows: public link toggle, copy link button, participants list.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Globe, Lock, Crown, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
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
}

const roleLabel: Record<string, string> = {
  admin: 'Proprietário',
  moderator: 'Moderador',
  member: 'Membro',
};

const ShareSalaModal = ({
  open, onOpenChange, turmaId, shareSlug, isPublished,
  onTogglePublish, publishing, onCopyLink, ownerName,
}: ShareSalaModalProps) => {
  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ['turma-members-share', turmaId],
    queryFn: () => fetchTurmaMembers(turmaId!),
    enabled: !!turmaId && open,
    staleTime: 30_000,
  });

  // Sort: admin first, then moderator, then member
  const sortedMembers = (members ?? []).slice().sort((a, b) => {
    const order = { admin: 0, moderator: 1, member: 2 };
    return (order[a.role] ?? 2) - (order[b.role] ?? 2);
  });

  const fullLink = `${window.location.origin}/c/${shareSlug}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Compartilhar sala</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Link visibility toggle */}
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3.5">
            <div className="flex items-center gap-3">
              {isPublished ? (
                <Globe className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isPublished ? 'Link ativo' : 'Link desativado'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isPublished
                    ? 'Qualquer pessoa com o link pode entrar'
                    : 'Somente você tem acesso'}
                </p>
              </div>
            </div>
            <Switch
              checked={isPublished}
              onCheckedChange={onTogglePublish}
              disabled={publishing}
            />
          </div>

          {/* Copy link button */}
          <Button
            variant="default"
            className="w-full gap-2"
            onClick={onCopyLink}
            disabled={!shareSlug}
          >
            <Copy className="h-4 w-4" />
            Copiar link
          </Button>

          {/* Participants */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Participantes</h3>

            {loadingMembers && (
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loadingMembers && sortedMembers.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                Nenhum participante ainda. Compartilhe o link!
              </p>
            )}

            <div className="space-y-1 max-h-52 overflow-y-auto">
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
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/30 transition-colors">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className={isOwner ? 'bg-primary text-primary-foreground text-xs font-bold' : 'bg-muted text-muted-foreground text-xs font-medium'}>
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {member.user_name || 'Anônimo'}
        </p>
      </div>
      <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
        {isOwner && <Crown className="h-3 w-3 text-yellow-500 dark:text-yellow-400" />}
        {roleLabel[member.role] ?? 'Membro'}
      </span>
    </div>
  );
};

export default ShareSalaModal;
