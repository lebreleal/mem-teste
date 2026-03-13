/**
 * AI Source Selector — banner/chip at top of AI generation screens.
 * Shows the active source with ability to swap or remove.
 */

import { useState } from 'react';
import { FileText, Upload, X, ChevronDown, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAISources, type AISource } from '@/hooks/useAISources';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AISourceSelectorProps {
  selectedSourceId: string | null;
  onSelectSource: (source: AISource | null) => void;
  /** Called when user wants to upload a new file as source */
  onUploadNew?: () => void;
}

const AISourceSelector = ({ selectedSourceId, onSelectSource, onUploadNew }: AISourceSelectorProps) => {
  const { sources, isLoading, remove } = useAISources();
  const [open, setOpen] = useState(false);

  const selected = sources.find(s => s.id === selectedSourceId);

  if (isLoading || sources.length === 0) return null;

  const formatExpiry = (expiresAt: string) => {
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return `${days}d restantes`;
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {selected ? (
            <button className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs transition-colors hover:bg-muted">
              {selected.source_type === 'file' ? (
                <Upload className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
              <span className="font-medium text-foreground truncate max-w-[200px]">{selected.name}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            </button>
          ) : (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Usar fonte salva
              <ChevronDown className="h-3 w-3" />
            </Button>
          )}
        </PopoverTrigger>

        <PopoverContent align="start" className="w-80 p-2">
          <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Fontes recentes (30 dias)
          </p>

          <div className="max-h-60 overflow-y-auto space-y-0.5 mt-1">
            {sources.map(source => (
              <div
                key={source.id}
                className={`flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer transition-colors hover:bg-muted/80 ${
                  source.id === selectedSourceId ? 'bg-primary/10 border border-primary/20' : ''
                }`}
                onClick={() => { onSelectSource(source); setOpen(false); }}
              >
                {source.source_type === 'file' ? (
                  <Upload className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{source.name}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{source.source_type === 'file' ? formatSize(source.file_size) : `${(source.text_content?.length ?? 0).toLocaleString()} chars`}</span>
                    <span>·</span>
                    <Clock className="h-2.5 w-2.5" />
                    <span>{formatExpiry(source.expires_at)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); remove.mutate(source); }}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {selected && (
            <button
              onClick={() => { onSelectSource(null); setOpen(false); }}
              className="w-full mt-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3" />
              Remover fonte
            </button>
          )}
        </PopoverContent>
      </Popover>

      {selected && (
        <button
          onClick={() => onSelectSource(null)}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

export default AISourceSelector;
