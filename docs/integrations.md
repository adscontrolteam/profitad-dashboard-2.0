# Подключение рекламы и соцсетей — план

Сейчас вкладки «Реклама» и «SMM» работают в демо-режиме: цифры генерируются, а черновики, кампании, креативы и расписание
хранятся в браузере (localStorage). Исключение — аналитика рекламы: если синк уже записал строки в `ad_metrics_daily`,
показываются реальные данные.

## Общая схема

```
Админ → «Подключения» проекта → OAuth соцсети/кабинета → токен (зашифрован) в БД
                                                         │
Vercel Cron / очередь ──► /api/sync/*  ──► *_metrics_daily ──► revalidateTag(project) ──► дашборд
Кнопка «Опубликовать» ──► server action ──► social_posts(status) ──► воркер публикации ──► API соцсети
```

- **Токены** — только через официальный OAuth, в таблице `connections` (project_id, provider, external_id, handle,
  access/refresh token зашифрованы AES-GCM ключом из env, expires_at, scopes). Паролей в дашборде нет.
- **Медиа** (видео/фото креативов и постов) — Vercel Blob: Instagram, Threads, TikTok и Facebook забирают файл по публичному URL.
- **Отложенный постинг** — Upstash QStash (доставляет задачу точно в нужное время) или Vercel Cron раз в минуту (нужен план Pro).
  Facebook умеет нативно (`scheduled_publish_time`), остальным нужен свой планировщик.
- **Права** уже готовы: `canManageAds` / `canPublishContent` проверяются в server actions, не только в UI.

## Новые таблицы

| Таблица | Зачем |
|---|---|
| `connections` | подключённые кабинеты и аккаунты по проектам |
| `social_posts` | черновики, расписание, статус и ошибка публикации, id поста в соцсети |
| `social_metrics_daily` | просмотры/лайки/комменты/подписчики по дням и аккаунтам |
| `social_post_metrics` | метрики отдельных публикаций (блок «Что заходит») |
| `creatives` | библиотека креативов (blob URL, формат, статус, тексты) |
| `campaign_drafts` | собранные кампании, id созданных объектов в кабинете |

`ad_metrics_daily` уже есть — реклама просто начинает в неё писать.

## Платформы

| Платформа | API и доступы | На что обратить внимание |
|---|---|---|
| **Meta Ads** | Marketing API. Приложение Meta (Business) + System User в Business Manager: `ads_read`, `ads_management`, `business_management` | Чтение: `/act_{id}/insights?level=campaign&time_increment=1`. Создание: campaign → adset → adcreative → ad, сначала в статусе PAUSED, «Запустить» = ACTIVE. Для `ads_management` нужен App Review (Advanced Access) |
| **Google Ads** | Google Ads API: developer token (заявка на Basic access), OAuth-клиент, MCC-аккаунт | Метрики через GAQL. Создание начать с Search; Performance Max сложнее (asset groups) |
| **Instagram** | Instagram API с Instagram Login: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights` | Только Business/Creator-аккаунты. Публикация: media container → `media_publish`. Лимит 100 постов за 24 часа |
| **Facebook** | Pages API: `pages_manage_posts`, `pages_read_engagement`, `read_insights` | Есть нативное отложенное размещение |
| **Threads** | Threads API: `threads_basic`, `threads_content_publish`, `threads_manage_insights` | Тред = цепочка постов через `reply_to_id`, до 500 символов в каждом — редактор уже так устроен |
| **TikTok** | Content Posting API (`video.publish`) + Display API (`video.list`, `user.info.stats`) | Пока приложение не прошло аудит, публикации видны только автору (приватные) |
| **YouTube Shorts** | YouTube Data API v3 (`youtube.upload`) + YouTube Analytics API | Квота 10 000 единиц в день, загрузка = 1 600 (около 6 видео в день) — подать на увеличение. До верификации приложения загрузки приватные |

Instagram, Facebook, Threads и Meta Ads можно вести через **одно приложение Meta** — одна проверка вместо четырёх.

### Быстрый путь для постинга

Чтобы не проходить проверки в 5 соцсетях до запуска, публикацию можно временно вести через агрегатор (Postiz self-hosted,
Ayrshare, Late): одно API для всех сетей, их приложения уже проверены. Дашборд отправляет пост агрегатору, а сам хранит
статусы. Потом его можно заменить прямыми API, не меняя интерфейс.

## Порядок работ

1. **Таблицы и перенос из localStorage в БД** — черновики, расписание и креативы станут общими для команды. Без внешних API.
2. **Приложение Meta + страница «Подключения»** — OAuth, аналитика рекламы Meta, аналитика IG/FB/Threads.
3. **Постинг в Threads / Instagram / Facebook** + планировщик (QStash) + Blob для медиа.
4. **Google Ads** — сначала аналитика, потом создание Search-кампаний.
5. **TikTok и YouTube** — аналитика и публикация (параллельно подаём на аудит).
6. **Создание кампаний в Meta** из конструктора + пауза и включение из таблицы кампаний.
7. **AI-агенты** (тексты, треды, монтаж) — через Claude API, с примерами голоса бренда по каждому проекту.

С вашей стороны для шагов 2–5 понадобятся: доступ к Business Manager (создать приложение и System User), developer token
Google Ads, аккаунты разработчика TikTok и Google Cloud. Ключи кладутся в Vercel env, в код не попадают.
