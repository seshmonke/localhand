# GitHub: репозиторий, защита main, ревью

Репозиторий: **публичный**, https://github.com/seshmonke/localhand.
Правила публичности — `docs/quality/public-repo.md`.

## Защита main

Включена 27.11.2026:

- только через pull request; прямой push запрещён;
- обязательные checks: `verify`, `review-gate`;
- ветка должна быть актуальной (`strict`);
- линейная история; squash-merge;
- force push и удаление ветки запрещены;
- обсуждение должно быть закрыто;
- правила применяются и к админу (`enforce_admins`);
- 0 обязательных GitHub-approvals: у соло-аккаунта нет второго
  ревьюера; вместо этого label `reviewed` + `review-gate`.

## Ревью

1. Ветка `task/<номер>-<краткое>` или `docs/<краткое>`.
2. PR по шаблону, `pnpm verify` в описании.
3. Ревьюер — не автор (человек или агент-ревьюер).
4. После ревью — label `reviewed`; `review-gate` зелёный.
5. Squash-merge, ветка удаляется.
6. `main` всегда зелёный и деплоабельный.

## Безопасность публичного репо

- GitHub secret scanning — enabled.
- Secret scanning push protection — enabled.
- `pnpm check:public` в `verify`: запрещённые файлы, ключи, токены,
  телефоны, email, абсолютные пути.
- Dependabot config: npm и GitHub Actions, weekly.
- Dependabot alerts/security updates — включены настолько, насколько
  позволяет GitHub Free; dependency graph API для репозитория пока
  отдаёт 403, dependency-review workflow убран до доступности.
- Секреты — только в локальном `.env` и GitHub Secrets, никогда в git.

## Bootstrap

Первый push в `main` был сделан до включения защиты (создание
репозитория). После 27.11.2026 прямой push невозможен; проверено
`GH006`.

## Инцидент с секретом

См. `docs/quality/public-repo.md`: ротация → удаление из истории только
с разрешения владельца → проверка логов → запись инцидента без секрета.
