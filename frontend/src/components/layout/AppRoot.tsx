import { PanelCarousel } from '../panels/PanelCarousel';

export function AppRoot() {
  return (
    <div className="h-full w-full" style={{ backgroundColor: 'var(--surface-0)' }}>
      <PanelCarousel />
    </div>
  );
}
