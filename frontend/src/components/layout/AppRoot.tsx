import { motion } from 'framer-motion';
import { useUIStore, type PanelId } from '../../store/ui';
import { panelTransition } from '../../motion.config';
import { PanelCarousel } from '../panels/PanelCarousel';

const PANEL_BG: Record<PanelId, string> = {
  landing: '#111827',
  exam: '#0A1628',
  session: '#0F1E2D',
  report: '#0F0F1E',
  trends: '#111827',
  settings: '#111827',
};

export function AppRoot() {
  const activePanel = useUIStore((s) => s.activePanel);

  return (
    <motion.div
      className="h-full w-full"
      animate={{ backgroundColor: PANEL_BG[activePanel] }}
      transition={panelTransition}
    >
      <PanelCarousel />
    </motion.div>
  );
}
