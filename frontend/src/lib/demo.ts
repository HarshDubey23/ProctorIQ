import type { DetectionResult } from '../workers/detection.worker';

type Attention = 'focused' | 'distracted' | 'absent' | 'drowsy' | 'multi';

const SCENARIO: { attention: Attention; duration: number }[] = [
  { attention: 'focused', duration: 5000 },
  { attention: 'distracted', duration: 2500 },
  { attention: 'focused', duration: 4000 },
  { attention: 'drowsy', duration: 2000 },
  { attention: 'focused', duration: 3000 },
  { attention: 'distracted', duration: 1500 },
  { attention: 'multi', duration: 2000 },
  { attention: 'focused', duration: 3500 },
  { attention: 'distracted', duration: 3000 },
  { attention: 'absent', duration: 2500 },
  { attention: 'focused', duration: 5000 },
];

function tick(): number {
  return 80 + Math.random() * 40;
}

function jitter(center: number, range: number): number {
  return center + (Math.random() - 0.5) * range;
}

export function createDemoStream(
  onResult: (result: DetectionResult) => void,
): () => void {
  let running = true;
  let step = 0;
  let elapsed = 0;
  let prevTime = performance.now();

  function frame(now: number): void {
    if (!running) return;
    const dt = now - prevTime;
    prevTime = now;
    elapsed += dt;

    const scene = SCENARIO[step % SCENARIO.length];
    if (elapsed >= scene.duration) {
      step = (step + 1) % SCENARIO.length;
      elapsed = 0;
    }

    const attention = scene.attention;
    const progress = Math.min(1, elapsed / scene.duration);
    const faceCount = attention === 'absent' ? 0 : attention === 'multi' ? 2 : 1;
    const gazeAway = attention === 'distracted';

    const yaw = (() => {
      if (attention === 'distracted') {
        const peak = 0.45 + Math.random() * 0.15;
        return Math.sin(progress * Math.PI) * peak;
      }
      return jitter(0, 0.06);
    })();

    const pitch = jitter(0, 0.05);
    const roll = jitter(0, 0.04);

    let confidence: number;
    switch (attention) {
      case 'focused':
        confidence = jitter(0.88, 0.1);
        break;
      case 'distracted':
        confidence = jitter(0.68, 0.15);
        break;
      case 'absent':
        confidence = jitter(0.9, 0.08);
        break;
      case 'drowsy':
        confidence = jitter(0.75, 0.12);
        break;
      case 'multi':
        confidence = jitter(0.85, 0.1);
        break;
    }
    confidence = Math.max(0.3, Math.min(1, confidence));

    const headPose = { yaw, pitch, roll };
    const ear = {
      left: attention === 'absent' || attention === 'drowsy' ? jitter(0.08, 0.04) : jitter(0.28, 0.06),
      right: attention === 'absent' || attention === 'drowsy' ? jitter(0.08, 0.04) : jitter(0.28, 0.06),
    };

    const result: DetectionResult = {
      attention,
      confidence,
      source: 'rules',
      headPose,
      ear,
      faceCount,
      gazeAway,
      blinkRate: attention === 'focused' ? jitter(15, 4) : attention === 'drowsy' ? jitter(5, 2) : jitter(18, 6),
      timestamp: now,
    };

    onResult(result);

    setTimeout(() => frame(performance.now()), tick());
  }

  setTimeout(() => frame(performance.now()), tick());

  return () => {
    running = false;
  };
}

export function createDemoMediaStream(): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;

  let frameCount = 0;
  const interval = setInterval(() => {
    frameCount++;
    const t = frameCount * 0.05;

    ctx.clearRect(0, 0, 640, 480);

    const grad = ctx.createRadialGradient(320, 240, 0, 320, 240, 300);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 2);

    const pulseY = 4 * Math.sin(t * 0.8);

    ctx.beginPath();
    ctx.ellipse(320, 240 + pulseY, 95, 125, 0, 0, Math.PI * 2);
    ctx.stroke();

    const eyeY = 205 + pulseY;
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(280, eyeY, 3 + Math.sin(t * 3) * 2, 0, Math.PI * 2);
    ctx.arc(360, eyeY, 3 + Math.sin(t * 3 + 1) * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(320, 220 + pulseY);
    ctx.lineTo(320, 252 + pulseY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(320, 278 + pulseY, 28, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#475569';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DEMO MODE — synthetic video', 320, 460);
    ctx.globalAlpha = 1;
  }, 100);

  const stream = canvas.captureStream(10);
  stream.getTracks().forEach((t) =>
    t.addEventListener('ended', () => clearInterval(interval)),
  );

  return stream;
}