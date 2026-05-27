import { BackupData } from '../types';

/**
 * IndexedDB utility to store and retrieve the FileSystemFileHandle
 */
const DB_NAME = 'GVCashFlowDB';
const STORE_NAME = 'FileHandles';
const HANDLE_KEY = 'currentFileHandle';
const BACKUP_HANDLE_KEY = 'backupFileHandle';
const RULES_HANDLE_KEY = 'rulesFileHandle';

async function saveKeyedHandleToIDB(key: string, handle: FileSystemFileHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(handle, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function getKeyedHandleFromIDB(key: string): Promise<FileSystemFileHandle | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(key);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function clearKeyedHandleFromIDB(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveHandleToIDB(handle: FileSystemFileHandle): Promise<void> {
  return saveKeyedHandleToIDB(HANDLE_KEY, handle);
}

export async function getHandleFromIDB(): Promise<FileSystemFileHandle | null> {
  return getKeyedHandleFromIDB(HANDLE_KEY);
}

export async function clearHandleFromIDB(): Promise<void> {
  return clearKeyedHandleFromIDB(HANDLE_KEY);
}

export async function saveBackupHandleToIDB(handle: FileSystemFileHandle): Promise<void> {
  return saveKeyedHandleToIDB(BACKUP_HANDLE_KEY, handle);
}

export async function getBackupHandleFromIDB(): Promise<FileSystemFileHandle | null> {
  return getKeyedHandleFromIDB(BACKUP_HANDLE_KEY);
}

export async function clearBackupHandleFromIDB(): Promise<void> {
  return clearKeyedHandleFromIDB(BACKUP_HANDLE_KEY);
}

export async function saveRulesHandleToIDB(handle: FileSystemFileHandle): Promise<void> {
  return saveKeyedHandleToIDB(RULES_HANDLE_KEY, handle);
}

export async function getRulesHandleFromIDB(): Promise<FileSystemFileHandle | null> {
  return getKeyedHandleFromIDB(RULES_HANDLE_KEY);
}

export async function clearRulesHandleFromIDB(): Promise<void> {
  return clearKeyedHandleFromIDB(RULES_HANDLE_KEY);
}

export async function readRulesFile(handle: FileSystemFileHandle): Promise<any[]> {
  const file = await handle.getFile();
  const contents = await file.text();
  const data = JSON.parse(contents);
  return data.regolePuntaNet || [];
}

export async function writeRulesFile(handle: FileSystemFileHandle, regole: any[]): Promise<void> {
  // @ts-ignore
  const writable = await handle.createWritable();
  const data = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    regolePuntaNet: regole
  };
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

/**
 * Verify if we have permission to read/write to the handle
 */
export async function verifyPermission(handle: FileSystemFileHandle, readWrite: boolean): Promise<boolean> {
  const options: any = {};
  if (readWrite) {
    options.mode = 'readwrite';
  }
  
  // @ts-ignore
  if ((await handle.queryPermission(options)) === 'granted') {
    return true;
  }
  
  // @ts-ignore
  if ((await handle.requestPermission(options)) === 'granted') {
    return true;
  }
  
  return false;
}

/**
 * Request permission to read/write to the handle
 */
export async function requestPermission(handle: FileSystemFileHandle): Promise<boolean> {
  return await verifyPermission(handle, true);
}

/**
 * Read data from a FileSystemFileHandle
 */
export async function readFile(handle: FileSystemFileHandle): Promise<BackupData> {
  const file = await handle.getFile();
  const contents = await file.text();
  return JSON.parse(contents) as BackupData;
}

/**
 * Write data to a FileSystemFileHandle
 */
export async function writeFile(handle: FileSystemFileHandle, data: BackupData): Promise<void> {
  // @ts-ignore
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

/**
 * Open an existing file
 */
export async function openExistingFile(): Promise<{ handle: FileSystemFileHandle, data: BackupData } | null> {
  try {
    // @ts-ignore
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: 'GV Cash Flow File',
        accept: { 'application/json': ['.gvcf', '.json'] },
      }],
      multiple: false
    });
    const data = await readFile(handle);
    return { handle, data };
  } catch (error: any) {
    if (error.name === 'AbortError') return null;
    throw error;
  }
}

/**
 * Create a new file
 */
export async function createNewFile(initialData: BackupData): Promise<{ handle: FileSystemFileHandle, data: BackupData } | null> {
  try {
    // @ts-ignore
    const handle = await window.showSaveFilePicker({
      suggestedName: 'gv-cashflow.gvcf',
      types: [{
        description: 'GV Cash Flow File',
        accept: { 'application/json': ['.gvcf', '.json'] },
      }],
    });
    await writeFile(handle, initialData);
    return { handle, data: initialData };
  } catch (error: any) {
    if (error.name === 'AbortError') return null;
    throw error;
  }
}
