import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { firebaseReady } from './data/firebase';
import { filterTasks } from './domain/tasks';
import { useTaskWorkspace } from './hooks/useTaskWorkspace';
import { TaskList } from './components/TaskList';
import { UndoNotice } from './components/UndoNotice';
import { Icon } from './components/Icon';
export default function App() {
  const w = useTaskWorkspace();
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [focusTarget, setFocusTarget] = useState<
    { scope: string; kind: 'input' } | { scope: string; kind: 'row'; index: number } | null
  >(null);
  // Async persistence can finish before React removes disabled attributes.
  // Restore focus after the enabled controls and the new list have committed.
  useLayoutEffect(() => {
    if (!focusTarget || w.disabled) return;
    if (focusTarget.scope === w.scope) {
      let target: HTMLElement | null = input.current;
      if (focusTarget.kind === 'row') {
        const rows = document.querySelectorAll<HTMLLIElement>('.tasks>.task');
        const row = rows[Math.min(focusTarget.index, rows.length - 1)];
        target = row?.querySelector<HTMLElement>('.check input') ?? input.current;
      }
      target?.focus();
    }
    setFocusTarget(null);
  }, [focusTarget, w.disabled, w.scope]);
  const focusInput = () => setFocusTarget({ scope: w.scope, kind: 'input' });
  useEffect(() => setText(''), [w.scope]);
  const visible = filterTasks(w.tasks, w.filter);
  const completed = w.tasks.filter((t) => t.completed).length;
  const active = w.tasks.length - completed;
  const percent = w.tasks.length ? Math.round((completed / w.tasks.length) * 100) : 0;
  const date = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  }).format(new Date());
  const sections = [
    { value: 'all', label: 'Мои задачи', icon: 'grid', count: w.tasks.length },
    { value: 'active', label: 'В работе', icon: 'clock', count: active },
    { value: 'completed', label: 'Готово', icon: 'check', count: completed },
  ] as const;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await w.add(text)) {
      setText('');
      focusInput();
    }
  }
  return (
    <div className={`app-shell ${w.undo ? 'has-undo' : ''}`}>
      <a className="skip-link" href="#task-heading">
        Перейти к задачам
      </a>
      <aside className="sidebar" aria-label="Навигация">
        <a className="brand" href="/" title="На главную">
          <span className="brand-icon">
            <Icon name="check" />
          </span>
          <span>
            Мой день<span className="brand-caption">Личный планер</span>
          </span>
        </a>
        <p className="nav-label">ТВОЁ ПРОСТРАНСТВО</p>
        <nav className="navigation" aria-label="Фильтр задач">
          {sections.map((section) => (
            <button
              key={section.value}
              type="button"
              className={`nav-item ${w.filter === section.value ? 'selected' : ''}`}
              aria-pressed={w.filter === section.value}
              onClick={() => w.setFilter(section.value)}
            >
              <Icon name={section.icon} />
              <span>{section.label}</span>
              <span className="nav-count">{section.count}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-label">
            <Icon name={w.user ? 'cloud' : 'device'} />
            <strong>{w.user ? 'Облачный режим' : 'Локальный режим'}</strong>
          </div>
          <p>{w.user ? 'Личный список в твоём аккаунте.' : 'Задачи сохранены в этом браузере.'}</p>
          <span className="theme-label">
            <span className="theme-dot" /> Неоновая ночь
          </span>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Твоё пространство <span aria-hidden="true">/</span>
            <strong>Задачи</strong>
          </span>
          <div className="account">
            <span className="mode-badge">
              <Icon name={w.user ? 'cloud' : 'device'} />
              {w.storageLabel}
            </span>
            {w.user ? (
              <>
                <span className="username" title={w.user.email ?? ''}>
                  {w.user.displayName ?? 'Мой аккаунт'}
                </span>
                <button
                  className="secondary"
                  disabled={w.signingOut || !w.authReady}
                  onClick={() => void w.signOut()}
                >
                  {w.signingOut ? 'Выходим…' : 'Выйти'}
                </button>
              </>
            ) : (
              <button
                className="google"
                disabled={w.busy || !w.authReady || !firebaseReady || !w.online}
                onClick={() => void w.signIn()}
              >
                <span className="google-letter" aria-hidden="true">
                  G
                </span>
                Войти через Google
              </button>
            )}
          </div>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="live-dot" /> В СВОЁМ РИТМЕ
            </div>
            <h1>
              Сегодня — твой день<span className="title-dot">.</span>
            </h1>
            <p>Большие планы начинаются с маленьких шагов.</p>
          </div>
          <time className="date">{date}</time>
        </div>
        <section className="stats" aria-label="Сводка задач">
          <div className="stat stat-purple">
            <span className="stat-icon">
              <Icon name="grid" />
            </span>
            <div>
              <span className="stat-label">Всего задач</span>
              <strong>{w.tasks.length.toString().padStart(2, '0')}</strong>
            </div>
          </div>
          <div className="stat stat-pink">
            <span className="stat-icon">
              <Icon name="clock" />
            </span>
            <div>
              <span className="stat-label">В работе</span>
              <strong>{active.toString().padStart(2, '0')}</strong>
            </div>
          </div>
          <div className="stat stat-cyan">
            <span className="stat-icon">
              <Icon name="check" />
            </span>
            <div>
              <span className="stat-label">Выполнено</span>
              <strong>{completed.toString().padStart(2, '0')}</strong>
            </div>
          </div>
        </section>
        {!w.online && (
          <p className="notice" role="status">
            Нет подключения к интернету.{' '}
            {w.user
              ? 'Облачные изменения недоступны до восстановления связи.'
              : 'Локальные задачи работают без сети, пока страница открыта.'}
          </p>
        )}
        {w.user && w.importCount > 0 && (
          <aside className="import-panel" aria-label="Перенос локальных задач">
            <div>
              <strong>На устройстве осталось задач: {w.importCount}</strong>
              <p>
                Можно скопировать их в этот аккаунт. Локальные оригиналы останутся на устройстве;
                повторное копирование не создаст дубликаты.
              </p>
            </div>
            <button
              className="secondary"
              disabled={w.disabled}
              onClick={() => void w.importLocal()}
            >
              Скопировать в аккаунт
            </button>
          </aside>
        )}
        {w.user && w.localError && (
          <p className="notice">Локальный список недоступен для копирования. {w.localError}</p>
        )}
        <div className="dashboard-grid">
          <section className="task-panel" aria-label="Список задач" aria-busy={w.busy || w.loading}>
            <div className="panel-heading">
              <div>
                <h2 id="task-heading" tabIndex={-1}>
                  {w.filter === 'all'
                    ? 'Мои задачи'
                    : w.filter === 'active'
                      ? 'В работе'
                      : 'Завершённые'}
                </h2>
                <p>
                  {w.filter === 'completed'
                    ? 'Каждая галочка — маленькая победа.'
                    : 'Всё важное — в одном месте.'}
                </p>
              </div>
              <span className="list-count">{visible.length}</span>
            </div>
            <form onSubmit={submit} className="form">
              <label htmlFor="new-task" className="sr-only">
                Новая задача
              </label>
              <input
                ref={input}
                id="new-task"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Что нужно сделать?"
                autoComplete="off"
                maxLength={300}
                disabled={w.disabled}
                required
              />
              <button className="add" disabled={w.disabled} type="submit">
                <Icon name="plus" />
                <span>Добавить</span>
              </button>
            </form>
            {w.error && (
              <p className="error" role="alert">
                {w.error}
              </p>
            )}
            <div className="list-header">
              <span>ЗАДАЧА</span>
              <span>ДЕЙСТВИЯ</span>
            </div>
            {w.loading ? (
              <div className="empty" role="status">
                Загружаем задачи…
              </div>
            ) : visible.length ? (
              <TaskList
                key={w.scope}
                tasks={visible}
                busy={w.disabled}
                onToggle={w.toggle}
                onDelete={w.remove}
                onUpdate={w.update}
                onAfterDelete={(index) => setFocusTarget({ scope: w.scope, kind: 'row', index })}
              />
            ) : (
              <div className="empty">
                <div className="empty-icon">
                  <Icon name={w.filter === 'active' && w.tasks.length ? 'check' : 'spark'} />
                </div>
                <h3>
                  {w.filter === 'completed'
                    ? 'Победы ещё впереди'
                    : w.filter === 'active' && w.tasks.length
                      ? 'Всё сделано!'
                      : 'Начнём с одной задачи?'}
                </h3>
                <p>
                  {w.filter === 'completed'
                    ? 'Отметь выполненную задачу галочкой.'
                    : w.filter === 'active' && w.tasks.length
                      ? 'Можно выдохнуть. Ты отлично справился.'
                      : 'Добавь первый план и освободи для него место.'}
                </p>
              </div>
            )}
            <div className="summary">
              <span>
                {w.tasks.length
                  ? `Осталось ${active} · выполнено ${completed} из ${w.tasks.length}`
                  : 'Твой следующий шаг начинается здесь.'}
              </span>
              <span className="save-state">{w.busy ? 'Сохраняем…' : w.storageLabel}</span>
            </div>
          </section>
          <aside className="right-column" aria-label="Прогресс и хранение">
            <section className="progress-panel">
              <div className="small-heading">
                <span>ТВОЙ ПРОГРЕСС</span>
                <Icon name="spark" />
              </div>
              <div className="progress-value">
                {percent}
                <span>%</span>
              </div>
              <p>
                {w.tasks.length && completed === w.tasks.length
                  ? 'Все задачи выполнены. Отличная работа!'
                  : w.tasks.length
                    ? 'Каждая выполненная задача — шаг вперёд.'
                    : 'Добавь задачу, чтобы начать движение.'}
              </p>
              <progress max="100" value={percent} aria-label="Доля выполненных задач">
                {percent}%
              </progress>
              <div className="progress-caption">
                <span>Выполнено</span>
                <strong>
                  {completed} / {w.tasks.length}
                </strong>
              </div>
            </section>
            <section className="sync-panel">
              <div className="sync-icon">
                <Icon name={w.user ? 'cloud' : 'device'} />
              </div>
              <h2>{w.user ? 'Твои планы с тобой' : 'Планы без границ'}</h2>
              <p>
                {w.user
                  ? 'Войди в тот же аккаунт на другом устройстве, чтобы открыть свой список.'
                  : 'Можно пользоваться без регистрации. Вход через Google добавит синхронизацию между устройствами.'}
              </p>
              {w.user ? (
                <p className="sync-note">
                  Локальный список остаётся отдельным, пока ты сам не скопируешь его в аккаунт.
                </p>
              ) : (
                <button
                  className="text-action"
                  disabled={w.busy || !w.authReady || !firebaseReady || !w.online}
                  onClick={() => void w.signIn()}
                  aria-label="Подключить облачный список"
                >
                  Подключить <Icon name="arrow" />
                </button>
              )}
              {!firebaseReady && (
                <p className="sync-note">
                  Облачный вход не настроен. Основные функции доступны без него.
                </p>
              )}
            </section>
          </aside>
        </div>
        <footer>
          <span>Меньше суеты. Больше сделанного.</span>
          <span className="footer-brand">
            Мой день <span aria-hidden="true">✦</span>
          </span>
        </footer>
        <div className="sr-only" role="status" aria-live="polite">
          {w.status}
        </div>
      </main>
      {w.undo && (
        <UndoNotice
          busy={w.disabled}
          onUndo={w.restore}
          onDismiss={w.dismissUndo}
          onRestoreFocus={focusInput}
        />
      )}
    </div>
  );
}
