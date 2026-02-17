/**
 * Dialogs for creating/editing subjects and lessons in TurmaDetail.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, EyeOff } from 'lucide-react';

interface CreateSubjectDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  desc: string;
  onDescChange: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export const CreateSubjectDialog = ({ open, onOpenChange, name, onNameChange, desc, onDescChange, onSubmit, isPending }: CreateSubjectDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle>Nova Pasta</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Input placeholder="Nome da pasta" maxLength={40} value={name} onChange={e => onNameChange(e.target.value)} />
        <Input placeholder="Descrição (opcional)" value={desc} onChange={e => onDescChange(e.target.value)} />
        <Button onClick={onSubmit} disabled={!name.trim() || isPending} className="w-full">
          {isPending ? 'Criando...' : 'Criar Pasta'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

interface CreateLessonDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  isPublished: boolean;
  onPublishedChange: (v: boolean) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export const CreateLessonDialog = ({ open, onOpenChange, name, onNameChange, isPublished, onPublishedChange, onSubmit, isPending }: CreateLessonDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle>Novo Conteúdo</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Input placeholder="Nome do conteúdo" maxLength={60} value={name} onChange={e => onNameChange(e.target.value)} autoFocus />
        <button type="button"
          className="flex items-center justify-between w-full rounded-lg border border-border/50 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
          onClick={() => onPublishedChange(!isPublished)}>
          <div className="flex items-center gap-2">
            {isPublished ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
            <span className="text-foreground font-medium">{isPublished ? 'Visível para membros' : 'Oculto (só admins veem)'}</span>
          </div>
          <div className={`h-5 w-9 rounded-full transition-colors ${isPublished ? 'bg-success' : 'bg-muted'} relative`}>
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${isPublished ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </button>
        <Button onClick={onSubmit} disabled={!name.trim() || isPending} className="w-full">
          {isPending ? 'Criando...' : 'Criar'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

interface EditSubjectDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export const EditSubjectDialog = ({ open, onOpenChange, name, onNameChange, onSubmit, isPending }: EditSubjectDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Editar Pasta</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Input placeholder="Nome da pasta" value={name} onChange={e => onNameChange(e.target.value)} />
        <Button className="w-full" disabled={!name.trim() || isPending} onClick={onSubmit}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

interface EditLessonDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export const EditLessonDialog = ({ open, onOpenChange, name, onNameChange, onSubmit, isPending }: EditLessonDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Editar Conteúdo</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Input placeholder="Nome" value={name} onChange={e => onNameChange(e.target.value)} autoFocus />
        <Button className="w-full" disabled={!name.trim() || isPending} onClick={onSubmit}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);
