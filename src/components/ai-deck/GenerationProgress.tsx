/**
 * Interactive loading screen with dino mini-game + real progress status.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Progress } from '@/components/ui/progress';
import type { GenProgress } from './types';

interface GenerationProgressProps {
  genProgress: GenProgress;
}

const TIPS = [
  '💡 Flashcards aumentam retenção em até 50%!',
  '🧠 Repetição espaçada é a técnica mais eficaz de memorização',
  '📚 Estudar em intervalos curtos é melhor que sessões longas',
  '🎯 Testar a si mesmo é mais eficaz que reler o material',
  '⚡ 20 minutos de revisão ativa > 2 horas de leitura passiva',
  '🏆 Consistência diária supera intensidade esporádica',
];

// --- Dino Game Logic ---
const CANVAS_W = 280;
const CANVAS_H = 120;
const GROUND_Y = 95;
const DINO_W = 20;
const DINO_H = 24;
const GRAVITY = 0.6;
const JUMP_VEL = -9;
const CACTUS_W = 12;
const CACTUS_H = 22;
const CACTUS_GAP_MIN = 90;
const CACTUS_GAP_MAX = 160;
const SPEED_INIT = 3;
const SPEED_INC = 0.001;

interface DinoState {
  y: number;
  vy: number;
  onGround: boolean;
}

interface Cactus {
  x: number;
  w: number;
  h: number;
}

const GenerationProgress = ({ genProgress }: GenerationProgressProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const dinoRef = useRef<DinoState>({ y: GROUND_Y - DINO_H, vy: 0, onGround: true });
  const cactiRef = useRef<Cactus[]>([]);
  const scoreRef = useRef(0);
  const speedRef = useRef(SPEED_INIT);
  const nextCactusRef = useRef(CACTUS_GAP_MAX);
  const [score, setScore] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);

  // Rotate tips
  useEffect(() => {
    const iv = setInterval(() => setTipIdx(p => (p + 1) % TIPS.length), 4000);
    return () => clearInterval(iv);
  }, []);

  const jump = useCallback(() => {
    const d = dinoRef.current;
    if (d.onGround) {
      d.vy = JUMP_VEL;
      d.onGround = false;
    }
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    
    // Reset game state
    dinoRef.current = { y: GROUND_Y - DINO_H, vy: 0, onGround: true };
    cactiRef.current = [];
    scoreRef.current = 0;
    speedRef.current = SPEED_INIT;
    nextCactusRef.current = CACTUS_GAP_MAX;

    const getColors = () => {
      const style = getComputedStyle(document.documentElement);
      const fg = style.getPropertyValue('--foreground').trim();
      const muted = style.getPropertyValue('--muted-foreground').trim();
      const primary = style.getPropertyValue('--primary').trim();
      return {
        fg: fg ? `hsl(${fg})` : '#333',
        muted: muted ? `hsl(${muted})` : '#999',
        primary: primary ? `hsl(${primary})` : '#7c3aed',
        ground: muted ? `hsl(${muted} / 0.3)` : '#ddd',
      };
    };

    const tick = () => {
      const colors = getColors();
      const d = dinoRef.current;
      const cacti = cactiRef.current;
      const speed = speedRef.current;

      // Physics
      d.vy += GRAVITY;
      d.y += d.vy;
      if (d.y >= GROUND_Y - DINO_H) {
        d.y = GROUND_Y - DINO_H;
        d.vy = 0;
        d.onGround = true;
      }

      // Cacti
      nextCactusRef.current -= speed;
      if (nextCactusRef.current <= 0) {
        cacti.push({ x: CANVAS_W + 10, w: CACTUS_W, h: CACTUS_H + Math.random() * 8 });
        nextCactusRef.current = CACTUS_GAP_MIN + Math.random() * (CACTUS_GAP_MAX - CACTUS_GAP_MIN);
      }

      for (let i = cacti.length - 1; i >= 0; i--) {
        cacti[i].x -= speed;
        if (cacti[i].x < -20) cacti.splice(i, 1);
      }

      // Collision
      const dinoBox = { x: 30, y: d.y, w: DINO_W, h: DINO_H };
      let hit = false;
      for (const c of cacti) {
        if (dinoBox.x + dinoBox.w - 4 > c.x && dinoBox.x + 4 < c.x + c.w && dinoBox.y + dinoBox.h > GROUND_Y - c.h) {
          hit = true;
          break;
        }
      }

      if (hit) {
        // Reset
        d.y = GROUND_Y - DINO_H; d.vy = 0; d.onGround = true;
        cacti.length = 0;
        scoreRef.current = 0;
        speedRef.current = SPEED_INIT;
        nextCactusRef.current = CACTUS_GAP_MAX;
        setScore(0);
      } else {
        scoreRef.current++;
        speedRef.current += SPEED_INC;
        if (scoreRef.current % 5 === 0) setScore(scoreRef.current);
      }

      // Draw
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Ground
      ctx.strokeStyle = colors.ground;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(CANVAS_W, GROUND_Y);
      ctx.stroke();

      // Dino (cute elephant emoji style - rounded body)
      ctx.fillStyle = colors.primary;
      const dx = 30, dy = d.y;
      // Body
      ctx.beginPath();
      ctx.roundRect(dx, dy + 4, DINO_W, DINO_H - 4, 6);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(dx + DINO_W - 2, dy + 6, 7, 0, Math.PI * 2);
      ctx.fill();
      // Eye
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(dx + DINO_W + 1, dy + 5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.fg;
      ctx.beginPath();
      ctx.arc(dx + DINO_W + 1.5, dy + 5, 1, 0, Math.PI * 2);
      ctx.fill();
      // Legs
      ctx.fillStyle = colors.primary;
      ctx.fillRect(dx + 3, dy + DINO_H - 2, 4, 4);
      ctx.fillRect(dx + DINO_W - 7, dy + DINO_H - 2, 4, 4);

      // Cacti
      ctx.fillStyle = colors.muted;
      for (const c of cacti) {
        ctx.beginPath();
        ctx.roundRect(c.x, GROUND_Y - c.h, c.w, c.h, 3);
        ctx.fill();
      }

      // Score
      ctx.fillStyle = colors.fg;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${scoreRef.current}`, CANVAS_W - 8, 16);

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    // Input handlers
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); } };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('keydown', onKey);
    };
  }, [jump]);

  const hasBatches = genProgress.total > 0;
  const progressValue = hasBatches ? (genProgress.current / genProgress.total) * 100 : 0;

  const getMessage = () => {
    if (!hasBatches) return 'Preparando conteúdo...';
    if (genProgress.current < genProgress.total) return `Gerando lote ${genProgress.current} de ${genProgress.total}`;
    return 'Finalizando seus cartões...';
  };

  return (
    <div className="flex flex-col items-center justify-center py-6 gap-4 animate-fade-in">
      {/* Mini-game */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="rounded-xl border border-border bg-card cursor-pointer touch-manipulation"
          onClick={jump}
          onTouchStart={(e) => { e.preventDefault(); jump(); }}
        />
        <p className="text-[10px] text-muted-foreground text-center mt-1.5 animate-pulse">
          Toque ou aperte espaço para pular! 🎮
        </p>
      </div>

      {/* Status */}
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">{getMessage()}</p>
        <p className="text-xs text-muted-foreground transition-all duration-500">{TIPS[tipIdx]}</p>
      </div>

      {/* Progress bar */}
      {hasBatches && (
        <div className="w-56 space-y-2">
          <Progress value={progressValue} className="h-2" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{Math.round(progressValue)}%</span>
            <span>
              <span className="font-bold" style={{ color: 'hsl(var(--energy-purple))' }}>{genProgress.creditsUsed}</span> créditos
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerationProgress;
