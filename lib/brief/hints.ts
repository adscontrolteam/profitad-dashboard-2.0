import type { BriefLang } from "./questions";

/**
 * What to write in each answer field: shown as the placeholder instead of a generic «Ваш ответ».
 * One short sentence naming the facts we need, with an example where the shape of the answer is not obvious.
 * Questions answered by picking an option have no hint.
 */
export const BRIEF_HINTS: Record<string, Record<BriefLang, string>> = {
  me_city: {
    ru: "Страна и город",
    uk: "Країна й місто",
    en: "Country and city",
  },
  me_age: {
    ru: "Например: 34 года, 12 марта",
    uk: "Наприклад: 34 роки, 12 березня",
    en: "E.g. 34, 12 March",
  },
  me_hobby: {
    ru: "Пара слов о себе вне работы: спорт, путешествия, семья, книги — что вам по-настоящему нравится.",
    uk: "Пара слів про себе поза роботою: спорт, подорожі, сім’я, книжки — що вам справді подобається.",
    en: "A few words about you outside work: sport, travel, family, books — whatever you really enjoy.",
  },
  biz_about: {
    ru: "Одной-двумя фразами: что продаёте и кому, с какого года, в каких странах и на каких языках.",
    uk: "Однією-двома фразами: що продаєте і кому, з якого року, у яких країнах і якими мовами.",
    en: "In a sentence or two: what you sell and to whom, since which year, in which countries and languages.",
  },
  biz_best: {
    ru: "Списком по убыванию. У каждого — примерная доля в выручке или пометка «самый прибыльный».",
    uk: "Списком за спаданням. Біля кожного — приблизна частка у виручці або позначка «найприбутковіший».",
    en: "A list in descending order, each with its rough share of revenue or a note “most profitable”.",
  },
  biz_margin: {
    ru: "Примерно в процентах. Например: «Маржа 40 %: маркетинг 15, продукт 30, продажи 10, доставка 5, прибыль 40».",
    uk: "Приблизно у відсотках. Наприклад: «Маржа 40 %: маркетинг 15, продукт 30, продажі 10, доставка 5, прибуток 40».",
    en: "Roughly, in percent. E.g. “Margin 40%: marketing 15, product 30, sales 10, delivery 5, profit 40”.",
  },
  biz_funnel: {
    ru: "Шаги по порядку от заявки до оплаты. Если есть первый недорогой шаг — его название и цена.",
    uk: "Кроки по порядку від заявки до оплати. Якщо є перший недорогий крок — його назва й ціна.",
    en: "The steps in order from lead to payment. If there is a low-cost first step, its name and price.",
  },
  biz_cycle: {
    ru: "Обычно и максимум: «3–7 дней, до 2 месяцев»",
    uk: "Зазвичай і максимум: «3–7 днів, до 2 місяців»",
    en: "Usual and longest: “3–7 days, up to 2 months”",
  },
  biz_channels_other: {
    ru: "Название канала",
    uk: "Назва каналу",
    en: "Name of the channel",
  },
  biz_stop: {
    ru: "Списком: ниши, страны и типы клиентов, с которыми не работаете, и коротко почему.",
    uk: "Списком: ніші, країни й типи клієнтів, з якими не працюєте, і коротко чому.",
    en: "A list of niches, countries and client types you do not work with, and briefly why.",
  },
  prod_value: {
    ru: "Что входит и какой результат человек получает на выходе — по каждому продукту или пакету.",
    uk: "Що входить і який результат людина отримує на виході — по кожному продукту чи пакету.",
    en: "What is included and the result the person gets in the end — for each product or package.",
  },
  prod_unique: {
    ru: "Чем вы отличаетесь от остальных: цена, срок, гарантия, специализация, сервис. То, чего нет у других.",
    uk: "Чим ви відрізняєтесь від інших: ціна, строк, гарантія, спеціалізація, сервіс. Те, чого немає в інших.",
    en: "How you differ from the rest: price, speed, guarantee, specialisation, service. What others do not have.",
  },
  prod_season: {
    ru: "В какие месяцы спрос выше и ниже и с чем это связано.",
    uk: "У які місяці попит вищий і нижчий і з чим це пов’язано.",
    en: "Which months demand is higher and lower, and why.",
  },
  prod_market: {
    ru: "Что новичку в вашей нише нужно знать в первую очередь: правила, ограничения, привычки клиентов.",
    uk: "Що новачкові у вашій ніші треба знати насамперед: правила, обмеження, звички клієнтів.",
    en: "What a newcomer to your niche must know first: rules, restrictions, client habits.",
  },
  prod_competitors: {
    ru: "3–5 названий или ссылок. По каждому — что о нём знаете и в чём он сильнее или слабее вас.",
    uk: "3–5 назв або посилань. По кожному — що про нього знаєте і в чому він сильніший чи слабший за вас.",
    en: "3–5 names or links. For each, what you know about them and where they are stronger or weaker than you.",
  },
  aud_who: {
    ru: "Опишите одного типичного клиента: кто он, чем занимается, в какой ситуации приходит к вам.",
    uk: "Опишіть одного типового клієнта: хто він, чим займається, у якій ситуації приходить до вас.",
    en: "Describe one typical client: who they are, what they do, in what situation they come to you.",
  },
  aud_segments: {
    ru: "2–4 группы. По каждой: кто это, как часто покупают и какой чек.",
    uk: "2–4 групи. По кожній: хто це, як часто купують і який чек.",
    en: "2–4 groups. For each: who they are, how often they buy and the order value.",
  },
  aud_geo: {
    ru: "Страны и города, языки общения, возраст от и до, кем работают.",
    uk: "Країни й міста, мови спілкування, вік від і до, ким працюють.",
    en: "Countries and cities, languages, age range, occupation.",
  },
  aud_pains: {
    ru: "3–5 пунктов словами клиентов: что случилось и почему пришли именно сейчас.",
    uk: "3–5 пунктів словами клієнтів: що сталося і чому прийшли саме зараз.",
    en: "3–5 points in the clients' words: what happened and why they came now.",
  },
  aud_fears: {
    ru: "Что останавливает перед покупкой: «дорого», «уже обманывали», «не уверен, что получится».",
    uk: "Що зупиняє перед покупкою: «дорого», «уже обманювали», «не впевнений, що вийде».",
    en: "What stops people before buying: “too expensive”, “I was cheated before”, “not sure it will work”.",
  },
  aud_objections: {
    ru: "Парами «возражение → ваш ответ». Например: «Дорого → оплата в два этапа».",
    uk: "Парами «заперечення → ваша відповідь». Наприклад: «Дорого → оплата у два етапи».",
    en: "As pairs “objection → your answer”. E.g. “Too expensive → payment in two stages”.",
  },
  aud_channels: {
    ru: "Конкретные места: названия групп и каналов, блогеры, сайты, мероприятия.",
    uk: "Конкретні місця: назви груп і каналів, блогери, сайти, заходи.",
    en: "Specific places: names of groups and channels, bloggers, sites, events.",
  },
  aud_words: {
    ru: "Дословные фразы: что вбивают в поиск и как формулируют вопрос менеджеру. Это готовые тексты объявлений.",
    uk: "Дослівні фрази: що вбивають у пошук і як формулюють питання менеджеру. Це готові тексти оголошень.",
    en: "Verbatim phrases: what they type into search and how they put the question to your manager. These become ad copy.",
  },
  aud_solutions: {
    ru: "По каждому сегменту — какой продукт ему предлагаете и каким главным доводом.",
    uk: "По кожному сегменту — який продукт йому пропонуєте і яким головним аргументом.",
    en: "For each segment: which product you offer it and the main argument.",
  },
  aud_qualified: {
    ru: "Признаки «нашей» заявки и «не нашей»: бюджет, регион, ниша, срочность.",
    uk: "Ознаки «нашої» заявки і «не нашої»: бюджет, регіон, ніша, терміновість.",
    en: "Signs of a lead that is yours and one that is not: budget, region, niche, urgency.",
  },
  aud_forbidden: {
    ru: "Списком: запрещённые формулировки и обещания. Например: «гарантия 100 %», сроки решений госорганов.",
    uk: "Списком: заборонені формулювання й обіцянки. Наприклад: «гарантія 100 %», строки рішень держорганів.",
    en: "A list of forbidden wordings and promises. E.g. “100% guarantee”, government decision deadlines.",
  },
  biz_goal_other: {
    ru: "Ваша цель одной фразой",
    uk: "Ваша ціль однією фразою",
    en: "Your goal in one phrase",
  },
  goal_success: {
    ru: "1–3 цифры или события, по которым вы поймёте, что работа идёт хорошо.",
    uk: "1–3 цифри або події, за якими ви зрозумієте, що робота йде добре.",
    en: "1–3 numbers or events that will tell you the work is going well.",
  },
  biz_target: {
    ru: "Два числа в месяц: сколько заявок и сколько продаж.",
    uk: "Два числа на місяць: скільки заявок і скільки продажів.",
    en: "Two numbers per month: how many leads and how many sales.",
  },
  biz_capacity: {
    ru: "Потолок, после которого качество обработки падает. Например: «40 новых клиентов в месяц».",
    uk: "Стеля, після якої якість обробки падає. Наприклад: «40 нових клієнтів на місяць».",
    en: "The ceiling after which handling quality drops. E.g. “40 new clients a month”.",
  },
  biz_history: {
    ru: "По каждому каналу: когда запускали, сколько тратили, что получили и почему остановили.",
    uk: "По кожному каналу: коли запускали, скільки витрачали, що отримали і чому зупинили.",
    en: "For each channel: when it ran, how much you spent, what you got and why you stopped.",
  },
  num_check: {
    ru: "Сумма и валюта: 250 €",
    uk: "Сума й валюта: 250 €",
    en: "Amount and currency: €250",
  },
  num_cr: {
    ru: "Процент или «из 10 заявок — 2 продажи»",
    uk: "Відсоток або «з 10 заявок — 2 продажі»",
    en: "A percentage or “2 sales out of 10 leads”",
  },
  num_leads: {
    ru: "Число в месяц: 40",
    uk: "Число на місяць: 40",
    en: "Number per month: 40",
  },
  num_budget: {
    ru: "Сумма в месяц и валюта: 1 500 €",
    uk: "Сума на місяць і валюта: 1 500 €",
    en: "Monthly amount and currency: €1,500",
  },
  num_cpl: {
    ru: "Сколько готовы платить за одну заявку: до 25 €",
    uk: "Скільки готові платити за одну заявку: до 25 €",
    en: "How much you are ready to pay per lead: up to €25",
  },
  num_cac: {
    ru: "Сколько готовы платить за одного клиента: до 150 €",
    uk: "Скільки готові платити за одного клієнта: до 150 €",
    en: "How much you are ready to pay per client: up to €150",
  },
  num_repeat: {
    ru: "Сколько раз клиент покупает снова: в среднем 2 раза в год",
    uk: "Скільки разів клієнт купує знову: у середньому 2 рази на рік",
    en: "How often a client buys again: 2 times a year on average",
  },
  num_ltv: {
    ru: "Два числа: сколько денег приносит один клиент за всё время и сколько месяцев или лет он с вами.",
    uk: "Два числа: скільки грошей приносить один клієнт за весь час і скільки місяців чи років він з вами.",
    en: "Two numbers: how much one client brings in total and how many months or years they stay.",
  },
  num_junk: {
    ru: "Примерный процент: 30 %",
    uk: "Приблизний відсоток: 30 %",
    en: "Rough percentage: 30%",
  },
  tech_site_platform_other: {
    ru: "Название платформы",
    uk: "Назва платформи",
    en: "Name of the platform",
  },
  tech_crm_other: {
    ru: "Название CRM",
    uk: "Назва CRM",
    en: "Name of the CRM",
  },
  tech_phone_other: {
    ru: "Название сервиса",
    uk: "Назва сервісу",
    en: "Name of the service",
  },
  tech_gads_id: {
    ru: "10 цифр: 123-456-7890",
    uk: "10 цифр: 123-456-7890",
    en: "10 digits: 123-456-7890",
  },
  tech_meta_id: {
    ru: "Цифры из настроек Business Manager",
    uk: "Цифри з налаштувань Business Manager",
    en: "The digits from Business Manager settings",
  },
  link_instagram: {
    ru: "https://instagram.com/…",
    uk: "https://instagram.com/…",
    en: "https://instagram.com/…",
  },
  link_facebook: {
    ru: "https://facebook.com/…",
    uk: "https://facebook.com/…",
    en: "https://facebook.com/…",
  },
  link_threads: {
    ru: "https://threads.net/@…",
    uk: "https://threads.net/@…",
    en: "https://threads.net/@…",
  },
  link_tiktok: {
    ru: "https://tiktok.com/@…",
    uk: "https://tiktok.com/@…",
    en: "https://tiktok.com/@…",
  },
  link_youtube: {
    ru: "https://youtube.com/@…",
    uk: "https://youtube.com/@…",
    en: "https://youtube.com/@…",
  },
  link_telegram: {
    ru: "https://t.me/…",
    uk: "https://t.me/…",
    en: "https://t.me/…",
  },
  link_maps: {
    ru: "Ссылка на карточку компании в Google Maps",
    uk: "Посилання на картку компанії в Google Maps",
    en: "Link to your company's Google Maps listing",
  },
  link_website: {
    ru: "https://…",
    uk: "https://…",
    en: "https://…",
  },
  link_landings: {
    ru: "По одной ссылке в строке. Сколько угодно страниц.",
    uk: "По одному посиланню в рядку. Скільки завгодно сторінок.",
    en: "One link per line. As many pages as you need.",
  },
  link_email: {
    ru: "name@company.com",
    uk: "name@company.com",
    en: "name@company.com",
  },
  cont_cases: {
    ru: "2–5 историй: кто клиент → с чем пришёл → что сделали → результат в цифрах. Можно ссылками.",
    uk: "2–5 історій: хто клієнт → з чим прийшов → що зробили → результат у цифрах. Можна посиланнями.",
    en: "2–5 stories: who the client is → what they came with → what you did → the result in numbers. Links are fine.",
  },
  cont_media: {
    ru: "Ссылка на папку с фото и видео или загрузите файлы ниже.",
    uk: "Посилання на папку з фото й відео або завантажте файли нижче.",
    en: "A link to a folder with photos and videos, or upload files below.",
  },
  cont_brand: {
    ru: "Ссылка на логотип (SVG или PNG) и брендбук. Если его нет — названия шрифтов и коды цветов.",
    uk: "Посилання на логотип (SVG або PNG) і брендбук. Якщо його немає — назви шрифтів і коди кольорів.",
    en: "A link to the logo (SVG or PNG) and the brand book. If there is none, the font names and colour codes.",
  },
  proc_value: {
    ru: "Что для вас важнее всего: скорость, прозрачность, результат в цифрах, чтобы вас не дёргали.",
    uk: "Що для вас найважливіше: швидкість, прозорість, результат у цифрах, щоб вас не смикали.",
    en: "What matters most to you: speed, transparency, results in numbers, not being bothered.",
  },
  proc_bad: {
    ru: "Что раздражало или мешало: долгие ответы, отчёты без смысла, сорванные сроки.",
    uk: "Що дратувало або заважало: довгі відповіді, звіти без сенсу, зірвані терміни.",
    en: "What annoyed or got in the way: slow replies, meaningless reports, missed deadlines.",
  },
  proc_other: {
    ru: "Всё, о чём мы не спросили: планы на год, изменения в компании, пожелания к работе.",
    uk: "Усе, про що ми не запитали: плани на рік, зміни в компанії, побажання до роботи.",
    en: "Anything we did not ask about: plans for the year, changes in the company, wishes for the work.",
  },
};
