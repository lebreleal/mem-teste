import { useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { GripVertical, ImagePlus, ScanEye, Volume2, Palette, Bold, Italic, Underline, Strikethrough, Heading2, List, ListOrdered, Code } from 'lucide-react';
import type { ToolbarItem } from './toolbarConfig';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  image: ImagePlus,
  occlusion: ScanEye,
  audio: Volume2,
  color: Palette,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strike: Strikethrough,
  heading: Heading2,
  bulletList: List,
  orderedList: ListOrdered,
  codeBlock: Code,
};

const ClozeIcon = ({ plus }: { plus?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="4 3" />
    {plus && <>
      <path d="M12 9v6" />
      <path d="M9 12h6" />
    </>}
  </svg>
);

function getIcon(item: ToolbarItem) {
  if (item.id === 'cloze') return <ClozeIcon />;
  if (item.id === 'clozeNext') return <ClozeIcon plus />;
  const Icon = ICON_MAP[item.id];
  return Icon ? <Icon className="h-[18px] w-[18px]" /> : null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: ToolbarItem[];
  onSave: (items: ToolbarItem[]) => void;
}

export default function ToolbarConfigSheet({ open, onOpenChange, items, onSave }: Props) {
  const [local, setLocal] = useState<ToolbarItem[]>(items);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Sync when sheet opens
  const handleOpenChange = (v: boolean) => {
    if (v) setLocal(items);
    else onSave(local);
    onOpenChange(v);
  };

  const toggleVisibility = (id: string) => {
    setLocal(prev => prev.map(i => i.id === id ? { ...i, visible: !i.visible } : i));
  };

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setLocal(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(idx);
  };

  const handleDragEnd = () => setDragIdx(null);

  // Touch-based reorder
  const [touchIdx, setTouchIdx] = useState<number | null>(null);

  const moveItem = useCallback((from: number, to: number) => {
    if (from === to) return;
    setLocal(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-center">Configurações</SheetTitle>
        </SheetHeader>
        <div className="space-y-0.5">
          {local.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={handleDragStart(idx)}
              onDragOver={handleDragOver(idx)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 rounded-lg px-2 py-3 transition-colors ${
                dragIdx === idx ? 'bg-accent/50' : ''
              }`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing touch-none" />
              <span className="text-muted-foreground shrink-0">{getIcon(item)}</span>
              <span className="flex-1 text-sm font-medium truncate">{item.label}</span>
              <Switch
                checked={item.visible}
                onCheckedChange={() => toggleVisibility(item.id)}
              />
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
