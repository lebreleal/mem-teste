/**
 * Reusable drag-to-reorder hook using native HTML5 Drag & Drop.
 * Performs live swap (iOS-style) while dragging.
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
  const [liveItems, setLiveItems] = useState<T[] | null>(null);
  const dragCounter = useRef<Map<string, number>>(new Map());
  const hasSwapped = useRef(false);

  // Use live items during drag, otherwise use original items
  const displayItems = liveItems ?? items;

  const getHandlers = useCallback(
    (item: T): DragReorderHandlers => {
      const id = getId(item);
      const isDragged = draggedId === id;

      return {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', id);
          setDraggedId(id);
          setLiveItems([...items]);
          hasSwapped.current = false;
        },
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        },
        onDragEnter: (e: React.DragEvent) => {
          e.preventDefault();
          const count = (dragCounter.current.get(id) || 0) + 1;
          dragCounter.current.set(id, count);

          // Live swap: immediately reorder when entering another item
          if (draggedId && draggedId !== id) {
            setLiveItems(prev => {
              const current = prev ?? [...items];
              const fromIndex = current.findIndex(i => getId(i) === draggedId);
              const toIndex = current.findIndex(i => getId(i) === id);
              if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return current;
              const reordered = [...current];
              const [moved] = reordered.splice(fromIndex, 1);
              reordered.splice(toIndex, 0, moved);
              hasSwapped.current = true;
              return reordered;
            });
          }
        },
        onDragLeave: (e: React.DragEvent) => {
          const count = (dragCounter.current.get(id) || 0) - 1;
          dragCounter.current.set(id, count);
          if (count <= 0) {
            dragCounter.current.delete(id);
          }
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          dragCounter.current.clear();
          if (liveItems && hasSwapped.current) {
            onReorder(liveItems);
          }
          setDraggedId(null);
          setLiveItems(null);
          hasSwapped.current = false;
        },
        onDragEnd: (e: React.DragEvent) => {
          dragCounter.current.clear();
          if (liveItems && hasSwapped.current) {
            onReorder(liveItems);
          }
          setDraggedId(null);
          setLiveItems(null);
          hasSwapped.current = false;
        },
        className: [
          'transition-all duration-200 ease-in-out',
          isDragged ? 'opacity-50 scale-[0.97] shadow-lg z-10 relative' : '',
        ].filter(Boolean).join(' '),
      };
    },
    [items, getId, onReorder, draggedId, liveItems]
  );

  return { getHandlers, isDragging: draggedId !== null, displayItems };
}
