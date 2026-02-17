import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

const STORAGE_KEY = 'pomodoro-float-pos';
const SIZE = 64;
const MARGIN = 8;

const clampPos = (x: number, y: number) => ({
  x: Math.max(MARGIN, Math.min(window.innerWidth - SIZE - MARGIN, x)),
  y: Math.max(MARGIN, Math.min(window.innerHeight - SIZE - MARGIN, y)),
});

const getInitialPos = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return clampPos(...(Object.values(JSON.parse(saved)) as [number, number]));
  } catch {}
  return { x: MARGIN * 2, y: window.innerHeight - SIZE - MARGIN * 2 };
};

interface PomodoroFloaterProps {
  secondsLeft: number;
  totalSeconds: number;
  isBreak: boolean;
  onStop: () => void;
}

const PomodoroFloater = ({ secondsLeft, totalSeconds, isBreak, onStop }: PomodoroFloaterProps) => {
  const [pos, setPos] = useState(getInitialPos);
  const dragging = useRef(false);
  const hasMoved = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const animFrame = useRef<number>(0);
  const pendingPos = useRef({ x: 0, y: 0 });

  const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;

  const getColor = () => {
    if (isBreak) return 'hsl(var(--success))';
    if (progress < 0.5) return 'hsl(var(--primary))';
    if (progress < 0.75) return 'hsl(var(--warning))';
    if (progress < 0.9) return 'hsl(38, 92%, 50%)';
    return 'hsl(var(--destructive))';
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Play sound when timer ends
  useEffect(() => {
    if (secondsLeft === 0 && totalSeconds > 0) {
      try {
        const ctx = new AudioContext();
        const playBeep = (freq: number, delay: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.6);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.6);
        };
        playBeep(isBreak ? 523.25 : 440, 0);
        playBeep(isBreak ? 659.25 : 523.25, 0.25);
        playBeep(isBreak ? 783.99 : 659.25, 0.5);
      } catch {}
    }
  }, [secondsLeft, totalSeconds, isBreak]);

  const handleStart = useCallback((cx: number, cy: number) => {
    dragging.current = true;
    hasMoved.current = false;
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
  }, []);

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', handleEnd);

    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [handleMove, handleEnd]);

  const color = getColor();
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      data-pomodoro-float
      style={{
        position: 'fixed',
        zIndex: 9998,
        left: 0,
        top: 0,
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
      }}
    >
      <div
        className="relative flex items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing"
        style={{ width: SIZE, height: SIZE }}
        onTouchStart={e => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onMouseDown={e => { e.preventDefault(); handleStart(e.clientX, e.clientY); }}
      >
        {/* Outer glow pulse */}
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: `radial-gradient(circle, ${color.replace(')', ' / 0.15)')} 0%, transparent 70%)`,
          }}
        />

        {/* Background circle */}
        <div
          className="absolute inset-[3px] rounded-full shadow-xl"
          style={{
            background: 'hsl(var(--card))',
            boxShadow: `0 4px 20px -4px ${color.replace(')', ' / 0.3)')}`,
          }}
        />

        {/* Circular progress ring */}
        <svg
          className="absolute inset-0"
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--border) / 0.2)"
            strokeWidth="3"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{
              transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease',
              filter: `drop-shadow(0 0 4px ${color.replace(')', ' / 0.5)')})`,
            }}
          />
        </svg>

        {/* Timer text */}
        <div className="relative flex flex-col items-center">
          <span
            className="text-[13px] font-bold tabular-nums leading-none tracking-tight"
            style={{ color }}
          >
            {formatTime(secondsLeft)}
          </span>
          <span className="text-[8px] text-muted-foreground mt-1 font-medium uppercase tracking-wider">
            {isBreak ? 'Pausa' : 'Foco'}
          </span>
        </div>

        {/* Close button */}
        <button
          onClick={(e) => {
            if (hasMoved.current) { e.preventDefault(); return; }
            onStop();
          }}
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-card border border-border/60 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors shadow-sm"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

export default PomodoroFloater;
