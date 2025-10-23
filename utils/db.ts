// IndexedDB utilities for storing large audio files
const DB_NAME = 'SmudgedPamphletDB';
const STORE_NAME = 'audioFiles';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveAudioData(id: string, data: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(data, id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getAudioData(id: string): Promise<string | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function deleteAudioData(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Podcast-specific storage helpers
export async function savePodcastAudio(reviewId: string, audioData: string): Promise<void> {
  const podcastKey = `podcast-${reviewId}`;
  return saveAudioData(podcastKey, audioData);
}

export async function getPodcastAudio(reviewId: string): Promise<string | undefined> {
  const podcastKey = `podcast-${reviewId}`;
  return getAudioData(podcastKey);
}

export async function deletePodcastAudio(reviewId: string): Promise<void> {
  const podcastKey = `podcast-${reviewId}`;
  return deleteAudioData(podcastKey);
}
