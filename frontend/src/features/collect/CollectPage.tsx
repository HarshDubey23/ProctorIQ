import { useState } from 'react';
import { COLLECTION_TASKS } from './tasks';
import { ConsentScreen } from './ConsentScreen';
import { TaskRunner } from './TaskRunner';
import { ThankYouScreen } from './ThankYouScreen';
import { CollectionFullScreen } from './CollectionFullScreen';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

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
  const contributorId = getContributorId();

  async function handleClipRecorded(landmarks: number[][], durationS: number) {
    const task = COLLECTION_TASKS[taskIndex];
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
      if (taskIndex + 1 >= COLLECTION_TASKS.length) setDone(true);
      else setTaskIndex((i) => i + 1);
    } catch {
      if (taskIndex + 1 >= COLLECTION_TASKS.length) setDone(true);
      else setTaskIndex((i) => i + 1);
    }
  }

  if (full) return <CollectionFullScreen />;
  if (!consented) return <ConsentScreen onAccept={() => setConsented(true)} />;
  if (done) return <ThankYouScreen />;
  return (
    <TaskRunner
      task={COLLECTION_TASKS[taskIndex]}
      progress={`${taskIndex + 1} / ${COLLECTION_TASKS.length}`}
      onClipRecorded={handleClipRecorded}
    />
  );
}
