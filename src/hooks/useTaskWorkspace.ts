import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { auth, cloudRepository, login, logout, observeUser } from '../data/firebase';
import { LocalTaskRepository } from '../data/local';
import { importedId } from '../data/cloud';
import { type Filter, type Task } from '../domain/tasks';
export function describeError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': 'Окно входа закрыто. Твои локальные задачи остались на месте.',
    'auth/cancelled-popup-request': 'Вход отменён. Можно попробовать ещё раз.',
    'auth/popup-blocked': 'Разреши всплывающее окно для входа через Google в настройках браузера.',
    'auth/unauthorized-domain':
      'Домен сайта нужно добавить в разрешённые домены Firebase Authentication.',
    'auth/operation-not-allowed': 'Владелец сайта ещё не включил вход через Google в Firebase.',
    'auth/network-request-failed':
      'Не удалось связаться с Google. Проверь подключение к интернету.',
    'permission-denied':
      'Нет доступа к задачам. Проверь вход и публикацию актуальных правил Firestore.',
    unavailable: 'Облако временно недоступно. Проверь интернет и попробуй ещё раз.',
    'resource-exhausted': 'Достигнут лимит облачного хранилища. Попробуй позже.',
    'not-found': 'Задача уже удалена на другом устройстве. Обнови список.',
  };
  return code
    ? (messages[code] ?? 'Не удалось выполнить действие. Попробуй ещё раз.')
    : error instanceof Error
      ? error.message
      : 'Не удалось выполнить действие. Попробуй ещё раз.';
}
export function useTaskWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [localRepository] = useState(() => new LocalTaskRepository());
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [localError, setLocalError] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const operationRef = useRef<symbol | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [fromCache, setFromCache] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [undo, setUndo] = useState<{ task: Task; scope: string } | null>(null);
  const scope = user ? `user:${user.uid}` : 'local';
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  useEffect(() => {
    if (!auth) return;
    return observeUser(
      (value) => {
        // An in-flight write belongs to the previous account, never to the next list.
        scopeRef.current = value ? `user:${value.uid}` : 'local';
        operationRef.current = null;
        busyRef.current = false;
        setBusy(false);
        setTasks([]);
        setLoading(true);
        setUndo(null);
        setUser(value);
        setAuthReady(true);
      },
      (e) => {
        setError(describeError(e));
        setAuthReady(true);
      },
    );
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(
    () =>
      localRepository.subscribe(
        (next) => {
          setLocalTasks(next);
          setLocalError('');
        },
        (e) => setLocalError(describeError(e)),
      ),
    [localRepository],
  );
  const repository = useMemo(
    () => (user ? cloudRepository(user.uid) : localRepository),
    [user?.uid, localRepository],
  );
  useEffect(() => {
    setTasks([]);
    setLoading(true);
    setError('');
    setStatus('');
    setFilter('all');
    setUndo(null);
    setFromCache(true);
    if (!authReady) return;
    return repository.subscribe(
      (next, info) => {
        setTasks(next);
        setFromCache(info?.fromCache ?? false);
        setLoading(false);
      },
      (e) => {
        setError(describeError(e));
        setLoading(false);
      },
    );
  }, [repository, authReady]);
  async function run(
    action: () => Promise<void>,
    message: string,
    requiresNetwork = !!user,
  ): Promise<boolean> {
    if (busyRef.current || signingOutRef.current) return false;
    if (requiresNetwork && !navigator.onLine) {
      setError('Для изменения облачных задач нужно подключение к интернету.');
      return false;
    }
    busyRef.current = true;
    const operation = Symbol('task-action');
    operationRef.current = operation;
    setBusy(true);
    setError('');
    setStatus('');
    const origin = scope;
    try {
      await action();
      if (scopeRef.current === origin) setStatus(message);
      return scopeRef.current === origin;
    } catch (e) {
      if (scopeRef.current === origin) setError(describeError(e));
      return false;
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  const disabled = busy || signingOut || loading || !authReady || (!!user && !online);
  const cloudIds = new Set(tasks.map((t) => t.id));
  const importable = user ? localTasks.filter((t) => !cloudIds.has(importedId(t.id))) : [];
  return {
    user,
    authReady,
    scope,
    tasks,
    filter,
    setFilter,
    busy,
    signingOut,
    loading,
    error,
    status,
    online,
    disabled,
    undo,
    localError,
    importCount: importable.length,
    storageLabel: user ? (fromCache ? 'Ожидаем облако' : 'В облаке') : 'На устройстве',
    async add(text: string) {
      return run(async () => {
        await repository.add(text);
        if (scopeRef.current === scope) setFilter('all');
      }, 'Задача добавлена и сохранена.');
    },
    async update(task: Task, text: string) {
      return run(() => repository.update(task.id, text), 'Изменения сохранены.');
    },
    async toggle(task: Task) {
      return run(
        () => repository.toggle(task),
        task.completed ? 'Задача возвращена в работу.' : 'Задача выполнена.',
      );
    },
    async remove(task: Task) {
      return run(async () => {
        await repository.remove(task.id);
        if (scopeRef.current === scope) setUndo({ task, scope });
      }, 'Задача удалена. Удаление можно отменить.');
    },
    async restore() {
      if (!undo || undo.scope !== scope) return false;
      return run(async () => {
        await repository.restore(undo.task);
        if (scopeRef.current === scope) {
          setUndo(null);
          setFilter('all');
        }
      }, 'Задача восстановлена.');
    },
    dismissUndo() {
      setUndo(null);
    },
    async importLocal() {
      if (!user || !importable.length) return false;
      return run(async () => {
        await repository.importTasks(importable);
        if (scopeRef.current === scope) setFilter('all');
      }, 'Локальные задачи скопированы в аккаунт. Оригиналы остались на устройстве.');
    },
    async signIn() {
      return run(login, 'Вход выполнен. Открыт личный облачный список.');
    },
    async signOut() {
      // Firebase sign-out is local: it must remain available if a cloud write awaits a network.
      if (signingOutRef.current) return false;
      signingOutRef.current = true;
      setSigningOut(true);
      setError('');
      try {
        await logout();
        return true;
      } catch (e) {
        setError(describeError(e));
        return false;
      } finally {
        signingOutRef.current = false;
        setSigningOut(false);
      }
    },
  };
}
