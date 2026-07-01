import { openDB, type IDBPDatabase } from 'idb';

export interface StoredEvent {
  eventType: string;
  timestampS: number;
  confidence: number | null;
  details: Record<string, unknown> | null;
}

export interface StoredBenchmark {
  modelLatencyMs: number;
  inferenceCount: number;
  pcaLatencyMs: number;
}

export interface StoredSession {
  id: string;
  start: number;
  end: number | null;
  mode: string;
  finalScore: number | null;
  pctFocused: number | null;
  verdict: string | null;
  events: StoredEvent[];
  benchmark: StoredBenchmark | null;
}

interface ProctorIQDB {
  sessions: {
    key: string;
    value: StoredSession;
    indexes: { 'by-start': number };
  };
  benchmarks: {
    key: number;
    value: StoredBenchmark;
  };
}

let dbPromise: Promise<IDBPDatabase<ProctorIQDB>> | null = null;

function getDB(): Promise<IDBPDatabase<ProctorIQDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ProctorIQDB>('proctoriq', 1, {
      upgrade(db) {
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionStore.createIndex('by-start', 'start');
        db.createObjectStore('benchmarks', { keyPath: 'id', autoIncrement: true });
      },
    });
  }
  return dbPromise;
}

export async function saveSession(session: StoredSession): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function getSession(id: string): Promise<StoredSession | undefined> {
  const db = await getDB();
  return db.get('sessions', id);
}

export async function listSessions(): Promise<StoredSession[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex('sessions', 'by-start');
  return sessions.reverse();
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sessions', id);
}

export async function saveBenchmark(benchmark: StoredBenchmark): Promise<IDBValidKey> {
  const db = await getDB();
  return db.add('benchmarks', benchmark);
}

export async function getBenchmarks(): Promise<StoredBenchmark[]> {
  const db = await getDB();
  return db.getAll('benchmarks');
}
