# GitHub Review Inbox

Menu-bar инбокс для code review: показывает только те PRы, которые сейчас ждут
твоего действия, и прячет те, где ты ждёшь других.

## Настройка

1. Зарегистрируй OAuth App на https://github.com/settings/developers
   и включи у него **Device Flow**.
2. Скопируй `.env.example` в `.env` и вставь Client ID.
3. `npm install`
4. `npm run dev`

## Сборка

```bash
npm run dist
```

Сборка не подписана, поэтому при первом запуске: правый клик по `.app` в
Finder → Open → Open.

## Разработка

- `npm test` — юнит-тесты (вся логика классификации в `src/core/`)
- `npm run typecheck` — проверка типов

Спека: `docs/superpowers/specs/2026-08-31-github-review-inbox-design.md`
