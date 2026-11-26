# Хостинг v1

Решение 2026-11-27: **Selectel**, минимальный набор.

## Состав

| Компонент | Что | Зачем |
|---|---|---|
| Облачный сервер | 2 vCPU, 4 ГБ RAM, 40–60 ГБ NVMe, Ubuntu 24.04 LTS | Caddy + web + api + PostgreSQL в Docker Compose |
| S3 | `localhand-media`, `localhand-backups` | Фото товаров, цифровые файлы, шифрованные бэкапы БД |
| Token Factory | `deepseek-v4.1-flash-1017` | AI-агент, оплата за токены |
| DNS | регистратор или Selectel DNS | Домен, A-запись на VM |
| TLS | Caddy + Let's Encrypt | HTTPS автоматически |

Managed PostgreSQL, Redis, Kubernetes, балансировщик, CDN и отдельный
worker-сервер в v1 **не входят**. PostgreSQL — контейнер на той же VM,
фоновые задачи — pg-boss в процессе API.

## Docker Compose

```text
caddy   :80/:443   — TLS, reverse proxy
web     :8080      — собранный Vite SPA + статика
api     :3000      — Fastify
db      :5432      — PostgreSQL 18, volume pgdata
```

Caddy проксирует `/api/*` на `api`, остальное — на `web`. Один origin,
без CORS в проде.

## Бэкапы

- Nightly `pg_dump` по cron/systemd timer.
- Шифрование GPG (AES256) перед загрузкой в S3.
- Retention: 7 дневных + 4 недельных.
- Weekly restore-check: развернуть последний дамп в чистую БД и проверить
  ключевые таблицы.
- Бэкап на том же диске, что и БД, бэкапом не считается: только S3.

## CI/CD

- GitHub Actions: `pnpm verify`.
- Образы web/api в GHCR по SHA и `latest`.
- Деплой по SSH на VM: `git pull --ff-only` + `docker compose pull && up -d`.
- Секреты GitHub Actions: `VM_HOST`, `VM_USER`, `VM_SSH_KEY`.
- На VM — `.env` с секретами, права `600`, не в git.
- После деплоя — smoke `/api/health` и проверка, что отдаётся HTML
  лендинга.

## Мониторинг

- `/api/health` — статус API.
- Внешний uptime-check (Selectel monitoring или UptimeRobot) на `/` и
  `/api/health`.
- Логи контейнеров + `docker compose logs`; отдельный Loki/ELK — позже.
- Алерт владельцу в Telegram при падении health > 2 минут.

## Стоимость (ориентир)

- VM: ~700–1 500 ₽/мес.
- S3: ~100–300 ₽/мес на старте.
- Token Factory: по факту токенов.
- Домен: ~100–300 ₽/год.

Точные суммы — калькулятор Selectel после выбора конфигурации.

## Путь роста

1. Managed PostgreSQL с репликой и SLA 99,99% — когда заказы/данные
   станут критичнее стоимости.
2. Отдельный worker/VM — когда pg-boss начнёт мешать API.
3. CDN и WAF — при росте трафика/атак.
4. Второй провайдер для бэкапов — для независимости от Selectel.

## Почему не Hostkey

Hostkey — рабочий вариант для VPS/выделенных серверов и GPU, но
managed PostgreSQL, S3 и Token Factory в Selectel дают меньше
администрирования и один договор. Hostkey остаётся запасным вариантом,
если понадобится сырое железо или GPU.

## Источники

- [Selectel: облачные серверы](https://selectel.ru/services/cloud/servers/)
- [Selectel: Managed PostgreSQL](https://selectel.ru/services/cloud/managed-databases/postgresql/)
- [Selectel: S3](https://selectel.ru/services/cloud/storage/)
- [Selectel: Token Factory](https://selectel.ru/services/token-factory/)
- [Hostkey: VPS](https://hostkey.ru/vps/)
- [Hostkey: S3](https://hostkey.ru/services/s3-object-storage/)
- [Timeweb Cloud: VPS](https://timeweb.cloud/services/vds-vps)
