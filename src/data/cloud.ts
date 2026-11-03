import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import { isTask, validateText, type Task, type TaskRepository } from '../domain/tasks';
export const importedId = (id: string) => `local_${id}`;
export class CloudTaskRepository implements TaskRepository {
  private tasks;
  constructor(
    private db: Firestore,
    uid: string,
  ) {
    this.tasks = collection(db, 'users', uid, 'tasks');
  }
  subscribe(
    onChange: Parameters<TaskRepository['subscribe']>[0],
    onError: Parameters<TaskRepository['subscribe']>[1],
  ) {
    return onSnapshot(
      query(this.tasks, orderBy('createdAt', 'desc')),
      { includeMetadataChanges: true },
      (snapshot) => {
        // Do not present an optimistic write that may still be rejected as saved.
        if (snapshot.metadata.hasPendingWrites) return;
        onChange(
          snapshot.docs.map((d) => {
            const t = d.data();
            return {
              id: d.id,
              text: t.text,
              completed: t.completed,
              createdAt: t.createdAt?.toMillis() ?? 0,
            };
          }),
          { fromCache: snapshot.metadata.fromCache },
        );
      },
      onError,
    );
  }
  async add(text: string) {
    await addDoc(this.tasks, {
      text: validateText(text),
      completed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  async update(id: string, text: string) {
    await updateDoc(doc(this.tasks, id), {
      text: validateText(text),
      updatedAt: serverTimestamp(),
    });
  }
  async toggle(task: Task) {
    await updateDoc(doc(this.tasks, task.id), {
      completed: !task.completed,
      updatedAt: serverTimestamp(),
    });
  }
  async remove(id: string) {
    await deleteDoc(doc(this.tasks, id));
  }
  async restore(task: Task) {
    if (!isTask(task)) throw new Error('Не удалось восстановить задачу.');
    const ref = doc(this.tasks, task.id);
    await runTransaction(this.db, async (tx) => {
      if (!(await tx.get(ref)).exists())
        tx.set(ref, {
          text: task.text,
          completed: task.completed,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
    });
  }
  async importTasks(source: Task[]) {
    if (!source.every(isTask)) throw new Error('В локальном списке есть некорректные задачи.');
    // Stable IDs make a retry safe even if a previous transaction succeeded before a network interruption.
    const unique = [...new Map(source.map((t) => [t.id, t])).values()];
    let count = 0;
    for (let offset = 0; offset < unique.length; offset += 100) {
      const batch = unique.slice(offset, offset + 100);
      count += await runTransaction(this.db, async (tx) => {
        const refs = batch.map((t) => doc(this.tasks, importedId(t.id)));
        const existing = await Promise.all(refs.map((ref) => tx.get(ref)));
        let added = 0;
        batch.forEach((task, i) => {
          if (existing[i].exists()) return;
          tx.set(refs[i], {
            text: validateText(task.text),
            completed: task.completed,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          added++;
        });
        return added;
      });
    }
    return count;
  }
}
