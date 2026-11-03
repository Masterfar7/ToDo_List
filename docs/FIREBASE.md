# Firebase: настройка и безопасная публикация

Для проекта выбран Firebase Hosting (classic), Authentication с Google и Cloud Firestore. App Hosting, Cloud Functions, SQL Connect и платёжный аккаунт для этого приложения не нужны.

## Для проекта todo-d0d24

1. В консоли Firebase → Authentication → Sign-in method должен быть включён Google и выбран support email.
2. В Authentication → Settings → Authorized domains проверь `todo-d0d24.web.app` и `todo-d0d24.firebaseapp.com`. Для локальной разработки добавь `localhost`, если его нет.
3. База Firestore должна иметь ID `(default)`. Пользователь создал её в `europe-north1`; регион не следует пытаться менять.
4. В `.env.local` используются четыре значения: apiKey, authDomain, projectId, appId. Они попадают в публичную сборку по назначению Firebase SDK. Не помещай сюда private key, service account или OAuth refresh token.
5. Выполни сборку и публикацию из папки проекта:

```powershell
npm.cmd ci
npm.cmd run build
npx.cmd firebase-tools login
npx.cmd firebase-tools deploy --project todo-d0d24 --only "hosting,firestore:rules"
```

Для готовой неизменённой папки `dist` первые две команды не нужны. CLI покажет Hosting URL и подтверждение развёртывания.

## Почему обновляются правила

Восстановление и импорт могут создавать задачу с `completed: true`. Это допустимо только в личном пространстве владельца. Остальные ограничения сохраняются: аутентификация, собственный UID, точный набор полей, типы, непустой текст до 300 символов, серверные временные метки. Чужие и анонимные обращения запрещены.

## Если вход не работает

- `unauthorized-domain`: проверь Authorized domains именно для открытого адреса.
- `operation-not-allowed`: включи Google-провайдер.
- Блокировка popup: разреши всплывающее окно для сайта. Пароль вводится только на странице Google.
- `permission-denied`: обнови `firestore.rules` вместе с текущим релизом, проверь вход и путь `/users/{uid}/tasks`.
- Ошибка сети: проверь доступность Google/Firebase в целевой сети. Это нельзя исправить одним CSS или изменением региона базы.

## Официальные источники

- https://firebase.google.com/docs/hosting/quickstart
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/firestore/security/get-started
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
