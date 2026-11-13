/**
 * The only file that talks to Health Connect (docs/plans/health, H6). It turns records into the plain values the
 * domain works with, so the rest of the app never sees the library's types.
 */

import type { WatchSession, WeightEntry } from '@diade/domain';
import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  openHealthConnectSettings,
  type Permission,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

/** What Díade reads, and the weight it writes when a weigh-in is typed. */
const PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'write', recordType: 'Weight' },
];

/** `missing`: not on this phone; `update`: installed but too old to use. */
export type Availability = 'available' | 'missing' | 'update';

export async function availability(): Promise<Availability> {
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update';
    return 'missing';
  } catch {
    return 'missing';
  }
}

export interface Granted {
  sessions: boolean;
  steps: boolean;
  weight: boolean;
  writeWeight: boolean;
}

const NONE: Granted = { sessions: false, steps: false, weight: false, writeWeight: false };

function toGranted(list: ReadonlyArray<{ accessType: string; recordType: string }>): Granted {
  const has = (accessType: string, recordType: string) =>
    list.some((p) => p.accessType === accessType && p.recordType === recordType);
  return {
    sessions: has('read', 'ExerciseSession'),
    steps: has('read', 'Steps'),
    weight: has('read', 'Weight'),
    writeWeight: has('write', 'Weight'),
  };
}

let ready: Promise<boolean> | null = null;
const init = () => {
  ready ??= initialize().catch(() => {
    ready = null;
    return false;
  });
  return ready;
};

/** What the member has allowed, without asking. */
export async function granted(): Promise<Granted> {
  if (!(await init())) return NONE;
  try {
    return toGranted(await getGrantedPermissions());
  } catch {
    return NONE;
  }
}

/** Shows Health Connect's own permission screen; the member picks what to allow there. */
export async function ask(): Promise<Granted> {
  if (!(await init())) return NONE;
  return toGranted(await requestPermission(PERMISSIONS));
}

export const openSettings = () => openHealthConnectSettings();

const between = (from: Date, to: Date) => ({
  operator: 'between' as const,
  startTime: from.toISOString(),
  endTime: to.toISOString(),
});

async function readAll<T extends 'ExerciseSession' | 'Weight'>(
  recordType: T,
  from: Date,
  to: Date,
) {
  const records = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(recordType, { timeRangeFilter: between(from, to), pageToken });
    records.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return records;
}

export async function sessions(from: Date, to: Date): Promise<WatchSession[]> {
  const records = await readAll('ExerciseSession', from, to);
  return records.flatMap((r) =>
    r.metadata?.id
      ? [
          {
            id: r.metadata.id,
            exerciseType: r.exerciseType,
            startAt: new Date(r.startTime),
            endAt: new Date(r.endTime),
          },
        ]
      : [],
  );
}

/** Steps since midnight. Health Connect merges the watch and the phone, so nothing is counted twice. */
export async function stepsToday(now: Date): Promise<number> {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const result = await aggregateRecord({
    recordType: 'Steps',
    timeRangeFilter: between(midnight, now),
  });
  return result.COUNT_TOTAL;
}

export async function weights(from: Date, to: Date): Promise<WeightEntry[]> {
  const records = await readAll('Weight', from, to);
  return records.map((r) => ({ at: new Date(r.time), kg: r.weight.inKilograms }));
}

/** Writes a typed weigh-in to Health Connect, so the scale's and the typed ones live in one place. */
export async function addWeight(kg: number, at: Date): Promise<void> {
  await insertRecords([
    {
      recordType: 'Weight',
      time: at.toISOString(),
      weight: { value: kg, unit: 'kilograms' },
      // Manual entry (RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY).
      metadata: { recordingMethod: 3 },
    },
  ]);
}
