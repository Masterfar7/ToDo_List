import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { validateText, type Task } from '../domain/tasks';
import { Icon } from './Icon';
type Props = {
  tasks: Task[];
  busy: boolean;
  onToggle: (task: Task) => Promise<boolean>;
  onDelete: (task: Task) => Promise<boolean>;
  onUpdate: (task: Task, text: string) => Promise<boolean>;
  onAfterDelete: (index: number) => void;
};
function TaskRow({
  task,
  busy,
  onToggle,
  onDelete,
  onUpdate,
  onDeleted,
}: Omit<Props, 'tasks' | 'onAfterDelete'> & { task: Task; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const [error, setError] = useState('');
  const [optimisticCompleted, setOptimisticCompleted] = useState<boolean | null>(null);
  const restoreFocus = useRef(false);
  const checked = optimisticCompleted ?? task.completed;
  useEffect(() => setOptimisticCompleted(null), [task.completed]);
  const id = useId();
  const editButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!editing && !busy && restoreFocus.current) {
      editButton.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing, busy]);
  function close() {
    restoreFocus.current = true;
    setEditing(false);
    setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    let text: string;
    try {
      text = validateText(draft);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (await onUpdate(task, text)) close();
  }
  return (
    <li
      className={`task ${checked ? 'completed' : ''} ${editing ? 'editing' : ''}`}
      data-task-id={task.id}
    >
      {editing ? (
        <form
          className="edit-form"
          onSubmit={save}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !busy) {
              e.preventDefault();
              close();
            }
          }}
        >
          <label className="sr-only" htmlFor={id}>
            Изменить текст задачи
          </label>
          <input
            id={id}
            value={draft}
            maxLength={300}
            onChange={(e) => {
              setDraft(e.target.value);
              setError('');
            }}
            disabled={busy}
            autoFocus
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <div className="edit-actions">
            <span className="edit-help">Enter — сохранить · Esc — отменить</span>
            <button className="secondary" type="button" disabled={busy} onClick={close}>
              Отмена
            </button>
            <button className="add" type="submit" disabled={busy}>
              Сохранить
            </button>
          </div>
          {error && (
            <p id={`${id}-error`} className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={checked}
              disabled={busy}
              onChange={async (e) => {
                setOptimisticCompleted(e.target.checked);
                if (!(await onToggle(task))) setOptimisticCompleted(null);
              }}
              aria-label={`Выполнено: ${task.text}`}
            />
          </label>
          <span className="task-text">{task.text}</span>
          <div className="task-actions">
            <button
              ref={editButton}
              type="button"
              className="icon-button edit-button"
              disabled={busy}
              aria-label={`Редактировать: ${task.text}`}
              title="Редактировать задачу"
              onClick={() => {
                setDraft(task.text);
                setEditing(true);
              }}
            >
              <Icon name="edit" />
            </button>
            <button
              type="button"
              className="icon-button delete"
              disabled={busy}
              aria-label={`Удалить: ${task.text}`}
              title="Удалить задачу"
              onClick={async () => {
                if (await onDelete(task)) onDeleted();
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
        </>
      )}
    </li>
  );
}
export function TaskList(props: Props) {
  return (
    <ul className="tasks" aria-label="Задачи">
      {props.tasks.map((task, index) => (
        <TaskRow
          key={task.id}
          task={task}
          busy={props.busy}
          onToggle={props.onToggle}
          onDelete={props.onDelete}
          onUpdate={props.onUpdate}
          onDeleted={() => props.onAfterDelete(index)}
        />
      ))}
    </ul>
  );
}
