import test from 'node:test';
import assert from 'node:assert/strict';
import { validateText, filterTasks, isTask, type Task } from '../src/domain/tasks.ts';
import { LocalTaskRepository, LOCAL_KEY } from '../src/data/local.ts';
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
function read(store: ReturnType<typeof storage>): Task[] {
  return JSON.parse(store.getItem(LOCAL_KEY) ?? '[]');
}
test('validation trims and rejects blank / overlong text', () => {
  assert.equal(validateText('  План  '), 'План');
  assert.throws(() => validateText(' \t\n'));
  assert.throws(() => validateText('a'.repeat(301)));
  assert.equal(validateText('a'.repeat(300)).length, 300);
});
test('unicode and HTML-like text remain literal strings', async () => {
  const store = storage();
  const repo = new LocalTaskRepository(store);
  await repo.add('Купить 🥑 <script>alert(1)</script>');
  assert.equal(read(store)[0].text, 'Купить 🥑 <script>alert(1)</script>');
});
test('add, toggle, reload, delete persist', async () => {
  const store = storage();
  const repo = new LocalTaskRepository(store);
  await repo.add('Тест');
  await repo.toggle(read(store)[0]);
  const reloaded = new LocalTaskRepository(store);
  let tasks: Task[] = [];
  const stop = reloaded.subscribe(
    (t) => (tasks = t),
    () => assert.fail(),
  );
  assert.equal(tasks[0].completed, true);
  await reloaded.remove(tasks[0].id);
  assert.equal(tasks.length, 0);
  stop();
});
test('editing trims text without changing id, creation time or completion', async () => {
  const store = storage();
  const repo = new LocalTaskRepository(store);
  await repo.add('До');
  await repo.toggle(read(store)[0]);
  const before = read(store)[0];
  await repo.update(before.id, '  После  ');
  assert.deepEqual(read(store)[0], { ...before, text: 'После' });
});
test('invalid edit preserves saved text', async () => {
  const store = storage();
  const repo = new LocalTaskRepository(store);
  await repo.add('До');
  const before = read(store);
  await assert.rejects(repo.update(before[0].id, '  '));
  assert.deepEqual(read(store), before);
});
test('editing and toggling a removed task report a missing record', async () => {
  const store = storage();
  const repo = new LocalTaskRepository(store);
  await repo.add('Удалить');
  const task = read(store)[0];
  await repo.remove(task.id);
  await assert.rejects(repo.update(task.id, 'Правка'));
  await assert.rejects(repo.toggle(task));
});
test('undo restores a completed task and preserves its data', async () => {
  const store = storage();
  const repo = new LocalTaskRepository(store);
  await repo.add('Вернуть');
  await repo.toggle(read(store)[0]);
  const task = read(store)[0];
  await repo.remove(task.id);
  await repo.restore(task);
  assert.deepEqual(read(store), [task]);
});
test('repeated restore does not duplicate or overwrite an existing task', async () => {
  const store = storage();
  const repo = new LocalTaskRepository(store);
  await repo.add('Старая версия');
  const task = read(store)[0];
  await repo.update(task.id, 'Новая версия');
  await repo.restore(task);
  assert.equal(read(store).length, 1);
  assert.equal(read(store)[0].text, 'Новая версия');
});
test('storage write failure leaves the list unchanged', async () => {
  const repo = new LocalTaskRepository({
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  });
  let count = 0;
  repo.subscribe(
    (t) => (count = t.length),
    () => {},
  );
  await assert.rejects(repo.add('Тест'));
  assert.equal(count, 0);
});
test('invalid saved JSON is never overwritten', async () => {
  const store = storage();
  store.setItem(LOCAL_KEY, 'broken');
  const repo = new LocalTaskRepository(store);
  let error = false;
  repo.subscribe(
    () => {},
    () => {
      error = true;
    },
  );
  assert.equal(error, true);
  await assert.rejects(repo.add('Тест'));
  assert.equal(store.getItem(LOCAL_KEY), 'broken');
});
test('invalid saved records and duplicate ids are not accepted', async () => {
  const store = storage();
  const task = { id: 'one', text: 'Тест', completed: false, createdAt: 1 };
  store.setItem(LOCAL_KEY, JSON.stringify([task, task]));
  const repo = new LocalTaskRepository(store);
  await assert.rejects(repo.add('Тест'));
  assert.equal(read(store).length, 2);
  assert.equal(isTask({ ...task, createdAt: NaN }), false);
  assert.equal(isTask({ ...task, id: 'invalid/path' }), false);
});
test('a storage read error produces a controlled error', async () => {
  const repo = new LocalTaskRepository({
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => assert.fail(),
  });
  let error = false;
  repo.subscribe(
    () => {},
    () => {
      error = true;
    },
  );
  assert.equal(error, true);
  await assert.rejects(repo.add('Тест'));
});
test('two repository instances do not overwrite sequential changes', async () => {
  const store = storage();
  const one = new LocalTaskRepository(store);
  const two = new LocalTaskRepository(store);
  await one.add('Первый');
  await two.add('Второй');
  assert.equal(read(store).length, 2);
});
test('import is idempotent and preserves completion', async () => {
  const store = storage();
  const repo = new LocalTaskRepository(store);
  const tasks = [
    { id: 'a', text: 'A', completed: true, createdAt: 1 },
    { id: 'b', text: 'B', completed: false, createdAt: 2 },
  ];
  assert.equal(await repo.importTasks(tasks), 2);
  assert.equal(await repo.importTasks(tasks), 0);
  assert.equal(read(store).find((t) => t.id === 'a')?.completed, true);
});
test('import deduplicates source IDs before writing a valid local list', async () => {
  const store = storage();
  const repo = new LocalTaskRepository(store);
  const task = { id: 'one', text: 'Перенос', completed: true, createdAt: 1 };
  assert.equal(await repo.importTasks([task, { ...task }]), 1);
  assert.deepEqual(read(store), [task]);
  // A subsequent mutation must still be able to read the imported list.
  await repo.add('После переноса');
  assert.equal(read(store).length, 2);
});
test('filters separate all, active and completed', () => {
  const tasks = [
    { id: 'a', text: 'A', completed: false, createdAt: 1 },
    { id: 'b', text: 'B', completed: true, createdAt: 2 },
  ];
  assert.equal(filterTasks(tasks, 'all').length, 2);
  assert.equal(filterTasks(tasks, 'active')[0].id, 'a');
  assert.equal(filterTasks(tasks, 'completed')[0].id, 'b');
});
