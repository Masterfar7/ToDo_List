import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { CloudTaskRepository } from './cloud';
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseReady = Object.values(config).every(
  (v) => typeof v === 'string' && v.trim().length > 0,
);
const app = firebaseReady ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
export function observeUser(change: (user: User | null) => void, error: (e: Error) => void) {
  return auth ? onAuthStateChanged(auth, change, error) : () => {};
}
export async function login() {
  if (!auth) throw new Error('Вход через Google ещё не настроен владельцем сайта.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}
export async function logout() {
  if (auth) await signOut(auth);
}
export function cloudRepository(uid: string) {
  if (!db) throw new Error('Firebase не настроен.');
  return new CloudTaskRepository(db, uid);
}
