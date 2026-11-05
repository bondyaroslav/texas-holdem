import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  handAnalysisSchema,
  handRecordSchema,
  type HandAnalysis,
  type HandHistoryRepository,
  type HandRecord,
} from '@poker/protocol';
import { logger } from '@/shared';

const DB_VERSION = 1;
const LEGACY_STORAGE_KEY = 'texas-holdem:hand-history';
const MIGRATION_FLAG = 'legacyLocalStorageMigrated';
export const DEFAULT_MAX_HANDS = 1_000;

interface HandHistoryDb extends DBSchema {
  hands: { key: string; value: unknown; indexes: { 'by-ended-at': number } };
  analyses: { key: string; value: unknown };
  meta: { key: string; value: unknown };
}

export interface IndexedDbHandHistoryOptions {
  readonly dbName?: string;
  /** Oldest hands (and their analyses) are evicted beyond this many; a function is re-read on every save. */
  readonly maxHands?: number | (() => number);
}

/**
 * IndexedDB-backed `HandHistoryRepository`. Rows are validated with Zod on
 * the way out; one that no longer parses is skipped (and logged) instead of
 * failing the whole read. On first open, a hand history left in localStorage
 * by an older build is moved over.
 */
export class IndexedDbHandHistoryRepository implements HandHistoryRepository {
  private readonly dbName: string;
  private readonly maxHands: () => number;
  private dbPromise: Promise<IDBPDatabase<HandHistoryDb>> | null = null;

  constructor(options: IndexedDbHandHistoryOptions = {}) {
    this.dbName = options.dbName ?? 'texas-holdem';
    const limit = options.maxHands ?? DEFAULT_MAX_HANDS;
    this.maxHands = () => Math.max(1, typeof limit === 'function' ? limit() : limit);
  }

  async saveHand(record: HandRecord): Promise<void> {
    const db = await this.open();
    await db.put('hands', record);
    await this.evictBeyondLimit(db);
  }

  async getHand(id: string): Promise<HandRecord | null> {
    const db = await this.open();
    return parseHand(await db.get('hands', id));
  }

  async listHands(options: { readonly limit?: number } = {}): Promise<readonly HandRecord[]> {
    const db = await this.open();
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    const records: HandRecord[] = [];
    let cursor = await db.transaction('hands').store.index('by-ended-at').openCursor(null, 'prev');
    while (cursor && records.length < limit) {
      const record = parseHand(cursor.value);
      if (record) {
        records.push(record);
      }
      cursor = await cursor.continue();
    }
    return records;
  }

  async deleteHand(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(['hands', 'analyses'], 'readwrite');
    await Promise.all([
      tx.objectStore('hands').delete(id),
      tx.objectStore('analyses').delete(id),
      tx.done,
    ]);
  }

  async clear(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(['hands', 'analyses'], 'readwrite');
    await Promise.all([
      tx.objectStore('hands').clear(),
      tx.objectStore('analyses').clear(),
      tx.done,
    ]);
  }

  async saveAnalysis(analysis: HandAnalysis): Promise<void> {
    const db = await this.open();
    // An analysis for a hand that was evicted meanwhile would be orphaned forever.
    const tx = db.transaction(['hands', 'analyses'], 'readwrite');
    const exists = (await tx.objectStore('hands').count(analysis.handId)) > 0;
    if (exists) {
      await tx.objectStore('analyses').put(analysis, analysis.handId);
    }
    await tx.done;
  }

  async getAnalysis(handId: string): Promise<HandAnalysis | null> {
    const db = await this.open();
    return parseAnalysis(await db.get('analyses', handId));
  }

  async listHandsNeedingAnalysis(analysisVersion: number): Promise<readonly HandRecord[]> {
    const hands = await this.listHands();
    const outdated: HandRecord[] = [];
    for (const record of hands) {
      const analysis = await this.getAnalysis(record.id);
      if (analysis?.analysisVersion !== analysisVersion) {
        outdated.push(record);
      }
    }
    return outdated;
  }

  private open(): Promise<IDBPDatabase<HandHistoryDb>> {
    this.dbPromise ??= this.openAndMigrate().catch((error: unknown) => {
      // Let the next call retry instead of caching a failed open forever.
      this.dbPromise = null;
      throw error;
    });
    return this.dbPromise;
  }

  private async openAndMigrate(): Promise<IDBPDatabase<HandHistoryDb>> {
    const db = await openDB<HandHistoryDb>(this.dbName, DB_VERSION, {
      upgrade(upgradeDb) {
        const hands = upgradeDb.createObjectStore('hands', { keyPath: 'id' });
        hands.createIndex('by-ended-at', 'endedAt');
        // Analyses are keyed by hand id, which is also a field of the value, but kept out-of-line
        // so the key never has to be duplicated into a nested path.
        upgradeDb.createObjectStore('analyses');
        upgradeDb.createObjectStore('meta');
      },
    });
    await this.migrateFromLocalStorage(db);
    return db;
  }

  /** One-time import of `HandRecord[]` JSON an older build kept in localStorage. */
  private async migrateFromLocalStorage(db: IDBPDatabase<HandHistoryDb>): Promise<void> {
    if (await db.get('meta', MIGRATION_FLAG)) {
      return;
    }

    let raw: string | null;
    try {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      logger.warn('Cannot read legacy hand history from localStorage', { error });
      return;
    }

    if (raw !== null) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch (error) {
        // Keep the data: it may be recoverable by hand, and deleting it would be irreversible.
        logger.warn('Legacy hand history is not valid JSON — leaving it in localStorage', {
          error,
        });
        return;
      }

      const entries: unknown[] = Array.isArray(parsedJson) ? parsedJson : [];
      const tx = db.transaction('hands', 'readwrite');
      let imported = 0;
      for (const entry of entries) {
        const parsed = handRecordSchema.safeParse(entry);
        if (parsed.success) {
          await tx.store.put(parsed.data);
          imported++;
        }
      }
      await tx.done;
      logger.info('Migrated legacy hand history to IndexedDB', {
        imported,
        skipped: entries.length - imported,
      });
      await this.evictBeyondLimit(db);

      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch (error) {
        logger.warn('Failed to remove migrated hand history from localStorage', { error });
      }
    }

    await db.put('meta', true, MIGRATION_FLAG);
  }

  private async evictBeyondLimit(db: IDBPDatabase<HandHistoryDb>): Promise<void> {
    const tx = db.transaction(['hands', 'analyses'], 'readwrite');
    let excess = (await tx.objectStore('hands').count()) - this.maxHands();
    let cursor =
      excess > 0 ? await tx.objectStore('hands').index('by-ended-at').openCursor() : null;
    while (cursor && excess > 0) {
      const id = cursor.primaryKey;
      await Promise.all([cursor.delete(), tx.objectStore('analyses').delete(id)]);
      excess--;
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

function parseHand(value: unknown): HandRecord | null {
  if (value === undefined) {
    return null;
  }
  const result = handRecordSchema.safeParse(value);
  if (!result.success) {
    logger.warn('Stored hand record failed validation — skipping it', {
      issues: result.error.issues,
    });
    return null;
  }
  return result.data;
}

function parseAnalysis(value: unknown): HandAnalysis | null {
  if (value === undefined) {
    return null;
  }
  const result = handAnalysisSchema.safeParse(value);
  if (!result.success) {
    logger.warn('Stored hand analysis failed validation — skipping it', {
      issues: result.error.issues,
    });
    return null;
  }
  return result.data;
}
