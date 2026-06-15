// Locations helper: cache and provide room/area/restaurant lists
import { db } from './app.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

let locCache = null;
let locPromise = null;

export async function loadLocations() {
  if (locCache) return locCache;
  if (locPromise) return locPromise;

  locPromise = (async () => {
    try {
      const snap = await getDocs(collection(db, 'locations'));
      const all = snap.docs.map(d => d.data());
      locCache = {
        rooms: all.filter(l => l.type === 'Rooms').sort((a, b) => parseInt(a.name) - parseInt(b.name)),
        publicAreas: all.filter(l => l.type === 'Public Area').sort((a, b) => a.name.localeCompare(b.name)),
        restaurants: all.filter(l => l.type === 'Restaurant').sort((a, b) => a.name.localeCompare(b.name)),
      };
      return locCache;
    } catch (err) {
      console.warn('Failed to load locations:', err);
      return { rooms: [], publicAreas: [], restaurants: [] };
    }
  })();

  return locPromise;
}

export function getLocationsByType(type) {
  if (!locCache) return [];
  if (type === 'Rooms') return locCache.rooms;
  if (type === 'Public Area') return locCache.publicAreas;
  if (type === 'Restaurant') return locCache.restaurants;
  return [];
}
