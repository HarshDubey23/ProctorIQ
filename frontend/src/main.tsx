import { StrictMode, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/globals.css';
import { AppRoot } from './components/layout/AppRoot';
import { CohortDashboard } from './features/cohort/CohortDashboard';
import { HostExamCreate } from './features/host-exam/HostExamCreate';
import { HostExamShare } from './features/host-exam/HostExamShare';
import { HostDashboard } from './features/host-exam/HostDashboard';
import { JoinExam } from './features/exam/JoinExam';
import { Styleguide } from './components/styleguide/Styleguide';
import { ModelTrainingPage } from './features/model/ModelTrainingPage';
import { PaperBuilderPage } from './features/builder/PaperBuilderPage';

function getCohortIdFromPath(): string | null {
  const m = window.location.pathname.match(/^\/cohort\/([A-Z0-9]{6})$/i);
  return m ? m[1].toUpperCase() : null;
}

function getJoinRoomIdFromPath(): string | null {
  const m = window.location.pathname.match(/^\/join\/([A-Z0-9]{6})$/i);
  return m ? m[1].toUpperCase() : null;
}

function getHostRoomIdFromPath(): string | null {
  const m = window.location.pathname.match(/^\/host\/([A-Z0-9]{6})$/i);
  return m ? m[1].toUpperCase() : null;
}

type HostStep = 'create' | 'share' | 'dashboard';

function HostFlow() {
  const roomIdFromPath = getHostRoomIdFromPath();
  const [step, setStep] = useState<HostStep>(roomIdFromPath ? 'dashboard' : 'create');
  const [roomData, setRoomData] = useState<{ room_id: string; host_token: string; join_url: string } | null>(null);

  const handleCreated = useCallback((data: { room_id: string; host_token: string; join_url: string }) => {
    setRoomData(data);
    window.history.replaceState(null, '', `/host/${data.room_id}`);
    setStep('share');
  }, []);

  const handleGoToDashboard = useCallback(() => {
    setStep('dashboard');
  }, []);

  if (step === 'create' || step === 'share') {
    return (
      <div className="h-full w-full" style={{ backgroundColor: 'var(--surface-0)' }}>
        {step === 'create' ? (
          <HostExamCreate onCreated={handleCreated} />
        ) : roomData ? (
          <HostExamShare
            roomId={roomData.room_id}
            joinUrl={roomData.join_url}
            onGoToDashboard={handleGoToDashboard}
          />
        ) : null}
      </div>
    );
  }

  const rid = roomData?.room_id ?? roomIdFromPath ?? '';
  return <HostDashboard roomId={rid} />;
}

function Root() {
  const cohortId = getCohortIdFromPath();
  const joinRoomId = getJoinRoomIdFromPath();
  const hostPath = getHostRoomIdFromPath();

  if (window.location.pathname.match(/^\/styleguide$/i)) {
    return <Styleguide />;
  }

  if (window.location.pathname.match(/^\/model$/i)) {
    return <ModelTrainingPage />;
  }

  if (window.location.pathname.match(/^\/builder$/i)) {
    return <PaperBuilderPage />;
  }

  if (cohortId) {
    return <CohortDashboard roomId={cohortId} />;
  }

  if (joinRoomId) {
    return <JoinExam roomId={joinRoomId} />;
  }

  if (hostPath !== null) {
    return <HostFlow />;
  }

  const m = window.location.pathname.match(/^\/host$/i);
  if (m) {
    return <HostFlow />;
  }

  return <AppRoot />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
