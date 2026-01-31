interface CachedThumbnail {
  dataUrl: string
  totalPages: number
}

const DB_NAME = 'axiomatic'
const STORE_NAME = 'thumbnails'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

export async function getCachedThumbnail(
  key: string,
): Promise<CachedThumbnail | null> {
  try {
    const db = await getDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function setCachedThumbnail(
  key: string,
  data: CachedThumbnail,
): Promise<void> {
  try {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(data, key)
  } catch {
    // ignore write failures
  }
}
