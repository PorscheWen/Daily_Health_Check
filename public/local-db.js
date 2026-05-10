'use strict';

const DB_NAME = 'daily-health-pwa-local';
const DB_VER = 1;

let dbPromise;

export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('checkins')) {
          const store = db.createObjectStore('checkins', { keyPath: 'id', autoIncrement: true });
          store.createIndex('created_at', 'created_at', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
    });
  }
  return dbPromise;
}

/** @returns {Promise<object|null>} */
export async function getProfile(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    const req = store.get('profile');
    req.onsuccess = () => {
      const row = req.result;
      resolve(row?.value ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putProfile(db, profile) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore('meta').put({ key: 'profile', value: profile });
  });
}

/**
 * @param {object} row — checkin_date, systolic, diastolic, blood_sugar, exercise_text, glucose_timing, created_at
 */
export async function addCheckin(db, row) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('checkins', 'readwrite');
    const store = tx.objectStore('checkins');
    const req = store.add(row);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<Array<object>>} */
export async function listCheckins(db, limit = 30) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('checkins', 'readonly');
    const store = tx.objectStore('checkins');
    const idx = store.index('created_at');
    const req = idx.openCursor(null, 'prev');
    const rows = [];
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && rows.length < limit) {
        rows.push(cursor.value);
        cursor.continue();
      } else {
        resolve(rows);
      }
    };
    req.onerror = () => reject(req.error);
  });
}
