import { useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useUIStore, PANEL_ORDER, type PanelId } from "../../store/ui";
import { panelTransition } from "../../motion.config";
import { PanelShell } from "./PanelShell";
import { LandingScreen } from "../landing/LandingScreen";

const ExamPanel = lazy(() => import("../../features/exam/ExamPanel").then(m => ({ default: m.ExamPanel })));
const SessionPanel = lazy(() => import("../../features/dashboard/SessionPanel").then(m => ({ default: m.SessionPanel })));
const ReportPanel = lazy(() => import("../../features/report/ReportPanel").then(m => ({ default: m.ReportPanel })));
const TrendsPanel = lazy(() => import("../../features/trends/TrendsPanel").then(m => ({ default: m.TrendsPanel })));
const SettingsPanel = lazy(() => import("../../features/settings/SettingsPanel").then(m => ({ default: m.SettingsPanel })));

function PanelSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-paper">
      <div className="flex flex-col items-center gap-3">
        <span className="font-mono text-sm text-graphite animate-pulse">LOADING&hellip;</span>
      </div>
    </div>
  );
}

interface PanelConfig {
  id: PanelId;
  label: string;
  ghost: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
}

const PANELS: PanelConfig[] = [
  { id: "landing", label: "HOME", ghost: "HOME" },
  { id: "exam", label: "EXAM", ghost: "EXAM" },
  { id: "session", label: "LIVE SESSION", ghost: "LIVE SESSION" },
  { id: "report", label: "REPORT", ghost: "REPORT", ctaLabel: "DOWNLOAD PDF", onCtaClick: () => {} },
  { id: "trends", label: "TRENDS", ghost: "TRENDS", ctaLabel: "NEW SESSION", onCtaClick: () => {} },
  { id: "settings", label: "SETTINGS", ghost: "SETTINGS" },
];

function getPanelTarget(diff: number) {
  if (diff === 0) {
    return { left: "0%", scale: 1, opacity: 1, zIndex: 20, pointerEvents: "auto" as const };
  }
  if (diff === -1) {
    return { left: "12%", scale: 0.92, opacity: 0.5, zIndex: 10, pointerEvents: "none" as const };
  }
  if (diff === 1) {
    return { left: "76%", scale: 0.92, opacity: 0.5, zIndex: 10, pointerEvents: "none" as const };
  }
  if (diff === -2) {
    return { left: "22%", scale: 0.85, opacity: 0.25, zIndex: 5, pointerEvents: "none" as const };
  }
  if (diff === 2) {
    return { left: "54%", scale: 0.85, opacity: 0.25, zIndex: 5, pointerEvents: "none" as const };
  }
  if (diff < -2) {
    return { left: "-50%", scale: 0.8, opacity: 0, zIndex: 1, pointerEvents: "none" as const };
  }
  return { left: "100%", scale: 0.8, opacity: 0, zIndex: 1, pointerEvents: "none" as const };
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
      if (e.key === "ArrowLeft") { e.preventDefault(); prevPanel(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nextPanel(); }
    },
    [prevPanel, nextPanel],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-paper"
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
              {panel.id === "landing" && isActive ? (
                <LandingScreen />
              ) : panel.id === "exam" && isActive ? (
                <Suspense fallback={<PanelSkeleton />}><ExamPanel /></Suspense>
              ) : panel.id === "session" && isActive ? (
                <Suspense fallback={<PanelSkeleton />}><SessionPanel /></Suspense>
              ) : panel.id === "report" && isActive ? (
                <Suspense fallback={<PanelSkeleton />}><ReportPanel /></Suspense>
              ) : panel.id === "trends" && isActive ? (
                <Suspense fallback={<PanelSkeleton />}><TrendsPanel /></Suspense>
              ) : panel.id === "settings" && isActive ? (
                <Suspense fallback={<PanelSkeleton />}><SettingsPanel /></Suspense>
              ) : (
                <div className="flex h-full items-center justify-center bg-paper">
                  <span className="font-display text-xl uppercase text-graphite">{panel.label}</span>
                </div>
              )}
            </PanelShell>
          </motion.div>
        );
      })}

      {/* Brutalist nav arrows */}
      <button
        className="absolute left-4 top-1/2 z-30 -translate-y-1/2 border-[3px] border-ink bg-paper p-3 text-ink shadow-brutal-sm hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 transition-[transform,box-shadow] duration-[60ms] linear"
        onClick={prevPanel}
        aria-label="Previous panel"
      >
        <ChevronLeft size={22} />
      </button>

      <button
        className="absolute right-4 top-1/2 z-30 -translate-y-1/2 border-[3px] border-ink bg-paper p-3 text-ink shadow-brutal-sm hover:translate-x-0.5 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 transition-[transform,box-shadow] duration-[60ms] linear"
        onClick={nextPanel}
        aria-label="Next panel"
      >
        <ChevronRight size={22} />
      </button>

      {/* Brutalist dot nav */}
      <nav className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-3" aria-label="Panel navigation">
        {PANELS.map((panel, index) => {
          const isDotActive = index === activeIndex;
          return (
            <button
              key={panel.id}
              className={`border-[2px] border-ink transition-all duration-100 ${
                isDotActive ? "w-8 bg-stamp" : "w-3 bg-paper-2 hover:bg-graphite"
              } h-3`}
              onClick={() => setActivePanel(panel.id)}
              aria-label={`Go to ${panel.label} panel`}
              aria-current={isDotActive ? "true" : undefined}
            />
          );
        })}
      </nav>
    </div>
  );
}
