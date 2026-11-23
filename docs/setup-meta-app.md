# Приложение Meta: Facebook, Instagram, Threads и Meta Ads

Одно приложение Meta даёт дашборду три вещи: вход клиента в Facebook/Instagram, вход клиента в Threads и токен для статистики Meta Ads.
Клиент подключает соцсети сам по ссылке `/connect/<token>` (блок «Соцсети проекта» в разделе SMM).

## 1. Создать приложение

1. https://developers.facebook.com/apps → «Создать приложение», привязать к нашему Business Manager.
2. Добавить сценарии (названия в кабинете Meta могут немного отличаться):
   - «Access the Threads API»;
   - «Manage everything on your Page» (страницы Facebook);
   - «Manage messaging & content on Instagram» — вариант **с входом через Facebook** (Instagram API with Facebook Login);
   - Marketing API — для статистики рекламы.

## 2. Адреса возврата

- Facebook Login → Settings → Valid OAuth Redirect URIs:
  `https://profitad-dashboard-2.vercel.app/api/connect/meta/callback`
- Threads → Settings → Redirect Callback URLs:
  `https://profitad-dashboard-2.vercel.app/api/connect/threads/callback`

Если у дашборда появится свой домен — задать `APP_URL` в Vercel и добавить оба адреса с новым доменом.

## 3. Ключи в Vercel (Production)

| Переменная | Где взять |
| --- | --- |
| `META_APP_ID`, `META_APP_SECRET` | App settings → Basic |
| `THREADS_APP_ID`, `THREADS_APP_SECRET` | Use cases → Threads → Settings (у Threads свои ID и секрет) |
| `META_SYSTEM_USER_TOKEN`, `META_BUSINESS_ID` | Business settings → System users → токен с правом `ads_read` (для Meta Ads) |

`TOKEN_ENCRYPTION_KEY` уже задан: им шифруются ключи доступа клиентов. После добавления переменных нужен новый деплой.

## 4. Кого пускает приложение без проверки Meta

Пока приложение не прошло App Review, войти могут только люди с ролью в нём.

- **Threads.** App roles → Roles → Add People → Threads Tester, указать аккаунт Threads клиента. Клиент принимает приглашение:
  Threads → Настройки → Аккаунт → Разрешения для сайтов → Приглашения. После этого ссылка работает.
- **Facebook и Instagram.** Профиль Facebook клиента (тот, что управляет страницей) нужно добавить как Tester в App roles; клиент
  принимает приглашение на developers.facebook.com — для этого Meta попросит его бесплатно зарегистрироваться как разработчик.
  Чтобы обойтись без этого шага для всех клиентов, приложение надо провести через App Review (Advanced Access) и Business Verification.

Права, которые запрашивает дашборд: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`, `instagram_basic`,
`instagram_content_publish`, `instagram_manage_insights`, `business_management`; для Threads — `threads_basic`,
`threads_content_publish`, `threads_manage_insights`.

## 5. Facebook и Instagram без входа — из Business Manager

Основной способ для Facebook и Instagram: кнопка «Выбрать из Business Manager» в блоке «Соцсети проекта». Дашборд читает страницы
как системный пользователь нашего БМ (`META_SYSTEM_USER_TOKEN`), в проекте отмечаются нужные галочками. Никто никуда не входит,
доступ не зависит от личного профиля.

1. Клиент даёт нашему БМ партнёрский доступ к странице Facebook (Instagram должен быть привязан к ней и быть бизнес-аккаунтом
   или аккаунтом автора).
2. В БМ: Системные пользователи → наш пользователь → «Назначить объекты» → Страницы → отметить страницы клиентов (контент и
   статистика).
3. Токен системного пользователя должен быть выпущен с правами `ads_read`, `read_insights`, `pages_show_list`,
   `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`. Если токен выпускали только под рекламу —
   сгенерировать новый и заменить `META_SYSTEM_USER_TOKEN` в Vercel, затем Redeploy.

Ссылка для клиента остаётся для Threads (у него нет доступа через БМ) и на случай, когда клиент не может дать партнёрский доступ.

## 6. Как это хранится

Таблица `social_connections`: одна строка на страницу Facebook, аккаунт Instagram или аккаунт Threads. Ключи страниц Facebook
(ими же читается Instagram) не истекают; ключ Threads живёт 60 дней и продлевается ежедневным кроном. Если продление не удалось,
аккаунт помечается «нужно подключить заново» — клиент проходит по той же ссылке ещё раз.
