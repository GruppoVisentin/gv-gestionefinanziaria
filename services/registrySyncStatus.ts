import { useSyncExternalStore } from 'react';

let lastSyncAt: Date | null = null;
const listeners = new Set<() => void>();

export function reportRegistrySync(): void {
  lastSyncAt = new Date();
  listeners.forEach(l => l());
}

function getSnapshot(): Date | null {
  return lastSyncAt;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLastRegistrySync(): Date | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
