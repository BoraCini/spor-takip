// Her testte temiz bir IndexedDB ve modül önbelleği
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  try {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  } catch {}
});
