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
  try {
    return JSON.parse(contents) as BackupData;
  } catch (err) {
    throw new Error("Il file selezionato è corrotto o non è un file JSON/GVCF valido.");
  }
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

class MockFileHandle {
  name: string;
  kind = 'file';
  private fileData: File;

  constructor(file: File) {
    this.name = file.name;
    this.fileData = file;
  }

  async getFile(): Promise<File> {
    return this.fileData;
  }

  async createWritable() {
    const fileData = this.fileData;
    return {
      write: async (content: string) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileData.name || 'backup-cashflow.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      close: async () => {}
    };
  }
}

/**
 * Open an existing file
 */
export async function openExistingFile(): Promise<{ handle: any, data: BackupData } | null> {
  // @ts-ignore
  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
    try {
      // @ts-ignore
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'GV Cash Flow File',
          accept: { 'text/plain': ['.txt'], 'application/json': ['.json', '.gvcf'] },
        }],
        multiple: false
      });
      const data = await readFile(handle);
      return { handle, data };
    } catch (error: any) {
      if (error.name === 'AbortError') return null;
      throw error;
    }
  } else {
    // Fallback per cellulari / browser non supportati
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      document.body.appendChild(input);
      
      input.onchange = async () => {
        const file = input.files?.[0];
        document.body.removeChild(input);
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const contents = await file.text();
          const data = JSON.parse(contents) as BackupData;
          const handle = new MockFileHandle(file);
          resolve({ handle, data });
        } catch (err) {
          alert("Errore nel caricamento del file: " + (err as Error).message);
          resolve(null);
        }
      };
      
      input.click();
    });
  }
}

/**
 * Create a new file
 */
export async function createNewFile(initialData: BackupData): Promise<{ handle: any, data: BackupData } | null> {
  // @ts-ignore
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: 'gv-cashflow.txt',
        types: [{
          description: 'GV Cash Flow File',
          accept: { 'text/plain': ['.txt'], 'application/json': ['.json', '.gvcf'] },
        }],
      });
      await writeFile(handle, initialData);
      return { handle, data: initialData };
    } catch (error: any) {
      if (error.name === 'AbortError') return null;
      throw error;
    }
  } else {
    // Fallback: scarica direttamente il nuovo file
    const blob = new Blob([JSON.stringify(initialData, null, 2)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gv-cashflow.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Ritorna un mock handle
    const file = new File([blob], 'gv-cashflow.txt', { type: 'text/plain' });
    const handle = new MockFileHandle(file);
    return { handle, data: initialData };
  }
}
