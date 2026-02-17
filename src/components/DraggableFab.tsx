import { useState, useRef, useCallback, useEffect } from 'react';
import { Brain } from 'lucide-react';

const STORAGE_KEY = 'fab-position';
const FAB_SIZE = 56;
const MARGIN = 8;

const clampPos = (x: number, y: number) => ({
  x: Math.max(MARGIN, Math.min(window.innerWidth - FAB_SIZE - MARGIN, x)),
  y: Math.max(MARGIN, Math.min(window.innerHeight - FAB_SIZE - MARGIN, y)),
});

const getInitialPos = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return clampPos(parsed.x, parsed.y);
    }
  } catch {}
  return { x: window.innerWidth - FAB_SIZE - MARGIN * 2, y: window.innerHeight - FAB_SIZE - MARGIN * 2 };
};

export interface FabMenuAction {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}

const DraggableFab = ({ actions }: { actions: FabMenuAction[] }) => {
  const [pos, setPos] = useState(getInitialPos);
  const [isActive, setIsActive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dragging = useRef(false);
  const hasMoved = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const animFrame = useRef<number>(0);
  const pendingPos = useRef({ x: 0, y: 0 });
  const activeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStart = useCallback((cx: number, cy: number) => {
    dragging.current = true;
    hasMoved.current = false;
    setIsActive(true);
    if (activeTimer.current) clearTimeout(activeTimer.current);
    offset.current = { x: cx - pos.x, y: cy - pos.y };
  }, [pos]);

  const handleMove = useCallback((cx: number, cy: number) => {
    if (!dragging.current) return;
    hasMoved.current = true;
    pendingPos.current = clampPos(cx - offset.current.x, cy - offset.current.y);
    if (!animFrame.current) {
      animFrame.current = requestAnimationFrame(() => {
        setPos(pendingPos.current);
        animFrame.current = 0;
      });
    }
  }, []);

  const handleEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    if (animFrame.current) {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = 0;
      setPos(pendingPos.current);
    }
    setPos(prev => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prev)); } catch {}
      return prev;
    });
    activeTimer.current = setTimeout(() => setIsActive(false), 1200);
  }, []);

  // Clamp on resize / orientation change
  useEffect(() => {
    const onResize = () => {
      setPos(prev => {
        const clamped = clampPos(prev.x, prev.y);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped)); } catch {}
        return clamped;
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('mousemove', (e: MouseEvent) => handleMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('mousemove', handleMove as any);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('resize', onResize);
    };
  }, [handleMove, handleEnd]);

  useEffect(() => {
    return () => {
      if (activeTimer.current) clearTimeout(activeTimer.current);
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      // Check if click is outside the FAB area
      const target = e.target as HTMLElement;
      if (!target.closest('[data-fab-menu]')) {
        setMenuOpen(false);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', handler);
      document.addEventListener('touchstart', handler);
    }, 50);
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [menuOpen]);

  // Determine if menu should open upward or downward
  const opensUp = pos.y > window.innerHeight / 2;

  return (
    <div data-fab-menu style={{ position: 'fixed', zIndex: 9999, left: 0, top: 0, transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}>
      {/* Menu popup */}
      {menuOpen && (
        <div
          className="absolute flex flex-col gap-1.5 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-md p-2 shadow-xl animate-fade-in"
          style={{
            ...(opensUp
              ? { bottom: FAB_SIZE + 8, right: 0 }
              : { top: FAB_SIZE + 8, right: 0 }),
            minWidth: 200,
          }}
        >
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => {
                  setMenuOpen(false);
                  action.onClick();
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors text-left"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {/* FAB button */}
      <button
        className={`flex items-center justify-center rounded-full shadow-lg active:scale-95 touch-none select-none border transition-opacity duration-300 ${
          isActive || menuOpen
            ? 'bg-primary border-primary/40 opacity-100'
            : 'bg-primary/70 border-primary/20 opacity-40'
        }`}
        style={{ width: FAB_SIZE, height: FAB_SIZE }}
        onTouchStart={e => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onMouseDown={e => { e.preventDefault(); handleStart(e.clientX, e.clientY); }}
        onClick={e => {
          if (hasMoved.current) { e.preventDefault(); return; }
          setIsActive(true);
          if (activeTimer.current) clearTimeout(activeTimer.current);
          activeTimer.current = setTimeout(() => setIsActive(false), 3000);
          setMenuOpen(prev => !prev);
        }}
      >
        <Brain className="h-6 w-6 text-primary-foreground" />
      </button>
    </div>
  );
};

export default DraggableFab;
