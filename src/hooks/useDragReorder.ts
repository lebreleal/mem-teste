/**
 * Reusable drag-to-reorder hook using native HTML5 Drag & Drop.
 * Returns drag event handlers and visual state for each item.
 */

import { useState, useCallback, useRef } from 'react';

export interface DragReorderHandlers {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  className: string;
}

interface UseDragReorderOptions<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (reorderedItems: T[]) => void;
}

export function useDragReorder<T>({ items, getId, onReorder }: UseDragReorderOptions<T>) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragCounter = useRef<Map<string, number>>(new Map());

  const getHandlers = useCallback(
    (item: T): DragReorderHandlers => {
      const id = getId(item);
      const isDragged = draggedId === id;
      const isOver = overId === id && draggedId !== id;

      return {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', id);
          setDraggedId(id);
        },
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        },
        onDragEnter: (e: React.DragEvent) => {
          e.preventDefault();
          const count = (dragCounter.current.get(id) || 0) + 1;
          dragCounter.current.set(id, count);
          setOverId(id);
        },
        onDragLeave: (e: React.DragEvent) => {
          const count = (dragCounter.current.get(id) || 0) - 1;
          dragCounter.current.set(id, count);
          if (count <= 0) {
            dragCounter.current.delete(id);
            if (overId === id) setOverId(null);
          }
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          dragCounter.current.clear();
          const fromId = e.dataTransfer.getData('text/plain');
          if (!fromId || fromId === id) {
            setDraggedId(null);
            setOverId(null);
            return;
          }
          const fromIndex = items.findIndex((i) => getId(i) === fromId);
          const toIndex = items.findIndex((i) => getId(i) === id);
          if (fromIndex === -1 || toIndex === -1) return;

          const reordered = [...items];
          const [moved] = reordered.splice(fromIndex, 1);
          reordered.splice(toIndex, 0, moved);
          onReorder(reordered);
          setDraggedId(null);
          setOverId(null);
        },
        onDragEnd: (e: React.DragEvent) => {
          dragCounter.current.clear();
          setDraggedId(null);
          setOverId(null);
        },
        className: isDragged
          ? 'opacity-50 scale-[0.98]'
          : isOver
          ? 'ring-2 ring-primary/40 bg-primary/5'
          : '',
      };
    },
    [items, getId, onReorder, draggedId, overId]
  );

  return { getHandlers, isDragging: draggedId !== null };
}
