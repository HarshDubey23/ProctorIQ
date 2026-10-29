import { useState } from 'react';
import { COLLECTION_TASKS } from './tasks';
import { ConsentScreen } from './ConsentScreen';
import { TaskRunner } from './TaskRunner';
import { ThankYouScreen } from './ThankYouScreen';
import { CollectionFullScreen } from './CollectionFullScreen';
import { API_BASE } from '../../lib/api';

function getContributorId(): string {
  const key = 'proctoriq_contributor_id';
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}

export default function CollectPage() {
  const [consented, setConsented] = useState(false);
  const [taskIndex, setTaskIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [full, setFull] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const contributorId = getContributorId();

  // A failed task stays on screen and its recorder restarts, instead of silently moving on.
  const fail = (message: string) => {
    setError(message);
    setAttempt((a) => a + 1);
  };

  async function handleClipRecorded(landmarks: number[][], durationS: number) {
    const task = COLLECTION_TASKS[taskIndex];
    setError('');
    if (landmarks.length < 30) {
      fail("We couldn't see your face clearly during that task. Check your lighting and camera, then try again.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/collect/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributor_id: contributorId,
          task_id: task.id,
          label: task.label,
          landmarks,
          duration_s: durationS,
        }),
      });
      if (res.status === 423) { setFull(true); return; }
      // 409 = this clip or contributor is already recorded, which is fine to skip past.
      if (!res.ok && res.status !== 409) {
        const body = await res.json().catch(() => null);
        fail(body?.detail ?? `Upload failed (HTTP ${res.status}). Please try this task again.`);
        return;
      }
    } catch {
      fail("Couldn't reach the server. Check your connection and try this task again.");
      return;
    }
    if (taskIndex + 1 >= COLLECTION_TASKS.length) setDone(true);
    else setTaskIndex((i) => i + 1);
  }

  if (full) return <CollectionFullScreen />;
  if (!consented) return <ConsentScreen onAccept={() => setConsented(true)} />;
  if (done) return <ThankYouScreen />;
  return (
    <>
      {error && (
        <div role="alert" className="fixed top-4 left-1/2 z-50 max-w-md -translate-x-1/2 border-[3px] border-stamp bg-paper px-4 py-3 font-body text-sm text-stamp">
          {error}
        </div>
      )}
      <TaskRunner
        key={`${taskIndex}-${attempt}`}
        task={COLLECTION_TASKS[taskIndex]}
        progress={`${taskIndex + 1} / ${COLLECTION_TASKS.length}`}
        onClipRecorded={handleClipRecorded}
      />
    </>
  );
}
