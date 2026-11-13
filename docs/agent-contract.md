# Контракт: проекты дашборда → клиенты агента

Дата: 13.11.2026. Решение владельца: **новый проект заводится в дашборде («Вводные»), а не в Telegram.**
Дашборд — единственный источник правды о проекте. Агент (`adscontrolteam/profitad_mediabuying`) читает проекты
из Postgres дашборда и сам создаёт и обновляет у себя клиентов. Обратно агент в `projects` не пишет.

## Что читать

Роль `bot_sync` уже имеет `SELECT` на `projects`, включая новые колонки (проверено `has_column_privilege`).

```sql
SELECT id, name, status, goal, notes, kpis, sources,
       lead_actions, currency, budget_month, agent_daily_report,
       smm_email, media_buyer_email, updated_at
FROM projects;
```

Опрос: при старте бота и раз в 10 минут. Достаточно сравнивать `updated_at` с тем, что уже видели.

## Как раскладывать в `clients`

Новая колонка у агента: `clients.dashboard_project_id TEXT UNIQUE`.

| Поле клиента | Откуда |
|---|---|
| `name` | `projects.name` |
| `customer_id` | `sources[platform="google"].accountId` (только цифры) |
| `meta_ad_account_id` | `sources[platform="meta"].accountId` (без `act_`) |
| `currency` | `projects.currency`, если пусто — `USD` |
| `brief` | `projects.notes` |
| `kpi` | `projects.goal` (свободный текст цели) |
| `target_cpa` | `kpis[0].cpaPlan` |
| `leads_target` | `kpis[i].plan` для `metric = "leads"` |
| `budget_month` | `projects.budget_month` |
| `lead_actions` | `projects.lead_actions` (jsonb-массив названий конверсий) → строка через «, » |
| `daily_report` | `projects.agent_daily_report` |
| `status` | `archived` → закрыт (не вести, в отчёты не включать); `paused` → пауза; остальное → `active` |

Агент сам ведёт поля, которых в дашборде пока нет: `meta_page_id`, `meta_instagram_id`, память, историю чатов.
Синк их не трогает.

## Сопоставление с уже существующими клиентами

По порядку: `dashboard_project_id` → `customer_id` → `meta_ad_account_id` → имя без регистра и пробелов. После первого
совпадения записать `dashboard_project_id`, дальше только по нему.

На 13.11.2026 соответствие такое:

| Клиент агента | Проект дашборда |
|---|---|
| LexDixit | `lex-dixit` |
| Credyt Is | `credyt-is` |
| — | `recruitment` (XMARAI, Google `4175376870`, новый клиент) |
| Esc.Minks | нет в дашборде — ждёт решения владельца |
| BoostCore | нет в дашборде, закрыт 30.09 |

Данные LexDixit и Credyt Is (что считать заявкой, цель, бюджет, валюта, бриф, ID Meta) уже перенесены в дашборд.
Синк ничего не потеряет.

Клиентов агента без проекта в дашборде не удалять, а пометить в логе. Их судьбу решает владелец.

## Что меняется в боте

- `/new` больше не создаёт клиента. Ответ: «Проекты заводятся в дашборде: https://profitad-dashboard-2.vercel.app/inputs».
  Через несколько минут после сохранения проект появится в `/clients`.
- Поля из таблицы выше правятся только в дашборде. Если в чате попросят их поменять (цель, CPA, бюджет, «что считать
  заявкой»), агент отвечает ссылкой на «Вводные» и не меняет локально: следующий синк всё равно перезапишет.
- Выгрузка в `ad_metrics_daily` не меняется.

## Инварианты

1. Колонки `projects` из запроса выше не переименовываются и не удаляются без предупреждения команды агентов.
2. `lead_actions` — массив строк с точными названиями конверсий Google Ads. Дашборд берёт их списком из API кабинета.
3. `kpis[0]` — главный результат проекта.
