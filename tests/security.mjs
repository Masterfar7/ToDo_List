import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  setLogLevel,
} from 'firebase/firestore';
import { CloudTaskRepository, importedId } from '../src/data/cloud.ts';
setLogLevel('silent');
const env = await initializeTestEnvironment({
  projectId: 'demo-my-day',
  firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
});
const checks = [];
async function check(name, run) {
  await run();
  checks.push({ name, status: 'passed' });
}
function snapshot(repo) {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    const timeout = setTimeout(() => {
      stop();
      reject(new Error('Snapshot timeout'));
    }, 12000);
    stop = repo.subscribe(
      (tasks, info) => {
        if (info?.fromCache) return;
        clearTimeout(timeout);
        stop();
        resolve(tasks);
      },
      (error) => {
        clearTimeout(timeout);
        stop();
        reject(error);
      },
    );
  });
}
try {
  await env.clearFirestore();
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const anon = env.unauthenticatedContext().firestore();
  const path = 'users/alice/tasks/first';
  const task = () => ({
    text: 'Тестовая задача',
    completed: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await check('owner can create', () => assertSucceeds(setDoc(doc(alice, path), task())));
  await check('owner can read own document', () => assertSucceeds(getDoc(doc(alice, path))));
  await check('owner can list own tasks', () =>
    assertSucceeds(getDocs(collection(alice, 'users/alice/tasks'))),
  );
  await check('foreign document read denied', () => assertFails(getDoc(doc(bob, path))));
  await check('foreign list denied', () =>
    assertFails(getDocs(collection(bob, 'users/alice/tasks'))),
  );
  await check('anonymous read denied', () => assertFails(getDoc(doc(anon, path))));
  await check('foreign creation denied', () =>
    assertFails(setDoc(doc(bob, 'users/alice/tasks/foreign'), task())),
  );
  await check('anonymous creation denied', () =>
    assertFails(setDoc(doc(anon, 'users/alice/tasks/anonymous'), task())),
  );
  await check('owner can complete', () =>
    assertSucceeds(updateDoc(doc(alice, path), { completed: true, updatedAt: serverTimestamp() })),
  );
  await check('foreign update denied', () =>
    assertFails(updateDoc(doc(bob, path), { completed: false, updatedAt: serverTimestamp() })),
  );
  await check('extra properties denied', () =>
    assertFails(updateDoc(doc(alice, path), { owner: 'bob', updatedAt: serverTimestamp() })),
  );
  await check('blank task denied', () =>
    assertFails(setDoc(doc(alice, 'users/alice/tasks/empty'), { ...task(), text: '  ' })),
  );
  await check('overlong task denied', () =>
    assertFails(setDoc(doc(alice, 'users/alice/tasks/long'), { ...task(), text: 'a'.repeat(301) })),
  );
  await check('invalid completed type denied', () =>
    assertFails(setDoc(doc(alice, 'users/alice/tasks/bad-type'), { ...task(), completed: 'yes' })),
  );
  await check('invalid timestamp type denied', () =>
    assertFails(setDoc(doc(alice, 'users/alice/tasks/bad-time'), { ...task(), createdAt: 100 })),
  );
  await check('foreign deletion denied', () => assertFails(deleteDoc(doc(bob, path))));
  await check('owner can edit text', () =>
    assertSucceeds(updateDoc(doc(alice, path), { text: 'Изменено', updatedAt: serverTimestamp() })),
  );
  await check('creation timestamp cannot be rewritten', () =>
    assertFails(
      updateDoc(doc(alice, path), {
        createdAt: Timestamp.fromMillis(1),
        updatedAt: serverTimestamp(),
      }),
    ),
  );
  await check('completed tasks may be restored or imported', () =>
    assertSucceeds(
      setDoc(doc(alice, 'users/alice/tasks/restored'), { ...task(), completed: true }),
    ),
  );
  await check('backdated creation denied', () =>
    assertFails(
      setDoc(doc(alice, 'users/alice/tasks/backdated'), {
        ...task(),
        createdAt: Timestamp.fromMillis(1),
      }),
    ),
  );
  await check('unrelated documents remain denied', () =>
    assertFails(setDoc(doc(alice, 'public/anything'), { text: 'No' })),
  );
  await check('owner can delete', () => assertSucceeds(deleteDoc(doc(alice, path))));
  await env.clearFirestore();
  const repo = new CloudTaskRepository(alice, 'alice');
  await check('repository add and live subscription', async () => {
    await repo.add('Исходная задача');
    const tasks = await snapshot(repo);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].text, 'Исходная задача');
  });
  let saved = (await snapshot(repo))[0];
  await check('repository editing persists', async () => {
    await repo.update(saved.id, '  Исправленная задача  ');
    const tasks = await snapshot(repo);
    assert.equal(tasks[0].text, 'Исправленная задача');
    saved = tasks[0];
  });
  await check('repository completion persists', async () => {
    await repo.toggle(saved);
    saved = (await snapshot(repo))[0];
    assert.equal(saved.completed, true);
  });
  await check('repository deletion persists', async () => {
    await repo.remove(saved.id);
    assert.equal((await snapshot(repo)).length, 0);
  });
  await check('repository undo restores completion and original id', async () => {
    await repo.restore(saved);
    const tasks = await snapshot(repo);
    assert.equal(tasks[0].id, saved.id);
    assert.equal(tasks[0].completed, true);
  });
  await check('repeated undo does not overwrite another edit', async () => {
    await repo.update(saved.id, 'Новая версия');
    await repo.restore(saved);
    const tasks = await snapshot(repo);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].text, 'Новая версия');
  });
  const local = [
    { id: 'local-a', text: 'Из браузера', completed: false, createdAt: 1 },
    { id: 'local-b', text: 'Готовая задача', completed: true, createdAt: 2 },
  ];
  await check('local import preserves text and completed state', async () => {
    assert.equal(await repo.importTasks(local), 2);
    const tasks = await snapshot(repo);
    assert.equal(tasks.find((t) => t.id === importedId('local-b')).completed, true);
  });
  await check('repeated local import is idempotent', async () => {
    assert.equal(await repo.importTasks(local), 0);
    assert.equal((await snapshot(repo)).length, 3);
  });
  await check('repository cannot access a foreign user path', () =>
    assertFails(new CloudTaskRepository(bob, 'alice').add('Запрещено')),
  );
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/security-results.json',
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        environment: 'local Firestore emulator; synthetic identities',
        total: checks.length,
        checks,
      },
      null,
      2,
    ),
  );
  console.log(`SECURITY + CLOUD INTEGRATION PASS: ${checks.length} checks.`);
} finally {
  await env.cleanup();
}
