// IndexedDB utilities for storing large audio files
const DB_NAME = 'SmudgedPamphletDB';
const STORE_NAME = 'audioFiles';
const ALBUM_ART_STORE_NAME = 'albumArt';
const BANNER_IMAGE_STORE_NAME = 'bannerImages';
const DB_VERSION = 3; // Incremented to add banner images store

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
      if (!db.objectStoreNames.contains(ALBUM_ART_STORE_NAME)) {
        db.createObjectStore(ALBUM_ART_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(BANNER_IMAGE_STORE_NAME)) {
        db.createObjectStore(BANNER_IMAGE_STORE_NAME);
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

// Album art storage helpers
export interface AlbumArt {
  imageData: string; // base64 image data
  mimeType: string; // e.g., 'image/png' or 'image/jpeg'
}

export async function savePodcastAlbumArt(reviewId: string, albumArt: AlbumArt): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ALBUM_ART_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(ALBUM_ART_STORE_NAME);
    const albumArtKey = `podcast-${reviewId}`;
    const request = store.put(albumArt, albumArtKey);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getPodcastAlbumArt(reviewId: string): Promise<AlbumArt | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ALBUM_ART_STORE_NAME], 'readonly');
    const store = transaction.objectStore(ALBUM_ART_STORE_NAME);
    const albumArtKey = `podcast-${reviewId}`;
    const request = store.get(albumArtKey);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function deletePodcastAlbumArt(reviewId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ALBUM_ART_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(ALBUM_ART_STORE_NAME);
    const albumArtKey = `podcast-${reviewId}`;
    const request = store.delete(albumArtKey);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Banner image storage helpers
export interface BannerImage {
  imageData: string; // base64 image data
  mimeType: string; // e.g., 'image/png' or 'image/jpeg'
}

export async function saveBannerImage(contentId: string, banner: BannerImage): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BANNER_IMAGE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(BANNER_IMAGE_STORE_NAME);
    const bannerKey = `banner-${contentId}`;
    const request = store.put(banner, bannerKey);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getBannerImage(contentId: string): Promise<BannerImage | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BANNER_IMAGE_STORE_NAME], 'readonly');
    const store = transaction.objectStore(BANNER_IMAGE_STORE_NAME);
    const bannerKey = `banner-${contentId}`;
    const request = store.get(bannerKey);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function deleteBannerImage(contentId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BANNER_IMAGE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(BANNER_IMAGE_STORE_NAME);
    const bannerKey = `banner-${contentId}`;
    const request = store.delete(bannerKey);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
