import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading2,
  List, ListOrdered, Code, Volume2, Palette, ImagePlus, ScanEye, Link2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ToolbarItem {
  id: string;
  label: string;
  icon: LucideIcon | 'cloze' | 'clozeNext';
  visible: boolean;
}

export const DEFAULT_TOOLBAR_ITEMS: ToolbarItem[] = [
  { id: 'image', label: 'Anexo de imagem', icon: ImagePlus, visible: true },
  { id: 'cloze', label: 'Preencha o espaço em branco', icon: 'cloze', visible: true },
  { id: 'clozeNext', label: 'Oclusão de texto (+)', icon: 'clozeNext', visible: true },
  { id: 'occlusion', label: 'Oclusão de imagem', icon: ScanEye, visible: true },
  { id: 'link', label: 'Inserir link', icon: Link2, visible: true },
  { id: 'audio', label: 'Texto para voz', icon: Volume2, visible: true },
  { id: 'color', label: 'Destaque e cor', icon: Palette, visible: true },
  { id: 'bold', label: 'Negrito', icon: Bold, visible: true },
  { id: 'italic', label: 'Itálico', icon: Italic, visible: true },
  { id: 'underline', label: 'Sublinhado', icon: UnderlineIcon, visible: true },
  { id: 'strike', label: 'Tachado', icon: Strikethrough, visible: true },
  { id: 'heading', label: 'Cabeçalho', icon: Heading2, visible: true },
  { id: 'bulletList', label: 'Lista com marcadores', icon: List, visible: true },
  { id: 'orderedList', label: 'Lista numerada', icon: ListOrdered, visible: true },
  { id: 'codeBlock', label: 'Código', icon: Code, visible: true },
];

const STORAGE_KEY = 'rich-editor-toolbar-config';

export function loadToolbarConfig(): ToolbarItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_TOOLBAR_ITEMS;
    const parsed: { id: string; visible: boolean }[] = JSON.parse(saved);
    // Merge saved order/visibility with defaults (handles new items)
    const savedMap = new Map(parsed.map((p, i) => [p.id, { visible: p.visible, order: i }]));
    const items = DEFAULT_TOOLBAR_ITEMS.map(item => ({
      ...item,
      visible: savedMap.has(item.id) ? savedMap.get(item.id)!.visible : item.visible,
    }));
    // Sort by saved order, new items go to end
    items.sort((a, b) => {
      const oa = savedMap.get(a.id)?.order ?? 999;
      const ob = savedMap.get(b.id)?.order ?? 999;
      return oa - ob;
    });
    return items;
  } catch {
    return DEFAULT_TOOLBAR_ITEMS;
  }
}

export function saveToolbarConfig(items: ToolbarItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(i => ({ id: i.id, visible: i.visible }))));
}
