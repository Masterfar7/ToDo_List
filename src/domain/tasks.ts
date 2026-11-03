export interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}
export type Filter = 'all' | 'active' | 'completed';
export interface SnapshotInfo {
  fromCache: boolean;
}
export interface TaskRepository {
  subscribe(
    onChange: (tasks: Task[], info?: SnapshotInfo) => void,
    onError: (error: unknown) => void,
  ): () => void;
  add(text: string): Promise<void>;
  update(id: string, text: string): Promise<void>;
  toggle(task: Task): Promise<void>;
  remove(id: string): Promise<void>;
  restore(task: Task): Promise<void>;
  importTasks(tasks: Task[]): Promise<number>;
}
export function validateText(input: string): string {
  const text = input.trim();
  if (!text) throw new Error('Напиши, что нужно сделать.');
  if (text.length > 300) throw new Error('В задаче может быть не больше 300 символов.');
  return text;
}
export function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false;
  const t = value as Task;
  return (
    typeof t.id === 'string' &&
    t.id.length > 0 &&
    /^[A-Za-z0-9_-]{1,200}$/.test(t.id) &&
    typeof t.text === 'string' &&
    t.text.trim().length > 0 &&
    t.text.length <= 300 &&
    typeof t.completed === 'boolean' &&
    typeof t.createdAt === 'number' &&
    Number.isFinite(t.createdAt) &&
    t.createdAt >= 0
  );
}
export function filterTasks(tasks: Task[], filter: Filter): Task[] {
  return tasks.filter(
    (t) => filter === 'all' || (filter === 'completed' ? t.completed : !t.completed),
  );
}
