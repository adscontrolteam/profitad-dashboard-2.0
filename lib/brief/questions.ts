/**
 * Client brief: sections and questions in three languages. Ids are stable — answers are stored by them.
 *
 * Every answer is stored as a string: free text as typed, a choice as the id of the option, several choices as
 * option ids joined by commas. A question may depend on another answer (`when`): it is shown, counted and sent
 * to the client only while that condition holds.
 */

export const BRIEF_LANGS = ["ru", "uk", "en"] as const;
export type BriefLang = (typeof BRIEF_LANGS)[number];
export const BRIEF_LANG_LABEL: Record<BriefLang, string> = { ru: "Русский", uk: "Українська", en: "English" };

type T = Record<BriefLang, string>;
type L = [ru: string, uk: string, en: string];
const t = ([ru, uk, en]: L): T => ({ ru, uk, en });

/** text = a paragraph, short = one line, choice = one option, multi = several options. */
export type BriefKind = "text" | "short" | "choice" | "multi";
export interface BriefOption {
  id: string;
  label: T;
}
export interface BriefQuestion {
  id: string;
  q: T;
  kind: BriefKind;
  options?: BriefOption[];
  /** Shown only while the answer to `id` has one of these options ("*" = is not empty). */
  when?: { id: string; in: string[] };
  /** Small print under the question. */
  note?: T;
}
export interface BriefSection {
  id: string;
  title: T;
  goal: T;
  questions: BriefQuestion[];
  /** The section collects files (logo, photos, cases) into the project's Drive folder. */
  files?: boolean;
}

type When = BriefQuestion["when"];
const text = (id: string, q: L, when?: When): BriefQuestion => ({ id, q: t(q), kind: "text", when });
const short = (id: string, q: L, when?: When, note?: L): BriefQuestion => ({ id, q: t(q), kind: "short", when, note: note && t(note) });
const opt = (id: string, ...label: L): BriefOption => ({ id, label: t(label) });
const choice = (id: string, q: L, options: BriefOption[], when?: When): BriefQuestion => ({ id, q: t(q), kind: "choice", options, when });
const multi = (id: string, q: L, options: BriefOption[], when?: When): BriefQuestion => ({ id, q: t(q), kind: "multi", options, when });

const YES = opt("yes", "Да", "Так", "Yes");
const NO = opt("no", "Нет", "Ні", "No");
const UNSURE = opt("unsure", "Не знаю", "Не знаю", "Not sure");
const OTHER = opt("other", "Другое", "Інше", "Other");
const WHICH: L = ["Какое именно?", "Яке саме?", "Which one?"];

export const BRIEF_SECTIONS: BriefSection[] = [
  {
    id: "me",
    title: t(["О Вас", "Про Вас", "About you"]),
    goal: t(["познакомиться с человеком", "познайомитися з людиною", "to get to know you"]),
    questions: [
      short("me_city", ["Где Вы проживаете?", "Де Ви проживаєте?", "Where do you live?"]),
      short("me_age", ["Сколько Вам лет? Когда у Вас День Рождения?", "Скільки Вам років? Коли у Вас День народження?", "How old are you? When is your birthday?"]),
      text("me_hobby", [
        "Чем Вы увлекаетесь? Какие хобби? Что любите делать в свободное время?",
        "Чим Ви захоплюєтесь? Які хобі? Що любите робити у вільний час?",
        "What are you into? Any hobbies? What do you like to do in your free time?",
      ]),
    ],
  },
  {
    id: "business",
    title: t(["Бизнес (о продажах)", "Бізнес (про продажі)", "Business (sales)"]),
    goal: t(["узнать, как бизнес зарабатывает деньги", "дізнатися, як бізнес заробляє гроші", "to learn how the business makes money"]),
    questions: [
      text("biz_about", [
        "Чем занимается компания, сколько лет на рынке, на каких рынках и языках работаете?",
        "Чим займається компанія, скільки років на ринку, на яких ринках і мовах працюєте?",
        "What does the company do, how long has it been on the market, which markets and languages do you work in?",
      ]),
      text("biz_best", [
        "Best-sellers: продукты и услуги, которые продаются лучше всего и на которых больше всего зарабатываете (по убыванию).",
        "Best-sellers: продукти й послуги, які продаються найкраще і на яких найбільше заробляєте (за спаданням).",
        "Best-sellers: the products and services that sell best and earn you the most (in descending order).",
      ]),
      text("biz_margin", [
        "Какая средняя маржинальность? Как делится выручка: маркетинг / продукт / продажа / доставка / чистая прибыль?",
        "Яка середня маржинальність? Як ділиться виручка: маркетинг / продукт / продаж / доставка / чистий прибуток?",
        "What is the average margin? How does revenue split: marketing / product / sales / delivery / net profit?",
      ]),
      text("biz_funnel", [
        "Как сейчас устроена воронка продаж? Есть ли входной продукт (консультация, аудит, пробный период)?",
        "Як зараз побудована воронка продажів? Чи є вхідний продукт (консультація, аудит, пробний період)?",
        "How is your sales funnel built now? Is there an entry product (consultation, audit, trial)?",
      ]),
      short("biz_cycle", ["Какое время продажи — от заявки до оплаты?", "Який час продажу — від заявки до оплати?", "How long does a sale take — from lead to payment?"]),
      multi("biz_channels", ["Через какие каналы с вами связываются чаще всего?", "Через які канали з вами зв’язуються найчастіше?", "Which channels do people use most to contact you?"], [
        opt("whatsapp", "WhatsApp", "WhatsApp", "WhatsApp"),
        opt("telegram", "Telegram", "Telegram", "Telegram"),
        opt("call", "Звонок", "Дзвінок", "Phone call"),
        opt("form", "Форма на сайте", "Форма на сайті", "Website form"),
        opt("direct", "Instagram / Facebook", "Instagram / Facebook", "Instagram / Facebook"),
        opt("email", "Почта", "Пошта", "Email"),
        OTHER,
      ]),
      short("biz_channels_other", WHICH, { id: "biz_channels", in: ["other"] }),
      text("biz_stop", [
        "С кем и с чем не работаете (стоп-лист ниш, регионов, типов клиентов)?",
        "З ким і з чим не працюєте (стоп-лист ніш, регіонів, типів клієнтів)?",
        "Who and what do you not work with (stop-list of niches, regions, client types)?",
      ]),
    ],
  },
  {
    id: "product",
    title: t(["Продукт", "Продукт", "Product"]),
    goal: t(["лучше узнать продукт, конкурентов и рынок", "краще дізнатися продукт, конкурентів і ринок", "to understand the product, the competitors and the market"]),
    questions: [
      text("prod_value", ["За что платит клиент? Что он покупает?", "За що платить клієнт? Що він купує?", "What does the client pay for? What do they buy?"]),
      text("prod_unique", [
        "В чём уникальность продукта? Что мы можем предложить рынку?",
        "У чому унікальність продукту? Що ми можемо запропонувати ринку?",
        "What makes the product unique? What can we offer the market?",
      ]),
      text("prod_season", ["Есть ли сезонность, пики и спады?", "Чи є сезонність, піки та спади?", "Is there seasonality, peaks and lows?"]),
      text("prod_market", [
        "Есть ли специфика у этого рынка? (первое, что приходит на ум)",
        "Чи є специфіка в цього ринку? (перше, що спадає на думку)",
        "Is there anything specific about this market? (the first thing that comes to mind)",
      ]),
      text("prod_competitors", [
        "Топ конкурентов и всё, что вы о них знаете: продажи, обороты, клиенты, продукты и другое.",
        "Топ конкурентів і все, що ви про них знаєте: продажі, обороти, клієнти, продукти та інше.",
        "Top competitors and everything you know about them: sales, turnover, clients, products and so on.",
      ]),
    ],
  },
  {
    id: "audience",
    title: t(["Кто целевая аудитория? Кто клиент?", "Хто цільова аудиторія? Хто клієнт?", "Who is the target audience? Who is the client?"]),
    goal: t(["узнать, кто ЦА, познакомиться с ней и понять её", "дізнатися, хто ЦА, познайомитися з нею і зрозуміти її", "to learn who the audience is and understand it"]),
    questions: [
      text("aud_who", ["Кто Ваш клиент?", "Хто Ваш клієнт?", "Who is your client?"]),
      choice("aud_type", ["Это B2B или B2C?", "Це B2B чи B2C?", "Is it B2B or B2C?"], [
        opt("b2b", "B2B — бизнесу", "B2B — бізнесу", "B2B"),
        opt("b2c", "B2C — людям", "B2C — людям", "B2C"),
        opt("both", "И то, и другое", "І те, і інше", "Both"),
      ]),
      text("aud_segments", [
        "Сегменты аудитории: кто покупает чаще всего, кто приносит больше всего денег?",
        "Сегменти аудиторії: хто купує найчастіше, хто приносить найбільше грошей?",
        "Audience segments: who buys most often, who brings the most money?",
      ]),
      text("aud_geo", ["География, языки, возраст, должность или род занятий.", "Географія, мови, вік, посада або рід занять.", "Geography, languages, age, job title or occupation."]),
      text("aud_pains", ["Острые боли: с какой проблемой к вам приходят?", "Гострі болі: з якою проблемою до вас приходять?", "Key pains: what problem do people come to you with?"]),
      text("aud_fears", ["Страхи и барьеры: почему сомневаются и не покупают?", "Страхи та бар’єри: чому сумніваються і не купують?", "Fears and barriers: why do people hesitate and not buy?"]),
      text("aud_objections", ["Частые возражения и как вы на них отвечаете?", "Часті заперечення і як ви на них відповідаєте?", "Common objections and how you answer them?"]),
      text("aud_channels", [
        "Где аудитория проводит время: соцсети, сообщества, поиск, мероприятия?",
        "Де аудиторія проводить час: соцмережі, спільноти, пошук, заходи?",
        "Where does the audience spend time: social networks, communities, search, events?",
      ]),
      text("aud_words", [
        "Какими словами клиент сам описывает свою проблему? (Как гуглит? Как спрашивает в разговоре?)",
        "Якими словами клієнт сам описує свою проблему? (Як гуглить? Як питає в розмові?)",
        "In what words does the client describe the problem? (How do they google it? How do they ask in conversation?)",
      ]),
      text("aud_solutions", ["Ваше решение для каждого сегмента.", "Ваше рішення для кожного сегмента.", "Your solution for each segment."]),
      text("aud_qualified", ["Критерии квалифицированного лида?", "Критерії кваліфікованого ліда?", "What makes a lead qualified?"]),
      text("aud_forbidden", [
        "Что нельзя обещать в рекламе (юридические ограничения, требования площадок, ваша политика)?",
        "Що не можна обіцяти в рекламі (юридичні обмеження, вимоги майданчиків, ваша політика)?",
        "What must not be promised in ads (legal limits, platform rules, your own policy)?",
      ]),
    ],
  },
  {
    id: "goals",
    title: t(["Цели бизнеса и сотрудничества", "Цілі бізнесу та співпраці", "Business and cooperation goals"]),
    goal: t([
      "понять цели: чем мы можем помочь бизнесу и какую стратегию строить",
      "зрозуміти цілі: чим ми можемо допомогти бізнесу і яку стратегію будувати",
      "to understand the goals: how we can help the business and what strategy to build",
    ]),
    questions: [
      choice("biz_goal", ["Главная цель на ближайшие 3 месяца?", "Головна ціль на найближчі 3 місяці?", "The main goal for the next 3 months?"], [
        opt("leads", "Заявки", "Заявки", "Leads"),
        opt("sales", "Продажи", "Продажі", "Sales"),
        opt("subscribers", "Подписчики", "Підписники", "Subscribers"),
        opt("awareness", "Узнаваемость", "Впізнаваність", "Awareness"),
        OTHER,
      ]),
      short("biz_goal_other", WHICH, { id: "biz_goal", in: ["other"] }),
      text("goal_success", [
        "Что для вас будет метрикой успешного сотрудничества?",
        "Що для вас буде метрикою успішної співпраці?",
        "What will be your measure of a successful cooperation?",
      ]),
      text("biz_target", [
        "Сколько заявок и продаж в месяц нужно, чтобы реклама была для вас успешной?",
        "Скільки заявок і продажів на місяць потрібно, щоб реклама була для вас успішною?",
        "How many leads and sales per month would make advertising a success for you?",
      ]),
      text("biz_capacity", [
        "Сколько заявок и продаж в месяц команда реально может обработать? (доступный capacity)",
        "Скільки заявок і продажів на місяць команда реально може обробити? (доступний capacity)",
        "How many leads and sales per month can your team really handle? (available capacity)",
      ]),
    ],
  },
  {
    id: "past",
    title: t(["Прошлый опыт", "Минулий досвід", "Past experience"]),
    goal: t(["узнать, что пробовали, что сработало, что нет и почему", "дізнатися, що пробували, що спрацювало, що ні й чому", "to learn what you tried, what worked, what did not and why"]),
    questions: [
      text("biz_history", [
        "Что уже пробовали в рекламе: каналы, бюджеты, что сработало, а что нет?",
        "Що вже пробували в рекламі: канали, бюджети, що спрацювало, а що ні?",
        "What have you already tried in advertising: channels, budgets, what worked and what did not?",
      ]),
      choice("past_access", ["Есть ли доступ к старым рекламным кабинетам?", "Чи є доступ до старих рекламних кабінетів?", "Do you have access to the old ad accounts?"], [
        YES,
        opt("partly", "Частично", "Частково", "Partly"),
        NO,
      ]),
    ],
  },
  {
    id: "numbers",
    title: t(["Цифры", "Цифри", "Numbers"]),
    goal: t(["собрать все цифры, чтобы посчитать математику", "зібрати всі цифри, щоб порахувати математику", "to collect the numbers and do the maths"]),
    questions: [
      short("num_check", ["Средний чек?", "Середній чек?", "Average order value?"]),
      short("num_cr", ["Конверсия из заявки в продажу?", "Конверсія із заявки в продаж?", "Lead-to-sale conversion rate?"]),
      short("num_leads", ["Сколько заявок в месяц сейчас?", "Скільки заявок на місяць зараз?", "How many leads per month now?"]),
      short("num_budget", ["Рекламный бюджет сейчас?", "Рекламний бюджет зараз?", "Current advertising budget?"]),
      short("num_cpl", ["Допустимая стоимость заявки?", "Допустима вартість заявки?", "Acceptable cost per lead?"]),
      short("num_cac", ["Допустимая стоимость клиента?", "Допустима вартість клієнта?", "Acceptable cost per client?"]),
      short("num_repeat", ["Количество повторных продаж?", "Кількість повторних продажів?", "Number of repeat sales?"]),
      text("num_ltv", [
        "LTV и LifeTime: сколько клиент приносит за всё время работы и сколько он остаётся с вами?",
        "LTV і LifeTime: скільки клієнт приносить за весь час роботи і скільки він залишається з вами?",
        "LTV and lifetime: how much does a client bring over the whole relationship and how long do they stay?",
      ]),
      short("num_junk", [
        "Доля заявок, которые не отвечают или оказываются нецелевыми?",
        "Частка заявок, які не відповідають або виявляються нецільовими?",
        "Share of leads that do not answer or turn out to be unqualified?",
      ]),
    ],
  },
  {
    id: "tech",
    title: t(["Техническая часть", "Технічна частина", "Technical"]),
    goal: t(["понять, что уже настроено и к чему нужен доступ", "зрозуміти, що вже налаштовано і до чого потрібен доступ", "to see what is already set up and what we need access to"]),
    questions: [
      choice("tech_site_has", ["Есть ли сайт?", "Чи є сайт?", "Do you have a website?"], [YES, NO]),
      choice(
        "tech_site_platform",
        ["На чём сделан сайт?", "На чому зроблений сайт?", "What is the site built on?"],
        [
          opt("code", "Самописный (код)", "Самописний (код)", "Custom code"),
          opt("wordpress", "WordPress", "WordPress", "WordPress"),
          opt("shopify", "Shopify", "Shopify", "Shopify"),
          opt("tilda", "Tilda", "Tilda", "Tilda"),
          opt("ai", "AI-сайт", "AI-сайт", "AI-built site"),
          OTHER,
        ],
        { id: "tech_site_has", in: ["yes"] },
      ),
      short("tech_site_platform_other", WHICH, { id: "tech_site_platform", in: ["other"] }),
      multi("tech_leads_to", ["Куда сейчас приходят заявки?", "Куди зараз надходять заявки?", "Where do leads arrive now?"], [
        opt("email", "Почта", "Пошта", "Email"),
        opt("messenger", "Мессенджер", "Месенджер", "Messenger"),
        opt("sheets", "Google Sheets (таблица)", "Google Sheets (таблиця)", "Google Sheets"),
        opt("crm", "CRM-система", "CRM-система", "CRM"),
      ]),
      choice(
        "tech_crm_which",
        ["Какая CRM?", "Яка CRM?", "Which CRM?"],
        [
          opt("bitrix24", "Bitrix24", "Bitrix24", "Bitrix24"),
          opt("amocrm", "amoCRM", "amoCRM", "amoCRM"),
          opt("keycrm", "KeyCRM", "KeyCRM", "KeyCRM"),
          opt("kommo", "Kommo", "Kommo", "Kommo"),
          OTHER,
        ],
        { id: "tech_leads_to", in: ["crm"] },
      ),
      short("tech_crm_other", WHICH, { id: "tech_crm_which", in: ["other"] }),
      choice("tech_phone_has", ["Есть ли телефония?", "Чи є телефонія?", "Do you use a telephony service?"], [YES, NO]),
      choice(
        "tech_phone_which",
        ["Какая телефония?", "Яка телефонія?", "Which telephony?"],
        [
          opt("binotel", "Binotel", "Binotel", "Binotel"),
          opt("ringostat", "Ringostat", "Ringostat", "Ringostat"),
          opt("zadarma", "Zadarma", "Zadarma", "Zadarma"),
          opt("phonet", "Phonet", "Phonet", "Phonet"),
          opt("unitalk", "UniTalk", "UniTalk", "UniTalk"),
          OTHER,
        ],
        { id: "tech_phone_has", in: ["yes"] },
      ),
      short("tech_phone_other", WHICH, { id: "tech_phone_which", in: ["other"] }),
      multi("tech_installed", ["Что уже установлено на сайте?", "Що вже встановлено на сайті?", "What is already installed on the site?"], [
        opt("clarity", "Microsoft Clarity", "Microsoft Clarity", "Microsoft Clarity"),
        opt("ga4", "Google Analytics", "Google Analytics", "Google Analytics"),
        opt("gtm", "Google Tag Manager", "Google Tag Manager", "Google Tag Manager"),
        opt("pixel", "Facebook Pixel", "Facebook Pixel", "Facebook Pixel"),
        UNSURE,
      ]),
      choice("tech_conversions", ["Настроены ли все конверсии?", "Чи налаштовані всі конверсії?", "Are all conversions set up?"], [YES, NO, UNSURE]),
      choice("tech_gads_has", ["Создан ли рекламный кабинет Google Ads?", "Чи створений рекламний кабінет Google Ads?", "Do you have a Google Ads account?"], [YES, NO]),
      short("tech_gads_id", ["ID рекламного аккаунта Google Ads", "ID рекламного акаунта Google Ads", "Google Ads account ID"], { id: "tech_gads_has", in: ["yes"] }),
      choice("tech_meta_has", ["Создан ли рекламный кабинет Meta Ads?", "Чи створений рекламний кабінет Meta Ads?", "Do you have a Meta Ads account?"], [YES, NO]),
      short("tech_meta_id", ["ID Business Manager", "ID Business Manager", "Business Manager ID"], { id: "tech_meta_has", in: ["yes"] }),
      choice(
        "tech_domain",
        ["Можете ли вы дать доступ к домену (хостингу)?", "Чи можете ви дати доступ до домену (хостингу)?", "Can you give access to the domain (hosting)?"],
        [YES, NO],
      ),
      choice("tech_payment", ["Способ оплаты рекламы", "Спосіб оплати реклами", "How ads will be paid for"], [
        opt("give", "Выдам данные рекламной карты", "Видам дані рекламної картки", "I will give you the ad card details"),
        opt("self", "Подключу в аккаунт самостоятельно", "Підключу в акаунт самостійно", "I will connect the card myself"),
        opt("connected", "Уже подключена в рекламных аккаунтах", "Уже підключена в рекламних акаунтах", "Already connected to the ad accounts"),
        opt("agency", "Создайте на своей стороне, я вышлю рекламный бюджет", "Створіть на своєму боці, я надішлю рекламний бюджет", "Issue one on your side, I will send the ad budget"),
      ]),
    ],
  },
  {
    id: "links",
    title: t(["Ссылки", "Посилання", "Links"]),
    goal: t(["собрать все ссылки на ресурсы", "зібрати всі посилання на ресурси", "to collect the links to all your resources"]),
    questions: [
      short("link_instagram", ["Instagram", "Instagram", "Instagram"]),
      short("link_facebook", ["Facebook", "Facebook", "Facebook"]),
      short("link_threads", ["Threads", "Threads", "Threads"]),
      short("link_tiktok", ["TikTok", "TikTok", "TikTok"]),
      short("link_youtube", ["YouTube", "YouTube", "YouTube"]),
      short("link_telegram", ["Telegram: канал или группа", "Telegram: канал або група", "Telegram: channel or group"]),
      short("link_maps", ["Google Maps", "Google Maps", "Google Maps"]),
      short("link_website", ["Сайт", "Сайт", "Website"], { id: "tech_site_has", in: ["yes"] }),
      text("link_landings", ["Другие посадочные страницы", "Інші посадкові сторінки", "Other landing pages"]),
      choice(
        "link_landings_access",
        ["Есть ли доступ к изменению посадочных страниц?", "Чи є доступ до зміни посадкових сторінок?", "Do you have access to edit the landing pages?"],
        [YES, NO],
        { id: "link_landings", in: ["*"] },
      ),
      short("link_email", ["Почта", "Пошта", "Email"], undefined, [
        "На неё будем выдавать все доступы и дублировать важную информацию.",
        "На неї видаватимемо всі доступи та дублюватимемо важливу інформацію.",
        "We will send all accesses there and duplicate important information.",
      ]),
    ],
  },
  {
    id: "content",
    title: t(["Контент и материалы", "Контент і матеріали", "Content and materials"]),
    goal: t(["собрать материал для работы; файлы можно прикрепить ниже", "зібрати матеріал для роботи; файли можна прикріпити нижче", "to gather material to work with; you can attach files below"]),
    files: true,
    questions: [
      text("cont_cases", [
        "Расписанные кейсы и результаты клиентов: цифры, сроки, отзывы.",
        "Розписані кейси та результати клієнтів: цифри, терміни, відгуки.",
        "Written-up cases and client results: numbers, timelines, reviews.",
      ]),
      text("cont_media", [
        "Живые фото и видео команды, офиса, процесса работы (ссылки или файлы).",
        "Живі фото й відео команди, офісу, процесу роботи (посилання або файли).",
        "Real photos and videos of the team, office and work process (links or files).",
      ]),
      text("cont_brand", ["Логотип, брендбук, шрифты, цвета (ссылки или файлы).", "Логотип, брендбук, шрифти, кольори (посилання або файли).", "Logo, brand book, fonts, colours (links or files)."]),
      choice("cont_video", ["Готовы ли снимать живое видео по нашему сценарию?", "Чи готові знімати живе відео за нашим сценарієм?", "Are you ready to shoot real video from our script?"], [YES, NO]),
    ],
  },
  {
    id: "process",
    title: t(["Процесс сотрудничества", "Процес співпраці", "How we work together"]),
    goal: t(["узнать, что важно вам и нам в сотрудничестве", "дізнатися, що важливо вам і нам у співпраці", "to learn what matters to you and to us in working together"]),
    questions: [
      choice(
        "proc_approve",
        ["Важно ли Вам согласовывать контент для рекламы и постинга?", "Чи важливо Вам погоджувати контент для реклами й постингу?", "Do you want to approve content for ads and posting?"],
        [opt("all", "Весь", "Увесь", "All of it"), opt("partly", "Частично", "Частково", "Partly")],
      ),
      choice("proc_reports", ["Как часто отправлять отчёты?", "Як часто надсилати звіти?", "How often should we send reports?"], [
        opt("weekly", "Еженедельно", "Щотижня", "Weekly"),
        opt("monthly", "Ежемесячно", "Щомісяця", "Monthly"),
      ]),
      text("proc_value", [
        "Что для Вас самое важное и ценное в сотрудничестве?",
        "Що для Вас найважливіше й найцінніше у співпраці?",
        "What matters most and is most valuable to you in working together?",
      ]),
      text("proc_bad", ["Что было неудобно в работе с прошлыми подрядчиками?", "Що було незручно в роботі з минулими підрядниками?", "What was inconvenient in working with previous contractors?"]),
      text("proc_other", ["Что ещё нам важно знать?", "Що ще нам важливо знати?", "Anything else we should know?"]),
    ],
  },
];

/** Closing block of the brief: what matters to us in working together. */
export const BRIEF_OUTRO: Record<BriefLang, { title: string; items: { title: string; text: string }[] }> = {
  ru: {
    title: "Что важно нам в сотрудничестве с вами?",
    items: [
      {
        title: "Доверие",
        text: "Доверие к тому, что мы делаем и как: без постоянного контроля и без спешки. Мы вовлечены и намерены работать в долгую — так, чтобы сотрудничество было плодотворным.",
      },
      {
        title: "Уважение",
        text: "Уважать личное пространство, рабочее время и выходные. Мы включены в сотрудничество 24/7: наша платформа и AI-агенты следят за тем, чтобы бюджет тратился результативно.",
      },
      {
        title: "Ваше личное мнение",
        text: "Вы в любом случае лучше знаете свой бизнес и продукт. Поэтому мы рады вашей критике и идеям и хотим слышать вас: ваши желания и то, что для вас важно в сотрудничестве.",
      },
    ],
  },
  uk: {
    title: "Що важливо нам у співпраці з вами?",
    items: [
      {
        title: "Довіра",
        text: "Довіра до того, що ми робимо і як: без постійного контролю і без поспіху. Ми залучені й маємо намір працювати надовго — так, щоб співпраця була плідною.",
      },
      {
        title: "Повага",
        text: "Поважати особистий простір, робочий час і вихідні. Ми включені у співпрацю 24/7: наша платформа й AI-агенти стежать за тим, щоб бюджет витрачався результативно.",
      },
      {
        title: "Ваша особиста думка",
        text: "Ви в будь-якому разі краще знаєте свій бізнес і продукт. Тому ми раді вашій критиці та ідеям і хочемо чути вас: ваші бажання і те, що для вас важливо у співпраці.",
      },
    ],
  },
  en: {
    title: "What matters to us in working with you?",
    items: [
      {
        title: "Trust",
        text: "Trust in what we do and how we do it: without constant control and without rush. We are committed and intend to work for the long run, so that the cooperation is fruitful.",
      },
      {
        title: "Respect",
        text: "Respect for personal space, working hours and weekends. We are engaged 24/7: our platform and AI agents make sure the budget is spent on results.",
      },
      {
        title: "Your own opinion",
        text: "You know your business and product best. So we welcome your criticism and ideas and want to hear you: your wishes and what matters to you in working together.",
      },
    ],
  },
};

const QUESTIONS = BRIEF_SECTIONS.flatMap((s) => s.questions);
export const ALL_QUESTION_IDS = QUESTIONS.map((x) => x.id);
const BY_ID = new Map(QUESTIONS.map((x) => [x.id, x]));
export const briefQuestion = (id: string) => BY_ID.get(id) ?? null;

/** Option ids chosen in a stored answer (one for a choice, several for a multi). */
export const chosen = (value: string | undefined) => (value ?? "").split(",").map((v) => v.trim()).filter(Boolean);

/** Whether a question applies given the answers so far (its `when` holds, and so does its parent's). */
export function isAsked(question: BriefQuestion, answers: Record<string, string>): boolean {
  if (!question.when) return true;
  const parent = BY_ID.get(question.when.id);
  if (parent && !isAsked(parent, answers)) return false;
  const value = answers[question.when.id] ?? "";
  if (question.when.in.includes("*")) return value.trim() !== "";
  const picked = chosen(value);
  return question.when.in.some((o) => picked.includes(o));
}

/** An answer as a person reads it: option labels instead of ids. */
export function answerText(question: BriefQuestion, value: string | undefined, lang: BriefLang) {
  const raw = (value ?? "").trim();
  if (!raw || !question.options) return raw;
  return chosen(raw)
    .map((id) => question.options?.find((o) => o.id === id)?.label[lang] ?? id)
    .join(", ");
}

/** Interface strings of the client page. */
export const BRIEF_UI: Record<BriefLang, Record<string, string>> = {
  ru: {
    dictate: "Надиктовать ответ",
    dictateStop: "Остановить запись",
    dictating: "Говорите — текст появится в поле",
    dictateError: "Микрофон недоступен: разрешите доступ в браузере",
    title: "Бриф проекта",
    intro: "Ответьте на вопросы — по ним мы строим рекламу. Часть уже заполнили мы: проверьте и поправьте. Ответы сохраняются сами, можно вернуться по этой же ссылке в любой момент.",
    progress: "Заполнено",
    of: "из",
    saved: "Сохранено",
    saving: "Сохраняю…",
    saveError: "Не сохранилось — проверьте интернет",
    placeholder: "Ваш ответ",
    submit: "Готово, отправить",
    submitHint: "Можно отправить и не всё: недостающее уточним.",
    submitted: "Спасибо! Бриф отправлен. Ответы можно дополнять по этой же ссылке.",
    closed: "Бриф закрыт: ответы сохранены, изменения больше не принимаются.",
    notFound: "Ссылка недействительна или была отозвана. Попросите у менеджера новую.",
    files: "Файлы",
    filesHint: "Логотип, фото, кейсы — перетащите сюда или нажмите. Они попадут в папку проекта.",
    uploading: "Загружаю…",
    uploaded: "Загружено",
    uploadError: "Не удалось загрузить",
    goal: "Цель",
  },
  uk: {
    dictate: "Надиктувати відповідь",
    dictateStop: "Зупинити запис",
    dictating: "Говоріть — текст з’явиться в полі",
    dictateError: "Мікрофон недоступний: дозвольте доступ у браузері",
    title: "Бриф проєкту",
    intro: "Дайте відповіді на питання — за ними ми будуємо рекламу. Частину вже заповнили ми: перевірте й виправте. Відповіді зберігаються самі, можна повернутися за цим самим посиланням будь-коли.",
    progress: "Заповнено",
    of: "із",
    saved: "Збережено",
    saving: "Зберігаю…",
    saveError: "Не збереглося — перевірте інтернет",
    placeholder: "Ваша відповідь",
    submit: "Готово, надіслати",
    submitHint: "Можна надіслати й не все: решту уточнимо.",
    submitted: "Дякуємо! Бриф надіслано. Відповіді можна доповнювати за цим самим посиланням.",
    closed: "Бриф закрито: відповіді збережено, зміни більше не приймаються.",
    notFound: "Посилання недійсне або було відкликане. Попросіть у менеджера нове.",
    files: "Файли",
    filesHint: "Логотип, фото, кейси — перетягніть сюди або натисніть. Вони потраплять у папку проєкту.",
    uploading: "Завантажую…",
    uploaded: "Завантажено",
    uploadError: "Не вдалося завантажити",
    goal: "Мета",
  },
  en: {
    dictate: "Dictate the answer",
    dictateStop: "Stop recording",
    dictating: "Speak — the text will appear in the field",
    dictateError: "Microphone unavailable: allow access in the browser",
    title: "Project brief",
    intro: "Answer the questions — we build your advertising on them. We have already filled in some: please check and correct. Answers save automatically; you can come back to this link at any time.",
    progress: "Completed",
    of: "of",
    saved: "Saved",
    saving: "Saving…",
    saveError: "Not saved — check your connection",
    placeholder: "Your answer",
    submit: "Done, send",
    submitHint: "You can send it incomplete: we will clarify the rest.",
    submitted: "Thank you! The brief has been sent. You can still add to your answers using this link.",
    closed: "The brief is closed: answers are saved and can no longer be changed.",
    notFound: "This link is invalid or has been revoked. Ask your manager for a new one.",
    files: "Files",
    filesHint: "Logo, photos, cases — drop them here or click. They go to the project folder.",
    uploading: "Uploading…",
    uploaded: "Uploaded",
    uploadError: "Upload failed",
    goal: "Goal",
  },
};
