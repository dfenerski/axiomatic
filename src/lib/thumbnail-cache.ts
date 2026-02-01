interface CachedThumbnail {
  dataUrl: string
  totalPages: number
}

const DB_NAME = 'axiomatic'
const STORE_NAME = 'thumbnails'
const DB_VERSION = 2

let dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        // v2: wipe stale thumbnails cached from the old readFile path
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME)
        }
        db.createObjectStore(STORE_NAME)
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
    const result = await new Promise<CachedThumbnail | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
    // Purge corrupt entries (blank/tiny data URLs)
    if (result && result.dataUrl.length < 200) {
      await deleteCachedThumbnail(key)
      return null
    }
    return result
  } catch {
    return null
  }
}

export async function deleteCachedThumbnail(key: string): Promise<void> {
  try {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
  } catch {
    // ignore
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
