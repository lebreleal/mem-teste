/**
 * Shared types for TurmaDetail sub-components.
 */

import type { TurmaRole } from '@/hooks/useTurmaHierarchy';
import { Crown, ShieldCheck, User } from 'lucide-react';

export const roleLabel: Record<TurmaRole, string> = { admin: 'Admin', moderator: 'Moderador', member: 'Membro' };
export const roleIcon: Record<TurmaRole, typeof Crown> = { admin: Crown, moderator: ShieldCheck, member: User };
export const roleColor: Record<TurmaRole, string> = { admin: 'text-warning', moderator: 'text-info', member: 'text-muted-foreground' };

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}
