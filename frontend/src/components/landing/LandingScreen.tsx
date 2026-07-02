import { ApertureGauge } from '../ui/ApertureGauge';
import { BentoGrid } from '../ui/BentoGrid';
import { BentoCard } from '../ui/BentoCard';
import { useUIStore } from '../../store/ui';
import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, Eye, Shield, Users, Zap, Radio } from 'lucide-react';

function LiveGaugePreview() {
  return (
    <ApertureGauge openness={0.85} size={80}>
      <div
        className="flex items-center justify-center"
        style={{
          width: 80,
          height: 80,
          backgroundColor: 'var(--surface-2)',
        }}
      >
        <Eye size={24} style={{ color: 'var(--ink-muted)' }} />
      </div>
    </ApertureGauge>
  );
}

export function LandingScreen() {
  const setActivePanel = useUIStore((s) => s.setActivePanel);

  const goToExam = useCallback(() => setActivePanel('exam'), [setActivePanel]);
  const goToSession = useCallback(() => setActivePanel('session'), [setActivePanel]);

  const cards = useMemo(() => [
    {
      title: 'Live Gaze Tracking',
      description: 'Real-time head pose and eye aspect ratio estimates via MediaPipe. See your attention state reflected in the aperture.',
      colSpan: 2 as const,
      rowSpan: 1 as const,
      children: <LiveGaugePreview />,
    },
    {
      title: 'Privacy First',
      description: 'All inference runs locally in a web worker. No frames leave the device. Your biometric data stays yours.',
      colSpan: 1 as const,
      rowSpan: 1 as const,
      children: <Shield size={20} style={{ color: 'var(--jade)' }} />,
    },
    {
      title: 'Cobalt Integrity',
      description: 'Every session is anchored by a rolling SHA-256 hash chain. Tamper-evident logs you can verify offline.',
      colSpan: 1 as const,
      rowSpan: 1 as const,
    },
    {
      title: 'Cohorts & Rooms',
      description: 'Join a cohort room to share live state (score, attention, flags) with an invigilator — no video stream required.',
      colSpan: 1 as const,
      rowSpan: 2 as const,
      children: (
        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--cobalt)' }}>
          <Users size={14} />
          ROOM: ABCD12 &middot; 3 CONNECTED
        </div>
      ),
    },
    {
      title: 'Blink Rate & Fatigue',
      description: 'Monitor blink frequency over minutes to detect microsleep risk before it affects performance.',
      colSpan: 1 as const,
      rowSpan: 1 as const,
      children: <Activity size={20} style={{ color: 'var(--ochre)' }} />,
    },
    {
      title: 'Sub-second Latency',
      description: 'End-to-end under 40 ms on modern hardware. No cloud round-trip, no queue, no delay.',
      colSpan: 1 as const,
      rowSpan: 1 as const,
      children: <Zap size={20} style={{ color: 'var(--signal-focus)' }} />,
    },
  ], []);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 px-6 py-8 overflow-y-auto">
      <div className="flex flex-col items-center gap-1" style={{ maxWidth: 520 }}>
        <h1 className="font-display text-4xl uppercase tracking-[0.05em] text-center" style={{ color: 'var(--ink)' }}>
          Proctoring,<br />Reimagined
        </h1>
        <p className="font-sans text-sm text-center leading-relaxed" style={{ color: 'var(--ink-muted)', maxWidth: 400 }}>
          Real-time attention analytics that respect privacy. Everything runs in your browser.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 640 }}>
        <BentoGrid>
          {cards.map((card) => (
            <BentoCard
              key={card.title}
              title={card.title}
              description={card.description}
              colSpan={card.colSpan}
              rowSpan={card.rowSpan}
            >
              {card.children}
            </BentoCard>
          ))}
        </BentoGrid>
      </div>

      <div className="flex items-center justify-center gap-4">
        <motion.button
          onClick={goToExam}
          className="rounded-xl px-8 py-3 font-display text-[15px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: 'rgba(14,107,92,0.12)',
            color: 'var(--jade)',
            border: '1px solid rgba(14,107,92,0.25)',
          }}
          whileHover={{ backgroundColor: 'rgba(14,107,92,0.2)' }}
          whileTap={{ scale: 0.96 }}
        >
          Start Exam
        </motion.button>
        <motion.button
          onClick={goToSession}
          className="rounded-xl px-8 py-3 font-display text-[15px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: 'rgba(46,76,140,0.1)',
            color: 'var(--ink-muted)',
            border: '1px solid var(--hairline)',
          }}
          whileHover={{ backgroundColor: 'rgba(46,76,140,0.2)', color: 'var(--ink)' }}
          whileTap={{ scale: 0.96 }}
        >
          Self-Test
        </motion.button>
        <motion.button
          onClick={() => { window.location.href = '/host'; }}
          className="rounded-xl px-8 py-3 font-display text-[15px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: 'rgba(107,81,120,0.12)',
            color: 'var(--plum)',
            border: '1px solid rgba(107,81,120,0.25)',
          }}
          whileHover={{ backgroundColor: 'rgba(107,81,120,0.2)' }}
          whileTap={{ scale: 0.96 }}
        >
          <Radio size={14} className="mr-1.5" />
          Host Exam
        </motion.button>
      </div>
    </div>
  );
}
