import { db } from '../db';
import { isoDate } from './period';
import { newId } from './id';
import type { WeightEntry } from '../types';

/** Append a new weight reading for today. Replaces (by id) if the user
 *  records twice on the same date — most recent wins so the day's row
 *  doesn't fork. */
export async function addWeight(kg: number, notes?: string): Promise<WeightEntry> {
  const today = isoDate(new Date());
  const existing = await db.weightEntries.where({ date: today }).first();
  const entry: WeightEntry = {
    id: existing?.id ?? newId(),
    date: today,
    kg,
    notes,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await db.weightEntries.put(entry);
  return entry;
}
