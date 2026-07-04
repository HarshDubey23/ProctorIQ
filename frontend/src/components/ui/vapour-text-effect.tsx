import { useRef, useEffect, useState, useCallback } from "react";

export enum Tag {
  H1 = "h1",
  H2 = "h2",
  H3 = "h3",
  P = "p",
  Span = "span",
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  targetAlpha: number;
  size: number;
  originX: number;
  originY: number;
}

interface VaporizeTextCycleProps {
  texts: string[];
  font?: { fontFamily?: string; fontSize?: string; fontWeight?: number };
  color?: string;
  spread?: number;
  density?: number;
  animation?: {
    vaporizeDuration?: number;
    fadeInDuration?: number;
    waitDuration?: number;
  };
  direction?: "left-to-right" | "right-to-left" | "top-to-bottom" | "bottom-to-top";
  alignment?: "left" | "center" | "right";
  tag?: Tag;
}

function isReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function VaporizeTextCycle({
  texts,
  font = {},
  color = "rgb(26,26,23)",
  spread = 4,
  density = 6,
  animation = {},
  direction = "left-to-right",
  alignment = "center",
  tag = Tag.H1,
}: VaporizeTextCycleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const textIndexRef = useRef(0);
  const phaseRef = useRef<"vaporize" | "wait" | "fadein">("fadein");
  const phaseTimerRef = useRef(0);
  const reducedMotion = isReducedMotion();
  const [isVisible, setIsVisible] = useState(false);

  const {
    vaporizeDuration = 2,
    fadeInDuration = 1,
    waitDuration = 0.6,
  } = animation;

  const fontSize = font.fontSize ? parseInt(font.fontSize) : 80;
  const fontFamily = font.fontFamily || "'Archivo Expanded', sans-serif";
  const fontWeight = font.fontWeight || 900;

  const drawTextToCanvas = useCallback((text: string, ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "middle";
    const metrics = ctx.measureText(text);
    let x: number;
    if (alignment === "center") x = (w - metrics.width) / 2;
    else if (alignment === "right") x = w - metrics.width - 20;
    else x = 20;
    const y = h / 2;
    ctx.fillText(text, x, y);
  }, [color, fontSize, fontFamily, fontWeight, alignment]);

  const captureParticles = useCallback((text: string, w: number, h: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    drawTextToCanvas(text, ctx, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const particles: Particle[] = [];
    const step = Math.max(1, Math.floor(density));

    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const idx = (y * w + x) * 4;
        if (data[idx + 3] > 128) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * spread * 10;
          particles.push({
            x, y,
            vx: Math.cos(angle) * dist,
            vy: Math.sin(angle) * dist,
            alpha: 1,
            targetAlpha: 1,
            size: Math.random() * 3 + 1,
            originX: x,
            originY: y,
          });
        }
      }
    }
    return particles;
  }, [drawTextToCanvas, density, spread]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || !isVisible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const safeCtx: CanvasRenderingContext2D = ctx;

    let w = canvas.offsetWidth * window.devicePixelRatio;
    let h = canvas.offsetHeight * window.devicePixelRatio;
    canvas.width = w;
    canvas.height = h;
    safeCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const cssW = canvas.offsetWidth;
    const cssH = canvas.offsetHeight;

    let currentParticles = captureParticles(texts[0], w, h);
    particlesRef.current = currentParticles;
    textIndexRef.current = 0;
    phaseRef.current = "fadein";
    phaseTimerRef.current = 0;

    let lastTime = performance.now();

    function animate(time: number) {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      phaseTimerRef.current += dt;

      const currentPhase = phaseRef.current;
      const currentIdx = textIndexRef.current;
      const totalParticles = particlesRef.current;

      if (currentPhase === "wait" && phaseTimerRef.current >= waitDuration) {
        phaseRef.current = "vaporize";
        phaseTimerRef.current = 0;
      }

      if (currentPhase === "vaporize") {
        const progress = Math.min(phaseTimerRef.current / vaporizeDuration, 1);
        for (const p of totalParticles) {
          p.x += p.vx * dt * (1 + progress * 3);
          p.y += p.vy * dt * (1 + progress * 3);
          p.alpha = Math.max(0, 1 - progress);
        }
        if (progress >= 1) {
          const nextIdx = (currentIdx + 1) % texts.length;
          textIndexRef.current = nextIdx;
          currentParticles = captureParticles(texts[nextIdx], w, h);
          for (const p of currentParticles) {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha = 0;
          }
          particlesRef.current = currentParticles;
          phaseRef.current = "fadein";
          phaseTimerRef.current = 0;
        }
      }

      if (currentPhase === "fadein") {
        const progress = Math.min(phaseTimerRef.current / fadeInDuration, 1);
        for (const p of totalParticles) {
          const tx = p.originX + p.vx * (1 - progress);
          const ty = p.originY + p.vy * (1 - progress);
          p.x += (tx - p.x) * 0.05;
          p.y += (ty - p.y) * 0.05;
          p.alpha = Math.min(1, progress * 2);
        }
        if (progress >= 1) {
          for (const p of totalParticles) {
            p.x = p.originX;
            p.y = p.originY;
            p.alpha = 1;
          }
          phaseRef.current = "wait";
          phaseTimerRef.current = 0;
        }
      }

      safeCtx.clearRect(0, 0, cssW, cssH);
      for (const p of totalParticles) {
        safeCtx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
        safeCtx.fillStyle = color;
        safeCtx.fillRect(p.x / window.devicePixelRatio, p.y / window.devicePixelRatio, p.size, p.size);
      }

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isVisible, reducedMotion, color, spread, density, vaporizeDuration, fadeInDuration, waitDuration, texts, direction, alignment, fontFamily, fontSize, fontWeight, captureParticles]);

  const currentText = texts[textIndexRef.current] || texts[0];

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: fontSize * 1.5 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      />
      {tag === Tag.H1 ? (
        <h1 className="sr-only" style={{ fontFamily, fontSize: `${fontSize}px`, fontWeight, color }}>{currentText}</h1>
      ) : tag === Tag.H2 ? (
        <h2 className="sr-only" style={{ fontFamily, fontSize: `${fontSize}px`, fontWeight, color }}>{currentText}</h2>
      ) : tag === Tag.H3 ? (
        <h3 className="sr-only" style={{ fontFamily, fontSize: `${fontSize}px`, fontWeight, color }}>{currentText}</h3>
      ) : tag === Tag.P ? (
        <p className="sr-only" style={{ fontFamily, fontSize: `${fontSize}px`, fontWeight, color }}>{currentText}</p>
      ) : (
        <span className="sr-only" style={{ fontFamily, fontSize: `${fontSize}px`, fontWeight, color }}>{currentText}</span>
      )}
    </div>
  );
}
