// Browser-only test adapter. No real Google account or Firebase project is contacted.
export const firebaseReady = true;
export const auth = {};
let user = null;
let account = 'alice';
let authListener = () => {};
const accounts = new Map();
const listeners = new Map();
let hold = false;
let finishWrite;
const copy = (tasks) => tasks.map((task) => ({ ...task }));
const read = (uid) => copy(accounts.get(uid) ?? []);
function publish(uid, tasks) {
  accounts.set(uid, copy(tasks));
  for (const listener of listeners.get(uid) ?? []) listener(read(uid), { fromCache: false });
}
window.__accountTest = {
  setAccount(value) {
    account = value;
  },
  holdWrites() {
    hold = true;
  },
  releaseWrite() {
    hold = false;
    finishWrite?.();
  },
};
export function observeUser(change) {
  authListener = change;
  queueMicrotask(() => change(user));
  return () => {
    authListener = () => {};
  };
}
export async function login() {
  user = {
    uid: account,
    displayName: account === 'alice' ? 'Анна Тестовая' : 'Борис Тестовый',
    email: `${account}@example.test`,
  };
  authListener(user);
}
export async function logout() {
  user = null;
  authListener(null);
}
export function cloudRepository(uid) {
  return {
    subscribe(change) {
      const set = listeners.get(uid) ?? new Set();
      listeners.set(uid, set);
      set.add(change);
      change(read(uid), { fromCache: false });
      return () => set.delete(change);
    },
    async add(text) {
      if (hold)
        await new Promise((resolve) => {
          finishWrite = resolve;
        });
      publish(uid, [
        { id: crypto.randomUUID(), text: text.trim(), completed: false, createdAt: Date.now() },
        ...read(uid),
      ]);
    },
    async update(id, text) {
      publish(
        uid,
        read(uid).map((t) => (t.id === id ? { ...t, text: text.trim() } : t)),
      );
    },
    async toggle(task) {
      publish(
        uid,
        read(uid).map((t) => (t.id === task.id ? { ...t, completed: !task.completed } : t)),
      );
    },
    async remove(id) {
      publish(
        uid,
        read(uid).filter((t) => t.id !== id),
      );
    },
    async restore(task) {
      if (!read(uid).some((t) => t.id === task.id)) publish(uid, [task, ...read(uid)]);
    },
    async importTasks(source) {
      const tasks = read(uid);
      let count = 0;
      for (const task of source) {
        const id = `local_${task.id}`;
        if (!tasks.some((t) => t.id === id)) {
          tasks.push({ ...task, id });
          count++;
        }
      }
      publish(uid, tasks);
      return count;
    },
  };
}
