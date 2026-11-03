import {
  isTask,
  validateText,
  type SnapshotInfo,
  type Task,
  type TaskRepository,
} from '../domain/tasks';
export const LOCAL_KEY = 'my-day.local.v2';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type Subscriber = {
  change: (tasks: Task[], info?: SnapshotInfo) => void;
  error: (error: unknown) => void;
};
export class LocalTaskRepository implements TaskRepository {
  private storage?: StorageLike;
  private tasks: Task[] = [];
  private listeners = new Set<Subscriber>();
  constructor(storage?: StorageLike) {
    // Accessing window.localStorage itself can throw in a restricted browser.
    try {
      this.storage = storage ?? globalThis.localStorage;
    } catch {
      /* shown by subscribe */
    }
  }
  private read(): Task[] {
    if (!this.storage)
      throw new Error(
        'Браузер не разрешает локальное хранение. Разреши данные сайта в его настройках.',
      );
    let value: unknown;
    try {
      value = JSON.parse(this.storage.getItem(LOCAL_KEY) ?? '[]');
    } catch {
      throw new Error('Не удалось прочитать локальные задачи. Сохранённые данные не перезаписаны.');
    }
    if (
      !Array.isArray(value) ||
      !value.every(isTask) ||
      new Set(value.map((t) => t.id)).size !== value.length
    ) {
      throw new Error(
        'Локальные данные повреждены. Они не перезаписаны; проверь хранилище браузера.',
      );
    }
    return value;
  }
  private refresh = () => {
    try {
      this.tasks = this.read();
      this.listeners.forEach((fn) => fn.change([...this.tasks], { fromCache: false }));
    } catch (e) {
      this.listeners.forEach((fn) => fn.error(e));
    }
  };
  private onStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_KEY || event.key === null) this.refresh();
  };
  subscribe(change: Subscriber['change'], error: Subscriber['error']) {
    const listener = { change, error };
    this.listeners.add(listener);
    if (this.listeners.size === 1 && typeof window !== 'undefined')
      window.addEventListener('storage', this.onStorage);
    try {
      this.tasks = this.read();
      change([...this.tasks], { fromCache: false });
    } catch (e) {
      error(e);
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && typeof window !== 'undefined')
        window.removeEventListener('storage', this.onStorage);
    };
  }
  private async mutate(change: (tasks: Task[]) => Task[]) {
    const write = () => {
      const next = change(this.read());
      try {
        this.storage!.setItem(LOCAL_KEY, JSON.stringify(next));
      } catch {
        throw new Error(
          'Не удалось сохранить задачи. Проверь свободное место и разрешение браузера на хранение данных.',
        );
      }
      this.tasks = next;
      this.listeners.forEach((fn) => fn.change([...next], { fromCache: false }));
    };
    // Serializes read-modify-write between tabs in browsers supporting Web Locks.
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.locks)
      await navigator.locks.request(LOCAL_KEY, write);
    else write();
  }
  async add(text: string) {
    const value = validateText(text);
    await this.mutate((tasks) => [
      { id: crypto.randomUUID(), text: value, completed: false, createdAt: Date.now() },
      ...tasks,
    ]);
  }
  async update(id: string, text: string) {
    const value = validateText(text);
    await this.mutate((tasks) => {
      if (!tasks.some((t) => t.id === id)) throw new Error('Задача уже удалена. Обнови список.');
      return tasks.map((t) => (t.id === id ? { ...t, text: value } : t));
    });
  }
  async toggle(task: Task) {
    await this.mutate((tasks) => {
      if (!tasks.some((t) => t.id === task.id))
        throw new Error('Задача уже удалена. Обнови список.');
      return tasks.map((t) => (t.id === task.id ? { ...t, completed: !task.completed } : t));
    });
  }
  async remove(id: string) {
    await this.mutate((tasks) => tasks.filter((t) => t.id !== id));
  }
  async restore(task: Task) {
    if (!isTask(task)) throw new Error('Не удалось восстановить задачу.');
    await this.mutate((tasks) =>
      tasks.some((t) => t.id === task.id)
        ? tasks
        : [...tasks, { ...task }].sort((a, b) => b.createdAt - a.createdAt),
    );
  }
  async importTasks(source: Task[]) {
    if (!source.every(isTask)) throw new Error('В списке есть некорректные задачи.');
    const unique = [...new Map(source.map((task) => [task.id, task])).values()];
    let count = 0;
    await this.mutate((tasks) => {
      const ids = new Set(tasks.map((t) => t.id));
      const added = unique.filter((t) => !ids.has(t.id));
      count = added.length;
      return [...tasks, ...added.map((t) => ({ ...t }))].sort((a, b) => b.createdAt - a.createdAt);
    });
    return count;
  }
}
