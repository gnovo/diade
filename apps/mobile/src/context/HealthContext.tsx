import {
  type CalendarEvent,
  sessionMarks,
  setDone,
  type WatchSession,
  type WeightEntry,
} from '@diade/domain';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { getActiveEvents } from '../data/queries';
import { updateRecords } from '../data/repository';
import * as healthConnect from '../health/healthConnect';
import { getSyncMeta, setSyncMeta } from '../storage/sqlite';
import { useAuth } from './AuthContext';

/** Whether the member turned it on in Díade (Health Connect keeps the permissions; this is Díade's own switch). */
const ENABLED_KEY = 'health_enabled';
/** Sessions already used to mark a block, so a day the member unmarks stays unmarked. */
const APPLIED_KEY = 'health_applied_sessions';
const MAX_APPLIED = 300;
/** Sessions this far back can still mark a block: last week's, opened late on a Monday. */
const SESSION_DAYS = 10;
/** Weigh-ins read for the trend: the chart's 8 weeks and the week before them. */
const WEIGHT_DAYS = 63;
const DAY_MS = 24 * 60 * 60 * 1000;

type HealthStatus = 'loading' | 'missing' | 'update' | 'off' | 'on';

interface HealthContextType {
  status: HealthStatus;
  granted: healthConnect.Granted | null;
  stepsToday: number | null;
  weights: WeightEntry[];
  /** Asks Health Connect for the permissions, then reads. False when the member allowed nothing. */
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  addWeight: (kg: number) => Promise<void>;
  openSettings: () => void;
}

const HealthContext = createContext<HealthContextType | undefined>(undefined);

async function readApplied(): Promise<string[]> {
  try {
    const raw = await getSyncMeta(APPLIED_KEY);
    const value = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Marks the blocks the watch sessions fill, as if the member had tapped "Done" on each. */
async function applySessions(userId: string, sessions: WatchSession[]): Promise<void> {
  const applied = await readApplied();
  // Only the member's own blocks: a session on this phone is this member's.
  const events = (await getActiveEvents()).filter((e) => e.creatorId === userId);
  const marks = sessionMarks(events, sessions, new Set(applied));
  if (marks.length === 0) return;
  const byId = new Map<string, CalendarEvent>(events.map((e) => [e.id, e]));
  const workouts = new Map<string, NonNullable<CalendarEvent['workout']>>();
  for (const mark of marks) {
    const event = byId.get(mark.eventId);
    const workout = workouts.get(mark.eventId) ?? event?.workout;
    if (!workout) continue;
    workouts.set(mark.eventId, setDone(workout, new Date(`${mark.day}T12:00:00`), true));
  }
  await updateRecords(
    'events',
    [...workouts].map(([id, workout]) => ({ id, changes: { workout } })),
  );
  const next = [...applied, ...marks.map((m) => m.sessionId)].slice(-MAX_APPLIED);
  await setSyncMeta(APPLIED_KEY, JSON.stringify(next));
}

/**
 * Watch and scale data from Health Connect, on this phone only: nothing here goes to the server except the blocks a
 * session marks done. Reads when the app opens and each time it comes back to the front.
 */
export const HealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, space } = useAuth();
  const [status, setStatus] = useState<HealthStatus>('loading');
  const [granted, setGranted] = useState<healthConnect.Granted | null>(null);
  const [stepsToday, setStepsToday] = useState<number | null>(null);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const reading = useRef(false);

  const userId = user?.id ?? null;
  const read = useCallback(async () => {
    if (reading.current || !userId) return;
    reading.current = true;
    try {
      const now = new Date();
      const allowed = await healthConnect.granted();
      setGranted(allowed);
      const [sessions, steps, weighIns] = await Promise.all([
        allowed.sessions
          ? healthConnect.sessions(new Date(now.getTime() - SESSION_DAYS * DAY_MS), now)
          : Promise.resolve([]),
        allowed.steps ? healthConnect.stepsToday(now) : Promise.resolve(null),
        allowed.weight
          ? healthConnect.weights(new Date(now.getTime() - WEIGHT_DAYS * DAY_MS), now)
          : Promise.resolve([]),
      ]);
      setStepsToday(steps);
      setWeights(weighIns);
      if (sessions.length > 0) await applySessions(userId, sessions);
    } catch (err) {
      // Health Connect can refuse a read (a permission taken away meanwhile); the next one tries again.
      console.warn('[health] read failed', err instanceof Error ? err.message : err);
    } finally {
      reading.current = false;
    }
  }, [userId]);

  const refreshStatus = useCallback(async () => {
    const available = await healthConnect.availability();
    if (available !== 'available') {
      setStatus(available);
      return;
    }
    const enabled = (await getSyncMeta(ENABLED_KEY).catch(() => null)) === 'true';
    setStatus(enabled ? 'on' : 'off');
    if (enabled) await read();
  }, [read]);

  useEffect(() => {
    if (!user || !space) {
      setStatus('loading');
      setGranted(null);
      setStepsToday(null);
      setWeights([]);
      return;
    }
    refreshStatus();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshStatus();
    });
    return () => subscription.remove();
  }, [user, space, refreshStatus]);

  const connect = useCallback(async () => {
    const allowed = await healthConnect.ask();
    setGranted(allowed);
    if (!allowed.sessions && !allowed.steps && !allowed.weight) return false;
    await setSyncMeta(ENABLED_KEY, 'true');
    setStatus('on');
    await read();
    return true;
  }, [read]);

  const disconnect = useCallback(async () => {
    await setSyncMeta(ENABLED_KEY, 'false');
    setStatus('off');
    setStepsToday(null);
    setWeights([]);
  }, []);

  const addWeight = useCallback(
    async (kg: number) => {
      const at = new Date();
      await healthConnect.addWeight(kg, at);
      // Shown straight away, even when a read is already running.
      setWeights((list) => [...list, { at, kg }]);
      await read();
    },
    [read],
  );

  const value = useMemo(
    () => ({
      status,
      granted,
      stepsToday,
      weights,
      connect,
      disconnect,
      addWeight,
      openSettings: healthConnect.openSettings,
    }),
    [status, granted, stepsToday, weights, connect, disconnect, addWeight],
  );
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
};

export function useHealth(): HealthContextType {
  const context = useContext(HealthContext);
  if (!context) throw new Error('useHealth must be used inside HealthProvider');
  return context;
}
