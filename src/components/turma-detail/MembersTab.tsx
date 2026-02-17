/**
 * Members tab: member listing with role management.
 */

import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Star, Trash2, ShieldCheck, User, Crown } from 'lucide-react';
import { roleLabel, roleIcon, roleColor } from './constants';

interface MembersTabProps {
  members: any[];
  userId?: string;
  isAdmin: boolean;
  mutations: any;
  toast: any;
}

const MembersTab = ({ members, userId, isAdmin, mutations, toast }: MembersTabProps) => (
  <div className="space-y-3">
    {members.map((member: any) => {
      const RoleIcon = roleIcon[member.role as keyof typeof roleIcon];
      return (
        <div key={member.user_id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card px-4 py-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 ${roleColor[member.role as keyof typeof roleColor]}`}>
            <RoleIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-foreground truncate">
                {member.user_name}
                {member.user_id === userId && <span className="text-primary ml-1">(Você)</span>}
              </p>
              {member.is_subscriber ? (
                <Crown className="h-3.5 w-3.5 text-[hsl(270,60%,55%)]" fill="hsl(270,60%,55%)" />
              ) : (
                <Crown className="h-3.5 w-3.5 text-muted-foreground/30" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{roleLabel[member.role as keyof typeof roleLabel]}</p>
          </div>
          {isAdmin && member.user_id !== userId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => mutations.toggleSubscriber.mutate({ userId: member.user_id, isSubscriber: !member.is_subscriber }, { onSuccess: () => toast({ title: member.is_subscriber ? 'Assinatura removida' : 'Marcado como assinante' }) })}>
                  <Star className="mr-2 h-4 w-4" /> {member.is_subscriber ? 'Remover Assinatura' : 'Marcar como Assinante'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {member.role !== 'admin' && (
                  <DropdownMenuItem onClick={() => mutations.changeMemberRole.mutate({ userId: member.user_id, role: 'moderator' }, { onSuccess: () => toast({ title: 'Promovido a Moderador' }) })}>
                    <ShieldCheck className="mr-2 h-4 w-4" /> Promover a Moderador
                  </DropdownMenuItem>
                )}
                {member.role === 'moderator' && (
                  <DropdownMenuItem onClick={() => mutations.changeMemberRole.mutate({ userId: member.user_id, role: 'member' }, { onSuccess: () => toast({ title: 'Rebaixado a Membro' }) })}>
                    <User className="mr-2 h-4 w-4" /> Rebaixar a Membro
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => mutations.removeMember.mutate(member.user_id, { onSuccess: () => toast({ title: 'Membro removido' }) })}>
                  <Trash2 className="mr-2 h-4 w-4" /> Remover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      );
    })}
  </div>
);

export default MembersTab;
