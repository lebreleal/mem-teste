import { useState, useCallback, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { GripVertical } from 'lucide-react';
import { DEFAULT_TOOLBAR_ITEMS, type ToolbarItem } from './toolbarConfig';

/* ─── Custom SVG icons matching the toolbar exactly ─── */

const IconImage = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
    <path fillRule="evenodd" d="M20 7V6H4v5.586L6.586 9a2 2 0 0 1 2.828 0l3.086 3.086L13.586 11a2 2 0 0 1 2.828 0L20 14.586zm2 9.999V5.882C22 4.842 21.147 4 20.095 4H3.905A1.894 1.894 0 0 0 2 5.882v12.236C2 19.158 2.853 20 3.905 20h16.19A1.894 1.894 0 0 0 22 18.118v-1.119m-2 .352-5-4.937-1.086 1.086 1.793 1.793a1 1 0 0 1-1.414 1.414l-2.5-2.5L8 10.414l-4 4V18h16z" clipRule="evenodd" />
  </svg>
);

const IconCloze = ({ plus }: { plus?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
    <path fillRule="evenodd" d="M3 17.25V19a2 2 0 0 0 2 2h1.75v-2H5v-1.75zm0-3.5h2v-3.5H3zm0-7h2V5h1.75V3H5a2 2 0 0 0-2 2zM10.25 3v2h3.5V3zm7 0v2H19v1.75h2V5a2 2 0 0 0-2-2zM21 10.25h-2v3.5h2zm0 7h-2V19h-1.75v2H19a2 2 0 0 0 2-2zM13.75 21v-2h-3.5v2z" clipRule="evenodd" />
    {plus && <path d="M13 8h-2v3H8v2h3v3h2v-3h3v-2h-3z" />}
  </svg>
);

const IconOcclusion = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
    <path d="M2 18v-1.5h2V18h2v2H4a2 2 0 0 1-2-2M4 4h2v2H4v1.5H2V6a2 2 0 0 1 2-2M3.486 13.5H2v-3h2L6.586 8a2 2 0 0 1 2.828 0L13 11.586l.586-.586a2 2 0 0 1 2.828 0l5.086 5 .5.5V18a2 2 0 0 1-2 2h-2v-2h2v-.586l-5-5-.586.586 1.293 1.293a1 1 0 0 1-1.414 1.414L8 9.414 4.5 13l-.5.5h-.514M10 6V4h4v2zM18 6V4h2a2 2 0 0 1 2 2v1.5h-2V6zM20 10.5h2v3h-2z" />
    <path d="M14 18v2h-4v-2z" />
  </svg>
);

const IconLink = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
    <g>
      <path d="m13.29 9.29-4 4a1 1 0 0 0 0 1.42 1 1 0 0 0 1.42 0l4-4a1 1 0 0 0-1.42-1.42" />
      <path d="M12.28 17.4 11 18.67a4.2 4.2 0 0 1-5.58.4 4 4 0 0 1-.27-5.93l1.42-1.43a1 1 0 0 0 0-1.42 1 1 0 0 0-1.42 0l-1.27 1.28a6.15 6.15 0 0 0-.67 8.07 6.06 6.06 0 0 0 9.07.6l1.42-1.42a1 1 0 0 0-1.42-1.42M19.66 3.22a6.18 6.18 0 0 0-8.13.68L10.45 5a1.09 1.09 0 0 0-.17 1.61 1 1 0 0 0 1.42 0L13 5.3a4.17 4.17 0 0 1 5.57-.4 4 4 0 0 1 .27 5.95l-1.42 1.43a1 1 0 0 0 0 1.42 1 1 0 0 0 1.42 0l1.42-1.42a6.06 6.06 0 0 0-.6-9.06" />
    </g>
  </svg>
);

const IconAudio = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const IconColor = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
    <path d="M12 6 7.226 19.367a.953.953 0 0 1-1.801-.625L9.94 5.36A2 2 0 0 1 11.836 4h.328a2 2 0 0 1 1.895 1.36l4.516 13.382a.953.953 0 0 1-1.801.625z" />
    <path d="M8 14h8v2H8z" />
  </svg>
);

const IconBold = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
  </svg>
);

const IconItalic = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <line x1="19" x2="10" y1="4" y2="4" /><line x1="14" x2="5" y1="20" y2="20" /><line x1="15" x2="9" y1="4" y2="20" />
  </svg>
);

const IconUnderline = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d="M6 4v6a6 6 0 0 0 12 0V4" /><line x1="4" x2="20" y1="20" y2="20" />
  </svg>
);

const IconStrike = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d="M16 4H9a3 3 0 0 0-2.83 4" /><path d="M14 12a4 4 0 0 1 0 8H6" /><line x1="4" x2="20" y1="12" y2="12" />
  </svg>
);

const IconHeading = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="M17 12l3 6" /><path d="M20.5 12H17l3 6" />
  </svg>
);

const IconBulletList = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" />
    <line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" />
  </svg>
);

const IconOrderedList = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <line x1="10" x2="21" y1="6" y2="6" /><line x1="10" x2="21" y1="12" y2="12" /><line x1="10" x2="21" y1="18" y2="18" />
    <path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </svg>
);

const IconCode = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);

const ICON_COMPONENTS: Record<string, React.FC> = {
  image: IconImage,
  cloze: () => <IconCloze />,
  clozeNext: () => <IconCloze plus />,
  occlusion: IconOcclusion,
  link: IconLink,
  audio: IconAudio,
  color: IconColor,
  bold: IconBold,
  italic: IconItalic,
  underline: IconUnderline,
  strike: IconStrike,
  heading: IconHeading,
  bulletList: IconBulletList,
  orderedList: IconOrderedList,
  codeBlock: IconCode,
};

function getIcon(item: ToolbarItem) {
  const Comp = ICON_COMPONENTS[item.id];
  return Comp ? <Comp /> : null;
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

  // Ensure ALL default items are always present (handles newly added items)
  useEffect(() => {
    if (!open) return;
    setLocal(prev => {
      const existingIds = new Set(prev.map(i => i.id));
      const missing = DEFAULT_TOOLBAR_ITEMS.filter(d => !existingIds.has(d.id));
      if (missing.length === 0) return prev;
      return [...prev, ...missing];
    });
  }, [open]);

  // Sync when sheet opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      // Merge items prop with any missing defaults
      const existingIds = new Set(items.map(i => i.id));
      const missing = DEFAULT_TOOLBAR_ITEMS.filter(d => !existingIds.has(d.id));
      setLocal(missing.length > 0 ? [...items, ...missing] : items);
    } else {
      onSave(local);
    }
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

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-center">Configurações</SheetTitle>
        </SheetHeader>
        <div className="space-y-0.5 pb-4">
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
