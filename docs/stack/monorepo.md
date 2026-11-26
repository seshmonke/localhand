# Монорепозиторий

```text
apps/
  web/        React 19 + Vite 8 + Tailwind 4 + Base UI
  api/        Fastify 5 + Drizzle + PostgreSQL + pg-boss
packages/
  shared/     Zod-контракты, доменные типы, общие правила
  ui/         Base UI + shadcn-подход, общие компоненты
docs/         продукт, стек, дизайн, юрконтекст, задачи
openspec/     поведение: specs и changes
.scrum/       состояние Scrum-команды
```

`packages/shared` собирается в `dist` (`tsc`), потому что API исполняет
его в Node. `packages/ui` отдаёт исходники — их компилирует Vite.
`pnpm -r build/typecheck` идут в топологическом порядке: shared раньше
зависящих пакетов.

Правила импортов:
- общие контракты — только из `@localhand/shared`;
- общие компоненты — только из `@localhand/ui`;
- приложение не импортирует чужие `apps/*` напрямую.
