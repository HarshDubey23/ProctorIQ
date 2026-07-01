import { useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUIStore, PANEL_ORDER, type PanelId } from '../../store/ui';
import { panelTransition } from '../../motion.config';
import { PanelShell } from './PanelShell';
import { SelfTestPanel } from '../../features/selftest/SelfTestPanel';
import { ExamPanel } from '../../features/exam/ExamPanel';
import { SessionPanel } from '../../features/dashboard/SessionPanel';
import { ReportPanel } from '../../features/report/ReportPanel';
import { TrendsPanel } from '../../features/trends/TrendsPanel';
import { SettingsPanel } from '../../features/settings/SettingsPanel';

interface PanelConfig {
  id: PanelId;
  label: string;
  ghost: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
}

const PANELS: PanelConfig[] = [
  { id: 'landing', label: 'HOME', ghost: 'HOME' },
  { id: 'exam', label: 'EXAM', ghost: 'EXAM' },
  { id: 'session', label: 'LIVE SESSION', ghost: 'LIVE SESSION' },
  { id: 'report', label: 'REPORT', ghost: 'REPORT', ctaLabel: 'DOWNLOAD PDF', onCtaClick: () => {} },
  { id: 'trends', label: 'TRENDS', ghost: 'TRENDS', ctaLabel: 'NEW SESSION', onCtaClick: () => {} },
  { id: 'settings', label: 'SETTINGS', ghost: 'SETTINGS' },
];

function getPanelTarget(diff: number) {
  if (diff === 0) {
    return {
      left: '0%',
      scale: 1,
      opacity: 1,
      filter: 'blur(0px)',
      zIndex: 20,
      pointerEvents: 'auto' as const,
    };
  }
  if (diff === -1) {
    return {
      left: '15%',
      scale: 0.88,
      opacity: 0.55,
      filter: 'blur(2px)',
      zIndex: 10,
      pointerEvents: 'none' as const,
    };
  }
  if (diff === 1) {
    return {
      left: '75%',
      scale: 0.88,
      opacity: 0.55,
      filter: 'blur(2px)',
      zIndex: 10,
      pointerEvents: 'none' as const,
    };
  }
  if (diff === -2) {
    return {
      left: '25%',
      scale: 0.78,
      opacity: 0.35,
      filter: 'blur(4px)',
      zIndex: 5,
      pointerEvents: 'none' as const,
    };
  }
  if (diff === 2) {
    return {
      left: '50%',
      scale: 0.78,
      opacity: 0.35,
      filter: 'blur(4px)',
      zIndex: 5,
      pointerEvents: 'none' as const,
    };
  }
  if (diff < -2) {
    return {
      left: '-50%',
      scale: 0.7,
      opacity: 0,
      filter: 'blur(6px)',
      zIndex: 1,
      pointerEvents: 'none' as const,
    };
  }
  return {
    left: '100%',
    scale: 0.7,
    opacity: 0,
    filter: 'blur(6px)',
    zIndex: 1,
    pointerEvents: 'none' as const,
  };
}

export function PanelCarousel() {
  const activePanel = useUIStore((s) => s.activePanel);
  const nextPanel = useUIStore((s) => s.nextPanel);
  const prevPanel = useUIStore((s) => s.prevPanel);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndex = PANEL_ORDER.indexOf(activePanel);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevPanel();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextPanel();
      }
    },
    [prevPanel, nextPanel],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      tabIndex={0}
      role="region"
      aria-label="Panel carousel"
      aria-roledescription="carousel"
    >
      {PANELS.map((panel, index) => {
        const diff = index - activeIndex;
        const target = getPanelTarget(diff);
        const isActive = diff === 0;

        return (
          <motion.div
            key={panel.id}
            className="absolute inset-0"
            animate={target}
            transition={panelTransition}
            initial={false}
            role="group"
            aria-roledescription="slide"
            aria-label={`${panel.label} panel`}
            aria-hidden={!isActive}
            tabIndex={isActive ? 0 : -1}
          >
            <PanelShell
              ghostLabel={panel.ghost}
              isActive={isActive}
              ctaLabel={isActive ? panel.ctaLabel : undefined}
              onCtaClick={isActive ? panel.onCtaClick : undefined}
            >
              {panel.id === 'landing' && isActive ? (
                <SelfTestPanel />
              ) : panel.id === 'exam' && isActive ? (
                <ExamPanel />
              ) : panel.id === 'session' && isActive ? (
                <SessionPanel />
              ) : panel.id === 'report' && isActive ? (
                <ReportPanel />
              ) : panel.id === 'trends' && isActive ? (
                <TrendsPanel />
              ) : panel.id === 'settings' && isActive ? (
                <SettingsPanel />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="font-display text-xl uppercase tracking-[0.15em] text-text-secondary">
                    {panel.label}
                  </span>
                </div>
              )}
            </PanelShell>
          </motion.div>
        );
      })}

      <button
        className="absolute left-6 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/5 p-3 text-text-secondary backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
        onClick={prevPanel}
        aria-label="Previous panel"
      >
        <ChevronLeft size={22} />
      </button>

      <button
        className="absolute right-6 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/5 p-3 text-text-secondary backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
        onClick={nextPanel}
        aria-label="Next panel"
      >
        <ChevronRight size={22} />
      </button>

      <nav
        className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-3"
        aria-label="Panel navigation"
      >
        {PANELS.map((panel, index) => {
          const isDotActive = index === activeIndex;
          return (
            <button
              key={panel.id}
              className={`h-2 rounded-full transition-all duration-300 ${
                isDotActive
                  ? 'w-8 bg-[--signal-focus]'
                  : 'w-2 bg-white/20 hover:bg-white/40'
              }`}
              onClick={() => setActivePanel(panel.id)}
              aria-label={`Go to ${panel.label} panel`}
              aria-current={isDotActive ? 'true' : undefined}
            />
          );
        })}
      </nav>
    </div>
  );
}