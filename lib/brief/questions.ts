/** Client brief: sections and questions in three languages. Ids are stable — answers are stored by them. */

export const BRIEF_LANGS = ["ru", "uk", "en"] as const;
export type BriefLang = (typeof BRIEF_LANGS)[number];
export const BRIEF_LANG_LABEL: Record<BriefLang, string> = { ru: "Русский", uk: "Українська", en: "English" };

type T = Record<BriefLang, string>;
export interface BriefQuestion {
  id: string;
  q: T;
}
export interface BriefSection {
  id: string;
  title: T;
  goal: T;
  questions: BriefQuestion[];
  /** The section collects files (logo, photos, cases) into the project's Drive folder. */
  files?: boolean;
}

const q = (id: string, ru: string, uk: string, en: string): BriefQuestion => ({ id, q: { ru, uk, en } });

export const BRIEF_SECTIONS: BriefSection[] = [
  {
    id: "business",
    title: { ru: "Бизнес и цели", uk: "Бізнес і цілі", en: "Business and goals" },
    goal: { ru: "понять, что считаем результатом", uk: "зрозуміти, що вважаємо результатом", en: "to agree on what counts as a result" },
    questions: [
      q("biz_about", "Чем занимается компания, сколько лет на рынке, на каких рынках и языках работаете?", "Чим займається компанія, скільки років на ринку, на яких ринках і мовах працюєте?", "What does the company do, how long has it been on the market, which markets and languages do you work in?"),
      q("biz_goal", "Главная цель на ближайшие 3 месяца: заявки, продажи, подписчики, узнаваемость?", "Головна ціль на найближчі 3 місяці: заявки, продажі, підписники, впізнаваність?", "Main goal for the next 3 months: leads, sales, followers, awareness?"),
      q("biz_target", "Сколько заявок и продаж в месяц нужно, чтобы реклама была для вас успешной?", "Скільки заявок і продажів на місяць потрібно, щоб реклама була для вас успішною?", "How many leads and sales per month would make advertising a success for you?"),
      q("biz_capacity", "Сколько заявок и продаж в месяц команда реально может обработать?", "Скільки заявок і продажів на місяць команда реально може обробити?", "How many leads and sales per month can your team actually handle?"),
      q("biz_budget", "Рекламный бюджет в месяц и валюта. Есть ли сезонность, пики и спады?", "Рекламний бюджет на місяць і валюта. Чи є сезонність, піки та спади?", "Monthly ad budget and currency. Any seasonality, peaks and lows?"),
      q("biz_history", "Что уже пробовали в рекламе: каналы, бюджеты, что сработало и что нет? Есть ли доступ к старым кабинетам?", "Що вже пробували в рекламі: канали, бюджети, що спрацювало, а що ні? Чи є доступ до старих кабінетів?", "What have you already tried in advertising: channels, budgets, what worked and what did not? Do you still have access to the old ad accounts?"),
    ],
  },
  {
    id: "product",
    title: { ru: "Продукт", uk: "Продукт", en: "Product" },
    goal: { ru: "раскрыть ценность", uk: "розкрити цінність", en: "to show the value" },
    questions: [
      q("prod_focus", "Какие услуги или продукты продвигаем в первую очередь? Что из них самое маржинальное?", "Які послуги чи продукти просуваємо в першу чергу? Що з них найбільш маржинальне?", "Which services or products do we promote first? Which has the best margin?"),
      q("prod_value", "Что конкретно клиент получает за свои деньги, по каждому продукту или пакету?", "Що конкретно клієнт отримує за свої гроші, по кожному продукту чи пакету?", "What exactly does the customer get for the money, for each product or package?"),
      q("prod_price", "Цены: прайс, пакеты, от чего цена растёт?", "Ціни: прайс, пакети, від чого ціна зростає?", "Prices: price list, packages, what makes the price go up?"),
      q("prod_entry", "Есть ли входной продукт (консультация, аудит, пробный период) и сколько он стоит?", "Чи є вхідний продукт (консультація, аудит, пробний період) і скільки він коштує?", "Is there an entry product (consultation, audit, trial) and what does it cost?"),
      q("prod_quickwin", "Что клиент получает в первые 30 дней? Есть ли «быстрая победа», которую можно показать в рекламе?", "Що клієнт отримує в перші 30 днів? Чи є «швидка перемога», яку можна показати в рекламі?", "What does the customer get in the first 30 days? Is there a quick win we can show in ads?"),
      q("prod_ltv", "Средний чек, повторные покупки, сколько клиент приносит за всё время работы?", "Середній чек, повторні покупки, скільки клієнт приносить за весь час роботи?", "Average order value, repeat purchases, how much does a customer bring over the whole relationship?"),
      q("prod_terms", "Сколько длится оказание услуги? Какие гарантии и какой процент успеха по вашим кейсам?", "Скільки триває надання послуги? Які гарантії та який відсоток успіху у ваших кейсах?", "How long does delivery take? What guarantees do you give and what is your success rate?"),
      q("prod_stop", "С кем и с чем не работаете (стоп-лист ниш, регионов, типов клиентов)?", "З ким і з чим не працюєте (стоп-лист ніш, регіонів, типів клієнтів)?", "Who and what do you not work with (niches, regions, customer types)?"),
      q("prod_competitors", "Чем вы отличаетесь от конкурентов? Назовите 3–5 конкурентов со ссылками.", "Чим ви відрізняєтесь від конкурентів? Назвіть 3–5 конкурентів з посиланнями.", "How are you different from competitors? Name 3–5 competitors with links."),
    ],
  },
  {
    id: "audience",
    title: { ru: "Целевая аудитория", uk: "Цільова аудиторія", en: "Target audience" },
    goal: { ru: "пишите что есть, доработаем вместе", uk: "пишіть що є, доопрацюємо разом", en: "write what you have, we will refine it together" },
    questions: [
      q("aud_segments", "Сегменты аудитории: кто покупает чаще всего, кто приносит больше всего денег?", "Сегменти аудиторії: хто купує найчастіше, хто приносить найбільше грошей?", "Audience segments: who buys most often, who brings the most money?"),
      q("aud_geo", "География, языки, возраст, должность или род занятий.", "Географія, мови, вік, посада чи рід занять.", "Geography, languages, age, job title or occupation."),
      q("aud_pains", "Острые боли: с какой проблемой к вам приходят?", "Гострі болі: з якою проблемою до вас приходять?", "Pain points: what problem do people come to you with?"),
      q("aud_fears", "Страхи и барьеры: почему сомневаются и не покупают?", "Страхи та бар'єри: чому сумніваються і не купують?", "Fears and barriers: why do people hesitate and not buy?"),
      q("aud_objections", "Частые возражения и как вы на них отвечаете?", "Часті заперечення і як ви на них відповідаєте?", "Common objections and how you answer them?"),
      q("aud_channels", "Где аудитория проводит время: соцсети, сообщества, поиск, мероприятия?", "Де аудиторія проводить час: соцмережі, спільноти, пошук, заходи?", "Where does the audience spend time: social networks, communities, search, events?"),
      q("aud_solutions", "Ваше решение для каждого сегмента.", "Ваше рішення для кожного сегмента.", "Your solution for each segment."),
    ],
  },
  {
    id: "sales",
    title: { ru: "Продажи", uk: "Продажі", en: "Sales" },
    goal: { ru: "понять путь от заявки до оплаты", uk: "зрозуміти шлях від заявки до оплати", en: "to understand the path from lead to payment" },
    questions: [
      q("sales_who", "Кто продаёт: владелец, менеджер, отдел? В какие часы и на каких языках отвечают?", "Хто продає: власник, менеджер, відділ? У які години та якими мовами відповідають?", "Who sells: the owner, a manager, a team? During which hours and in which languages do they reply?"),
      q("sales_speed", "Как быстро связываются с заявкой и через какой канал: звонок, WhatsApp, Telegram, почта?", "Як швидко зв'язуються із заявкою і через який канал: дзвінок, WhatsApp, Telegram, пошта?", "How fast do you contact a lead and through which channel: call, WhatsApp, Telegram, email?"),
      q("sales_funnel", "Этапы воронки: что происходит от заявки до оплаты?", "Етапи воронки: що відбувається від заявки до оплати?", "Funnel stages: what happens between a lead and a payment?"),
      q("sales_cycle", "Сколько времени обычно проходит от заявки до оплаты?", "Скільки часу зазвичай минає від заявки до оплати?", "How long does it usually take from a lead to a payment?"),
      q("sales_rate", "Какая сейчас конверсия из заявки в продажу?", "Яка зараз конверсія із заявки в продаж?", "What is the current lead-to-sale conversion rate?"),
      q("sales_qualified", "Какая заявка считается целевой, а какая нецелевой?", "Яка заявка вважається цільовою, а яка нецільовою?", "Which lead counts as qualified and which does not?"),
      q("sales_tracking", "Где ведётся учёт заявок и оплат: CRM, таблица? Кто заполняет статусы и суммы?", "Де ведеться облік заявок і оплат: CRM, таблиця? Хто заповнює статуси та суми?", "Where do you track leads and payments: CRM, spreadsheet? Who fills in statuses and amounts?"),
    ],
  },
  {
    id: "tech",
    title: { ru: "Технические вопросы", uk: "Технічні питання", en: "Technical setup" },
    goal: { ru: "настроить аналитику и доступы", uk: "налаштувати аналітику та доступи", en: "to set up analytics and access" },
    questions: [
      q("tech_site", "Сайт и посадочные: ссылки, на чём сделаны, кто вносит правки?", "Сайт і посадкові: посилання, на чому зроблені, хто вносить правки?", "Website and landing pages: links, platform, who makes changes?"),
      q("tech_analytics", "Установлены ли GA4, GTM, Pixel, Clarity? Настроены ли конверсии?", "Чи встановлені GA4, GTM, Pixel, Clarity? Чи налаштовані конверсії?", "Are GA4, GTM, Pixel, Clarity installed? Are conversions set up?"),
      q("tech_crm", "Есть ли CRM и какая? Можно ли передавать в неё заявки автоматически?", "Чи є CRM і яка? Чи можна передавати в неї заявки автоматично?", "Do you have a CRM and which one? Can leads be sent to it automatically?"),
      q("tech_leads", "Куда сейчас приходят заявки с сайта: почта, мессенджер, таблица?", "Куди зараз приходять заявки із сайту: пошта, месенджер, таблиця?", "Where do website leads go now: email, messenger, spreadsheet?"),
      q("tech_ads", "Рекламные кабинеты Google Ads и Meta: есть ли, кто владелец, были ли блокировки?", "Рекламні кабінети Google Ads і Meta: чи є, хто власник, чи були блокування?", "Google Ads and Meta ad accounts: do you have them, who owns them, any past bans?"),
      q("tech_meta", "Business Manager, страница Facebook, Instagram: есть ли и кто администратор?", "Business Manager, сторінка Facebook, Instagram: чи є і хто адміністратор?", "Business Manager, Facebook page, Instagram: do you have them and who is the admin?"),
      q("tech_domain", "Доступ к домену и хостингу: дадите нам или ставите сами по нашей инструкции?", "Доступ до домену й хостингу: дасте нам чи ставите самі за нашою інструкцією?", "Domain and hosting access: will you give it to us or install things yourself following our guide?"),
      q("tech_payment", "Способ оплаты рекламы: чья карта, нужны ли закрывающие документы?", "Спосіб оплати реклами: чия картка, чи потрібні закриваючі документи?", "How ads are paid: whose card, do you need accounting documents?"),
    ],
  },
  {
    id: "content",
    title: { ru: "Контент и материалы", uk: "Контент і матеріали", en: "Content and materials" },
    goal: { ru: "собрать основу для креативов; файлы можно прикрепить ниже", uk: "зібрати основу для креативів; файли можна прикріпити нижче", en: "to collect the basis for creatives; you can attach files below" },
    files: true,
    questions: [
      q("cont_cases", "Расписанные кейсы и результаты клиентов: цифры, сроки, отзывы.", "Розписані кейси та результати клієнтів: цифри, терміни, відгуки.", "Case studies and customer results: numbers, timelines, reviews."),
      q("cont_media", "Живые фото и видео команды, офиса, процесса работы (ссылки или файлы).", "Живі фото та відео команди, офісу, процесу роботи (посилання або файли).", "Real photos and videos of the team, office, work process (links or files)."),
      q("cont_brand", "Логотип, брендбук, шрифты, цвета (ссылки или файлы).", "Логотип, брендбук, шрифти, кольори (посилання або файли).", "Logo, brand book, fonts, colours (links or files)."),
      q("cont_proof", "Скриншоты результатов, сертификаты, лицензии, награды.", "Скріншоти результатів, сертифікати, ліцензії, нагороди.", "Screenshots of results, certificates, licences, awards."),
      q("cont_social", "Соцсети: какие есть, кто ведёт, как часто выходят публикации?", "Соцмережі: які є, хто веде, як часто виходять публікації?", "Social media: which ones, who runs them, how often do you post?"),
      q("cont_video", "Готовы ли снимать живое видео по нашему сценарию? Кто будет в кадре?", "Чи готові знімати живе відео за нашим сценарієм? Хто буде в кадрі?", "Are you ready to shoot live video from our script? Who will be on camera?"),
    ],
  },
  {
    id: "ads",
    title: { ru: "Вопросы для рекламы", uk: "Питання для реклами", en: "Advertising" },
    goal: { ru: "не слить бюджет на нецелевых", uk: "не злити бюджет на нецільових", en: "not to waste budget on the wrong people" },
    questions: [
      q("ads_qualify", "Вопросы для квалификации лида: бюджет, объём, ниша, срочность и т. д.", "Питання для кваліфікації ліда: бюджет, обсяг, ніша, терміновість тощо.", "Questions to qualify a lead: budget, volume, niche, urgency, etc."),
      q("ads_forbidden", "Что нельзя обещать в рекламе (юридические ограничения, требования площадок, ваша политика)?", "Що не можна обіцяти в рекламі (юридичні обмеження, вимоги майданчиків, ваша політика)?", "What must not be promised in ads (legal limits, platform rules, your own policy)?"),
      q("ads_refs", "Есть ли референсы по креативам, посадочным, воронкам, квизам?", "Чи є референси щодо креативів, посадкових, воронок, квізів?", "Any references for creatives, landing pages, funnels, quizzes?"),
      q("ads_offers", "Акции, спецпредложения, ограничения по срокам: что можно использовать как оффер?", "Акції, спецпропозиції, обмеження за термінами: що можна використати як офер?", "Promotions, special offers, deadlines: what can we use as an offer?"),
      q("ads_geo", "Регионы и языки показа. Есть ли места, где показывать нельзя?", "Регіони та мови показу. Чи є місця, де показувати не можна?", "Regions and languages to target. Anywhere we must not show ads?"),
      q("ads_tone", "Тон общения: на «ты» или на «вы», формально или по-простому?", "Тон спілкування: на «ти» чи на «ви», формально чи по-простому?", "Tone of voice: formal or casual?"),
    ],
  },
  {
    id: "process",
    title: { ru: "Работа с нами", uk: "Робота з нами", en: "Working together" },
    goal: { ru: "договориться о процессе", uk: "домовитися про процес", en: "to agree on the process" },
    questions: [
      q("proc_contact", "Кто контактное лицо и кто согласовывает креативы и тексты? В какой срок?", "Хто контактна особа і хто погоджує креативи й тексти? У який термін?", "Who is the contact person and who approves creatives and copy? How fast?"),
      q("proc_reports", "Как удобнее получать отчёты: чат в Telegram, созвон, раз в неделю или в месяц?", "Як зручніше отримувати звіти: чат у Telegram, дзвінок, раз на тиждень чи на місяць?", "How do you prefer to get reports: Telegram chat, call, weekly or monthly?"),
      q("proc_kpi", "По каким цифрам вы будете оценивать нашу работу?", "За якими цифрами ви оцінюватимете нашу роботу?", "Which numbers will you judge our work by?"),
      q("proc_other", "Что ещё нам важно знать?", "Що ще нам важливо знати?", "Anything else we should know?"),
    ],
  },
];

export const ALL_QUESTION_IDS = BRIEF_SECTIONS.flatMap((s) => s.questions.map((x) => x.id));

/** Interface strings of the client page. */
export const BRIEF_UI: Record<BriefLang, Record<string, string>> = {
  ru: {
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
