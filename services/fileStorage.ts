import { BackupData } from '../types';

/**
 * IndexedDB utility to store and retrieve the FileSystemFileHandle
 */
const DB_NAME = 'GVCashFlowDB';
const STORE_NAME = 'FileHandles';
const HANDLE_KEY = 'currentFileHandle';

export async function saveHandleToIDB(handle: FileSystemFileHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getHandleFromIDB(): Promise<FileSystemFileHandle | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(HANDLE_KEY);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearHandleFromIDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
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
