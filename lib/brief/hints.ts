import type { BriefLang } from "./questions";

/**
 * What to write in each answer field: shown as the field's placeholder instead of a generic «Ваш ответ».
 * Each hint names the facts we need and the shape of a good answer, so the client does not have to guess.
 */
export const BRIEF_HINTS: Record<string, Record<BriefLang, string>> = {
  // Business and goals
  biz_about: {
    ru: "Одной-двумя фразами: что продаёте и кому, с какого года работаете, в каких странах и на каких языках. Например: «Юридические услуги для экспатов в Испании, с 2018 года, русский и украинский».",
    uk: "Однією-двома фразами: що продаєте і кому, з якого року працюєте, у яких країнах і якими мовами. Наприклад: «Юридичні послуги для експатів в Іспанії, з 2018 року, українська та російська».",
    en: "In a sentence or two: what you sell and to whom, since which year, in which countries and languages. E.g. “Legal services for expats in Spain, since 2018, Ukrainian and Russian”.",
  },
  biz_goal: {
    ru: "Выберите одну главную цель и напишите, зачем она сейчас. Например: «Заявки на консультацию — нужно загрузить двух новых юристов».",
    uk: "Оберіть одну головну ціль і напишіть, навіщо вона зараз. Наприклад: «Заявки на консультацію — треба завантажити двох нових юристів».",
    en: "Pick one main goal and say why it matters now. E.g. “Consultation requests — we need to fill the schedule of two new lawyers”.",
  },
  biz_target: {
    ru: "Два числа в месяц: сколько заявок и сколько продаж. Если знаете, добавьте, сколько готовы платить за одну заявку или одного клиента.",
    uk: "Два числа на місяць: скільки заявок і скільки продажів. Якщо знаєте, додайте, скільки готові платити за одну заявку чи одного клієнта.",
    en: "Two numbers per month: how many leads and how many sales. If you know it, add how much you are ready to pay per lead or per client.",
  },
  biz_capacity: {
    ru: "Потолок, после которого качество обработки падает. Например: «Менеджер один, успевает 5 заявок в день; больше 40 новых клиентов в месяц не возьмём».",
    uk: "Стеля, після якої якість обробки падає. Наприклад: «Менеджер один, встигає 5 заявок на день; більше 40 нових клієнтів на місяць не візьмемо».",
    en: "The ceiling after which handling quality drops. E.g. “One manager, 5 leads a day; we cannot take more than 40 new clients a month”.",
  },
  biz_budget: {
    ru: "Сумма в месяц и валюта, без нашей оплаты. Отдельно — в какие месяцы спрос выше и ниже. Например: «1 500 € в месяц; пик в сентябре–ноябре, спад в августе».",
    uk: "Сума на місяць і валюта, без нашої оплати. Окремо — у які місяці попит вищий і нижчий. Наприклад: «1 500 € на місяць; пік у вересні–листопаді, спад у серпні».",
    en: "Monthly amount and currency, excluding our fee. Separately, the months when demand is higher and lower. E.g. “€1,500 a month; peak in Sep–Nov, low in August”.",
  },
  biz_history: {
    ru: "По каждому каналу: когда запускали, сколько тратили, что получили и почему остановили. И можете ли дать доступ к старым кабинетам Google Ads или Meta.",
    uk: "По кожному каналу: коли запускали, скільки витрачали, що отримали і чому зупинили. І чи можете дати доступ до старих кабінетів Google Ads або Meta.",
    en: "For each channel: when it ran, how much you spent, what you got and why you stopped. And whether you can give access to the old Google Ads or Meta accounts.",
  },

  // Product
  prod_focus: {
    ru: "Список из 1–3 услуг или продуктов по важности. У каждого — примерная маржа или пометка «самый выгодный».",
    uk: "Список із 1–3 послуг або продуктів за важливістю. Біля кожного — приблизна маржа або позначка «найвигідніший».",
    en: "A list of 1–3 services or products in order of priority, each with its rough margin or a note “most profitable”.",
  },
  prod_value: {
    ru: "По каждому продукту — что входит и какой результат на выходе. Например: «Пакет „ВНЖ под ключ“: подготовка документов, подача, сопровождение до карты резидента».",
    uk: "По кожному продукту — що входить і який результат на виході. Наприклад: «Пакет „ВНП під ключ“: підготовка документів, подача, супровід до картки резидента».",
    en: "For each product: what is included and the result at the end. E.g. “Residence permit package: paperwork, filing, support until the resident card is issued”.",
  },
  prod_price: {
    ru: "Цены по каждому продукту или пакету и что делает цену выше: срочность, объём, сложность. Можно вставить ссылку на прайс.",
    uk: "Ціни по кожному продукту чи пакету і що робить ціну вищою: терміновість, обсяг, складність. Можна вставити посилання на прайс.",
    en: "Prices for each product or package and what pushes the price up: urgency, volume, complexity. A link to the price list is fine.",
  },
  prod_entry: {
    ru: "Название первого шага, его цена и что человек получает. Например: «Консультация 30 минут, 50 €, засчитывается в стоимость услуги». Если нет — так и напишите.",
    uk: "Назва першого кроку, його ціна і що людина отримує. Наприклад: «Консультація 30 хвилин, 50 €, зараховується у вартість послуги». Якщо немає — так і напишіть.",
    en: "The name of the first step, its price and what the person gets. E.g. “30-minute consultation, €50, deducted from the service price”. If there is none, say so.",
  },
  prod_quickwin: {
    ru: "Конкретный результат первого месяца, который можно пообещать и показать. Например: «За 2 недели получаем NIE» или «Первые 10 заявок в первую неделю».",
    uk: "Конкретний результат першого місяця, який можна пообіцяти й показати. Наприклад: «За 2 тижні отримуємо NIE» або «Перші 10 заявок за перший тиждень».",
    en: "A concrete first-month result we can promise and show. E.g. “NIE number in 2 weeks” or “the first 10 leads in week one”.",
  },
  prod_ltv: {
    ru: "Три числа: средний чек, сколько раз клиент покупает повторно и сколько приносит за всё время. Если не считали — напишите примерно.",
    uk: "Три числа: середній чек, скільки разів клієнт купує повторно і скільки приносить за весь час. Якщо не рахували — напишіть приблизно.",
    en: "Three numbers: average order value, how often a client buys again, and how much they bring over the whole relationship. A rough estimate is fine.",
  },
  prod_terms: {
    ru: "Срок от оплаты до результата, что гарантируете (возврат, повторная подача) и доля успешных дел. Например: «2–3 месяца, возврат при отказе, 94 % одобрений за 2025 год».",
    uk: "Строк від оплати до результату, що гарантуєте (повернення, повторна подача) і частка успішних справ. Наприклад: «2–3 місяці, повернення у разі відмови, 94 % схвалень за 2025 рік».",
    en: "Time from payment to result, what you guarantee (refund, re-filing) and your success rate. E.g. “2–3 months, refund if refused, 94% approvals in 2025”.",
  },
  prod_stop: {
    ru: "Списком: ниши, страны и типы клиентов, с которыми не работаете, и коротко почему. Это пойдёт в исключения рекламы.",
    uk: "Списком: ніші, країни й типи клієнтів, з якими не працюєте, і коротко чому. Це піде у винятки реклами.",
    en: "A list of niches, countries and client types you do not work with, and briefly why. This goes into the ad exclusions.",
  },
  prod_competitors: {
    ru: "3–5 ссылок на конкурентов и по каждому — чем вы лучше или чем отличаетесь: цена, срок, гарантия, специализация.",
    uk: "3–5 посилань на конкурентів і по кожному — чим ви кращі або чим відрізняєтесь: ціна, строк, гарантія, спеціалізація.",
    en: "3–5 links to competitors and, for each, how you are better or different: price, speed, guarantee, specialisation.",
  },

  // Audience
  aud_segments: {
    ru: "2–4 группы клиентов. По каждой: кто это, как часто покупают и какой чек. Например: «Айтишники-релоканты — 60 % заявок, чек 1 200 €».",
    uk: "2–4 групи клієнтів. По кожній: хто це, як часто купують і який чек. Наприклад: «Айтівці-релоканти — 60 % заявок, чек 1 200 €».",
    en: "2–4 client groups. For each: who they are, how often they buy and the order value. E.g. “Relocating IT specialists — 60% of leads, €1,200 per order”.",
  },
  aud_geo: {
    ru: "Страны и города, языки общения, возраст от и до, кем работают. Например: «Польша, Варшава и Краков; украинский и русский; 25–45; наёмные работники и ФОП».",
    uk: "Країни й міста, мови спілкування, вік від і до, ким працюють. Наприклад: «Польща, Варшава і Краків; українська й російська; 25–45; наймані працівники та ФОП».",
    en: "Countries and cities, languages, age range, occupation. E.g. “Poland, Warsaw and Kraków; Ukrainian and Russian; 25–45; employees and sole traders”.",
  },
  aud_pains: {
    ru: "Словами самих клиентов, 3–5 пунктов: что случилось и почему пришли именно сейчас. Например: «Пришёл отказ», «горят сроки», «боюсь штрафа».",
    uk: "Словами самих клієнтів, 3–5 пунктів: що сталося і чому прийшли саме зараз. Наприклад: «Прийшла відмова», «горять строки», «боюся штрафу».",
    en: "In the clients' own words, 3–5 points: what happened and why they came now. E.g. “I got a refusal”, “the deadline is close”, “I am afraid of a fine”.",
  },
  aud_fears: {
    ru: "Что останавливает перед покупкой, 3–5 пунктов. Например: «Уже обманули другие», «дорого», «не уверен, что получится», «можно сделать самому».",
    uk: "Що зупиняє перед покупкою, 3–5 пунктів. Наприклад: «Уже обманули інші», «дорого», «не впевнений, що вийде», «можна зробити самому».",
    en: "What stops people before buying, 3–5 points. E.g. “Others have cheated me”, “too expensive”, “not sure it will work”, “I can do it myself”.",
  },
  aud_objections: {
    ru: "Парами «возражение → ваш ответ». Например: «Дорого → оплата в два этапа, второй после результата».",
    uk: "Парами «заперечення → ваша відповідь». Наприклад: «Дорого → оплата у два етапи, другий після результату».",
    en: "As pairs “objection → your answer”. E.g. “Too expensive → payment in two stages, the second after the result”.",
  },
  aud_channels: {
    ru: "Конкретные места: названия групп и каналов, блогеры, сайты, запросы в поиске, мероприятия. Чем точнее, тем лучше таргетинг.",
    uk: "Конкретні місця: назви груп і каналів, блогери, сайти, запити в пошуку, заходи. Що точніше, то кращий таргетинг.",
    en: "Specific places: names of groups and channels, bloggers, sites, search queries, events. The more precise, the better the targeting.",
  },
  aud_solutions: {
    ru: "По каждому сегменту из первого вопроса раздела — какой продукт ему предлагаете и каким главным доводом.",
    uk: "По кожному сегменту з першого питання розділу — який продукт йому пропонуєте і яким головним аргументом.",
    en: "For each segment from the first question of this section: which product you offer it and the main argument.",
  },

  // Sales
  sales_who: {
    ru: "Кто отвечает на заявки, в какие дни и часы (с часовым поясом) и на каких языках. Например: «Менеджер Анна, пн–пт 9:00–18:00 по Варшаве, украинский и польский».",
    uk: "Хто відповідає на заявки, у які дні й години (з часовим поясом) і якими мовами. Наприклад: «Менеджерка Анна, пн–пт 9:00–18:00 за Варшавою, українська й польська».",
    en: "Who answers leads, on which days and hours (with time zone) and in which languages. E.g. “Anna, Mon–Fri 9:00–18:00 Warsaw time, Ukrainian and Polish”.",
  },
  sales_speed: {
    ru: "Через сколько минут или часов обычно отвечаете и каким способом. Что происходит с заявками, пришедшими ночью и в выходные.",
    uk: "Через скільки хвилин чи годин зазвичай відповідаєте і яким способом. Що відбувається із заявками, що прийшли вночі та у вихідні.",
    en: "How many minutes or hours it usually takes to reply and through which channel. What happens to leads that come at night and on weekends.",
  },
  sales_funnel: {
    ru: "Шаги по порядку. Например: «Заявка → звонок менеджера → консультация → договор → предоплата 50 % → работа → остаток».",
    uk: "Кроки по порядку. Наприклад: «Заявка → дзвінок менеджера → консультація → договір → передоплата 50 % → робота → залишок».",
    en: "The steps in order. E.g. “Lead → manager's call → consultation → contract → 50% prepayment → work → balance”.",
  },
  sales_cycle: {
    ru: "Обычный срок и самый длинный. Например: «Чаще 3–7 дней, корпоративные клиенты — до двух месяцев».",
    uk: "Звичайний строк і найдовший. Наприклад: «Частіше 3–7 днів, корпоративні клієнти — до двох місяців».",
    en: "The usual time and the longest. E.g. “Mostly 3–7 days, corporate clients up to two months”.",
  },
  sales_rate: {
    ru: "Число или оценка: из 10 заявок сколько становятся клиентами. Если знаете — отдельно по рекламе и по рекомендациям.",
    uk: "Число або оцінка: з 10 заявок скільки стають клієнтами. Якщо знаєте — окремо по рекламі та по рекомендаціях.",
    en: "A number or an estimate: out of 10 leads, how many become clients. If you know it, separately for ads and for referrals.",
  },
  sales_qualified: {
    ru: "Признаки целевой заявки и нецелевой. Например: «Целевая: живёт в Испании, бюджет от 500 €. Нецелевая: ищет работу, спрашивает бесплатную помощь».",
    uk: "Ознаки цільової заявки й нецільової. Наприклад: «Цільова: живе в Іспанії, бюджет від 500 €. Нецільова: шукає роботу, питає безкоштовну допомогу».",
    en: "Signs of a qualified lead and of an unqualified one. E.g. “Qualified: lives in Spain, budget from €500. Unqualified: looking for a job, asks for free help”.",
  },
  sales_tracking: {
    ru: "Название системы или ссылка на таблицу, кто вносит заявки, как быстро обновляются статусы и записывается ли сумма оплаты.",
    uk: "Назва системи або посилання на таблицю, хто вносить заявки, як швидко оновлюються статуси і чи записується сума оплати.",
    en: "The system's name or a link to the sheet, who enters leads, how quickly statuses are updated and whether the payment amount is recorded.",
  },

  // Technical
  tech_site: {
    ru: "Ссылки на сайт и посадочные страницы, на чём они собраны (WordPress, Tilda, свой код) и кто может быстро внести правку.",
    uk: "Посилання на сайт і посадкові сторінки, на чому вони зібрані (WordPress, Tilda, свій код) і хто може швидко внести правку.",
    en: "Links to the site and landing pages, what they are built on (WordPress, Tilda, custom code) and who can make a quick change.",
  },
  tech_analytics: {
    ru: "По каждому: есть или нет и кто настраивал. Если знаете — какие действия считаются конверсией: отправка формы, клик по WhatsApp, звонок.",
    uk: "По кожному: є чи немає і хто налаштовував. Якщо знаєте — які дії вважаються конверсією: відправка форми, клік по WhatsApp, дзвінок.",
    en: "For each: installed or not and who set it up. If you know, which actions count as a conversion: form submission, WhatsApp click, call.",
  },
  tech_crm: {
    ru: "Название CRM и тариф. Кто администратор и может ли он выдать ключ или вебхук для автоматической передачи заявок.",
    uk: "Назва CRM і тариф. Хто адміністратор і чи може він видати ключ або вебхук для автоматичної передачі заявок.",
    en: "The CRM's name and plan. Who the administrator is and whether they can issue a key or webhook to pass leads automatically.",
  },
  tech_leads: {
    ru: "Куда падает заявка после отправки формы и кто её видит первым. Например: «На почту info@…, менеджер проверяет раз в час».",
    uk: "Куди падає заявка після відправки форми і хто її бачить першим. Наприклад: «На пошту info@…, менеджер перевіряє раз на годину».",
    en: "Where a lead lands after the form is sent and who sees it first. E.g. “To info@…, the manager checks once an hour”.",
  },
  tech_ads: {
    ru: "По Google Ads и Meta отдельно: есть ли кабинет, его номер, на чью почту оформлен, были ли блокировки или отклонённые объявления и за что.",
    uk: "По Google Ads і Meta окремо: чи є кабінет, його номер, на чию пошту оформлений, чи були блокування або відхилені оголошення і за що.",
    en: "For Google Ads and Meta separately: whether an account exists, its ID, whose email owns it, any bans or rejected ads and the reason.",
  },
  tech_meta: {
    ru: "Ссылки на страницу Facebook и профиль Instagram, есть ли Business Manager и кто в нём администратор с полными правами.",
    uk: "Посилання на сторінку Facebook і профіль Instagram, чи є Business Manager і хто в ньому адміністратор із повними правами.",
    en: "Links to the Facebook page and Instagram profile, whether a Business Manager exists and who its full-rights administrator is.",
  },
  tech_domain: {
    ru: "Где куплен домен и хостинг и кто туда заходит. Выберите: дадите доступ нам или ваш специалист поставит коды по нашей инструкции.",
    uk: "Де куплений домен і хостинг і хто туди заходить. Оберіть: дасте доступ нам чи ваш фахівець поставить коди за нашою інструкцією.",
    en: "Where the domain and hosting are registered and who logs in there. Choose: you give us access, or your specialist installs the codes by our guide.",
  },
  tech_payment: {
    ru: "Один из четырёх вариантов и валюта карты. Нужны ли счета и акты для бухгалтерии. Сами данные карты сюда не пишите — передадите отдельно.",
    uk: "Один із чотирьох варіантів і валюта картки. Чи потрібні рахунки та акти для бухгалтерії. Самі дані картки сюди не пишіть — передасте окремо.",
    en: "One of the four options and the card's currency. Whether you need invoices for accounting. Do not write the card details here — you will pass them separately.",
  },

  // Content
  cont_cases: {
    ru: "2–5 историй по схеме: кто клиент → с чем пришёл → что сделали → результат в цифрах и за какой срок. Можно ссылками на отзывы.",
    uk: "2–5 історій за схемою: хто клієнт → з чим прийшов → що зробили → результат у цифрах і за який строк. Можна посиланнями на відгуки.",
    en: "2–5 stories in the form: who the client is → what they came with → what you did → the result in numbers and how long it took. Links to reviews are fine.",
  },
  cont_media: {
    ru: "Ссылка на папку с фото и видео или загрузите файлы ниже. Напишите, что есть: команда, офис, процесс работы, съёмки с клиентами.",
    uk: "Посилання на папку з фото й відео або завантажте файли нижче. Напишіть, що є: команда, офіс, процес роботи, зйомки з клієнтами.",
    en: "A link to a folder with photos and videos, or upload files below. Say what you have: team, office, work process, footage with clients.",
  },
  cont_brand: {
    ru: "Ссылка на логотип в хорошем качестве (SVG или PNG) и брендбук. Если брендбука нет — названия шрифтов и коды основных цветов.",
    uk: "Посилання на логотип у хорошій якості (SVG або PNG) і брендбук. Якщо брендбука немає — назви шрифтів і коди основних кольорів.",
    en: "A link to the logo in good quality (SVG or PNG) and the brand book. If there is no brand book, the font names and main colour codes.",
  },
  cont_proof: {
    ru: "Списком, что можете показать, со ссылками или файлами ниже. Отметьте, что можно публиковать в рекламе, а что только показывать клиенту лично.",
    uk: "Списком, що можете показати, з посиланнями або файлами нижче. Позначте, що можна публікувати в рекламі, а що лише показувати клієнту особисто.",
    en: "A list of what you can show, with links or files below. Mark what may be published in ads and what may only be shown to a client in person.",
  },
  cont_social: {
    ru: "Ссылки на все профили, кто их ведёт и сколько публикаций в неделю. Например: «Instagram @…, ведёт маркетолог, 3 поста и сторис каждый день».",
    uk: "Посилання на всі профілі, хто їх веде і скільки публікацій на тиждень. Наприклад: «Instagram @…, веде маркетолог, 3 пости та сторіс щодня».",
    en: "Links to all profiles, who runs them and how many posts a week. E.g. “Instagram @…, run by the marketer, 3 posts and stories daily”.",
  },
  cont_video: {
    ru: "Да или нет, кто готов сниматься и как часто. Например: «Да, основатель и два юриста, раз в две недели по часу».",
    uk: "Так чи ні, хто готовий зніматися і як часто. Наприклад: «Так, засновник і два юристи, раз на два тижні по годині».",
    en: "Yes or no, who is ready to be filmed and how often. E.g. “Yes, the founder and two lawyers, an hour every two weeks”.",
  },

  // Ads
  ads_qualify: {
    ru: "3–5 вопросов, которые менеджер задаёт первым делом, чтобы понять, ваш ли это клиент. Они пойдут в форму заявки или квиз.",
    uk: "3–5 запитань, які менеджер ставить насамперед, щоб зрозуміти, чи це ваш клієнт. Вони підуть у форму заявки або квіз.",
    en: "3–5 questions your manager asks first to tell whether this is your client. They will go into the lead form or quiz.",
  },
  ads_forbidden: {
    ru: "Списком: формулировки и обещания, которые запрещены. Например: «Нельзя писать „гарантия 100 %“, называть сроки решения госорганов, показывать лица клиентов».",
    uk: "Списком: формулювання й обіцянки, які заборонені. Наприклад: «Не можна писати „гарантія 100 %“, називати строки рішення держорганів, показувати обличчя клієнтів».",
    en: "A list of wordings and promises that are forbidden. E.g. “No ‘100% guarantee’, no government decision deadlines, no clients' faces”.",
  },
  ads_refs: {
    ru: "Ссылки на рекламу, сайты или квизы, которые вам нравятся, и что именно в них нравится. Можно и примеры «так точно не надо».",
    uk: "Посилання на рекламу, сайти або квізи, які вам подобаються, і що саме в них подобається. Можна й приклади «так точно не треба».",
    en: "Links to ads, sites or quizzes you like and what exactly you like in them. Examples of “definitely not like this” are welcome too.",
  },
  ads_offers: {
    ru: "Что можно предложить и до какой даты. Например: «Бесплатная первая консультация до конца месяца», «скидка 10 % при оплате сразу».",
    uk: "Що можна запропонувати і до якої дати. Наприклад: «Безкоштовна перша консультація до кінця місяця», «знижка 10 % за оплати одразу».",
    en: "What we can offer and until which date. E.g. “Free first consultation until the end of the month”, “10% off for upfront payment”.",
  },
  ads_geo: {
    ru: "Страны, регионы или города показа и языки объявлений. Отдельной строкой — где показывать нельзя и почему.",
    uk: "Країни, регіони або міста показу й мови оголошень. Окремим рядком — де показувати не можна і чому.",
    en: "Countries, regions or cities to show ads in and the ad languages. On a separate line, where not to show them and why.",
  },
  ads_tone: {
    ru: "Как вы говорите с клиентами. Например: «На „вы“, спокойно и по делу, без восклицаний и эмодзи». Пара фраз из вашей переписки поможет.",
    uk: "Як ви говорите з клієнтами. Наприклад: «На „ви“, спокійно і по суті, без вигуків та емодзі». Пара фраз із вашого листування допоможе.",
    en: "How you speak to clients. E.g. “Formal, calm and to the point, no exclamation marks or emoji”. A couple of lines from your own chats will help.",
  },

  // Working with us
  proc_contact: {
    ru: "Имя, должность и контакт человека для связи; кто даёт финальное «да» по креативам и за сколько дней отвечает.",
    uk: "Ім’я, посада й контакт людини для зв’язку; хто дає фінальне «так» по креативах і за скільки днів відповідає.",
    en: "Name, role and contact of the person to talk to; who gives the final “yes” on creatives and within how many days.",
  },
  proc_reports: {
    ru: "Формат и частота. Например: «Короткий отчёт в Telegram каждую пятницу и созвон раз в месяц».",
    uk: "Формат і частота. Наприклад: «Короткий звіт у Telegram щоп’ятниці та дзвінок раз на місяць».",
    en: "Format and frequency. E.g. “A short Telegram report every Friday and a call once a month”.",
  },
  proc_kpi: {
    ru: "1–3 цифры, по которым поймёте, что работа идёт хорошо. Например: «Не меньше 30 целевых заявок в месяц по цене до 25 €».",
    uk: "1–3 цифри, за якими зрозумієте, що робота йде добре. Наприклад: «Не менше 30 цільових заявок на місяць за ціною до 25 €».",
    en: "1–3 numbers that will tell you the work is going well. E.g. “At least 30 qualified leads a month at up to €25 each”.",
  },
  proc_other: {
    ru: "Всё, о чём мы не спросили: планы на год, изменения в компании, неудачный опыт с подрядчиками, пожелания к работе.",
    uk: "Усе, про що ми не запитали: плани на рік, зміни в компанії, невдалий досвід із підрядниками, побажання до роботи.",
    en: "Anything we did not ask about: plans for the year, changes in the company, bad experience with contractors, wishes for the work.",
  },
};
