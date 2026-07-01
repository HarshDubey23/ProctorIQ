import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/globals.css';
import { AppRoot } from './components/layout/AppRoot';
import { CohortDashboard } from './features/cohort/CohortDashboard';

function getCohortIdFromPath(): string | null {
  const m = window.location.pathname.match(/^\/cohort\/([A-Z0-9]{6})$/i);
  return m ? m[1].toUpperCase() : null;
}

function Root() {
  const cohortId = getCohortIdFromPath();
  if (cohortId) {
    return <CohortDashboard roomId={cohortId} />;
  }
  return <AppRoot />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
