/**
 * Lesson files/attachments section.
 */

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Upload, Eye, Download, Lock, Pencil, Trash2,
  Paperclip, FileIcon, FileText, Image, Crown, Globe,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return Image;
  if (type.includes('pdf')) return FileText;
  return FileIcon;
};

interface LessonFilesProps {
  lessonFiles: any[];
  canEdit: boolean;
  isAdmin: boolean;
  isMod: boolean;
  isSubscriber: boolean;
  uploading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteFile: (fileId: string) => void;
  onRenameFile: (fileId: string, newName: string) => void;
  onPreviewPdf: (url: string, restricted: boolean) => void;
  onUpdateFileVisibility?: (fileId: string, priceType: string) => void;
}

const LessonFiles = ({
  lessonFiles, canEdit, isAdmin, isMod, isSubscriber,
  uploading, onFileUpload, onDeleteFile, onRenameFile, onPreviewPdf,
  onUpdateFileVisibility,
}: LessonFilesProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingFile, setEditingFile] = useState<any>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editFilePriceType, setEditFilePriceType] = useState('free');

  const openEditFile = (file: any) => {
    setEditingFile(file);
    setEditFileName(file.file_name);
    setEditFilePriceType(file.price_type || 'free');
  };

  const handleSaveFile = () => {
    if (!editingFile) return;
    const nameChanged = editFileName.trim() && editFileName.trim() !== editingFile.file_name;
    const visChanged = editFilePriceType !== (editingFile.price_type || 'free');
    if (nameChanged) onRenameFile(editingFile.id, editFileName.trim());
    if (visChanged && onUpdateFileVisibility) onUpdateFileVisibility(editingFile.id, editFilePriceType);
    setEditingFile(null);
  };

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-bold text-foreground">Anexos</h2>
        {canEdit && (
          <>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileUpload} />
            <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-muted-foreground"
              onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload className="h-3 w-3" /> {uploading ? 'Enviando...' : 'Enviar'}
            </Button>
          </>
        )}
      </div>
      {lessonFiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 py-6 flex flex-col items-center gap-2">
          <Paperclip className="h-7 w-7 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/60">Nenhum anexo</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/50">
          {lessonFiles.map((file: any) => {
            const Icon = getFileIcon(file.file_type);
            const isImage = file.file_type?.startsWith('image/');
            const isPdf = file.file_type?.includes('pdf');
            const canPreview = isImage || isPdf;
            const filePriceType = file.price_type || 'free';
            const fileRestricted = filePriceType !== 'free' && !isSubscriber && !isAdmin && !isMod;
            return (
              <div key={file.id} className="group flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground truncate">{file.file_name}</p>
                    {filePriceType !== 'free' && (
                      <Crown className="h-3 w-3 shrink-0" style={{ color: 'hsl(270 60% 55%)' }} />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-muted-foreground">{formatFileSize(file.file_size)}</p>
                    {fileRestricted && isPdf && <span className="text-[10px] text-warning font-medium">Prévia limitada</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canPreview && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                      if (isPdf) onPreviewPdf(file.file_url, fileRestricted);
                      else window.open(file.file_url, '_blank');
                    }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {!fileRestricted ? (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                      <a href={file.file_url} download={file.file_name} target="_blank" rel="noopener noreferrer"><Download className="h-3.5 w-3.5" /></a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground/40 cursor-not-allowed" disabled title="Assinantes apenas">
                      <Lock className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canEdit && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditFile(file)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onDeleteFile(file.id)} title="Remover">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit File Dialog (name + visibility) */}
      {editingFile && (
        <Dialog open={!!editingFile} onOpenChange={open => !open && setEditingFile(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="font-display text-sm">Editar Anexo</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input value={editFileName} onChange={e => setEditFileName(e.target.value)} maxLength={200} autoFocus />
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Visibilidade</p>
                <div className="flex gap-2">
                  {([
                    { value: 'free', label: 'Liberado', icon: Globe },
                    { value: 'members_only', label: 'Assinantes', icon: Lock },
                  ] as const).map(opt => (
                    <Button
                      key={opt.value}
                      variant={editFilePriceType === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditFilePriceType(opt.value)}
                      className="gap-1.5 flex-1"
                    >
                      <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <Button className="w-full" disabled={!editFileName.trim()} onClick={handleSaveFile}>
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
};

export default LessonFiles;
