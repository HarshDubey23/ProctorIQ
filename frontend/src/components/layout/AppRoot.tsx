import { useEffect } from 'react';
import { PanelCarousel } from '../panels/PanelCarousel';
import { useUIStore } from '../../store/ui';

export function AppRoot() {
  const setActivePanel = useUIStore((s) => s.setActivePanel);

  useEffect(() => {
    if (sessionStorage.getItem('exam_room_id')) {
      setActivePanel('exam');
    }
  }, [setActivePanel]);

  return (
    <div className="h-full w-full" style={{ backgroundColor: 'var(--surface-0)' }}>
      <PanelCarousel />
    </div>
  );
}
