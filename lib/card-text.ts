/**
 * The few words on the printed table card, in the languages a guest reads.
 *
 * Here rather than in the review app's strings.js, although that file holds the
 * guest page's eleven languages, because none of this text appears there: a
 * card says "scan this", and a screen never has to. Two homes for translations
 * is a smell; two homes for two different sets of words is just where they
 * live.
 *
 * Why the card needs a second language at all. Reviewslip's first customers are
 * in Chiang Mai, and their reviews come in Thai — of the reviews on the listing
 * this was checked against, every one was. A card on a table in San Kamphaeng
 * that reads only "Scan to leave us a review" is asking the half of the room
 * most likely to write something to work out what it wants.
 *
 * The English is the original. The rest were composed against the vocabulary
 * the guest page already uses in each language, and they are short, plain and
 * literal on purpose — but they have not been read by a native speaker of every
 * one of them, and the card page says so where somebody is about to print two
 * hundred of them.
 */

export interface CardText {
  /** The name of the language, in that language. For the picker. */
  name: string;
  /** The instruction, which is the whole point of the card. */
  scan: string;
  /** How long it takes. The objection everybody has, answered before it. */
  minute: string;
  /** The welcome card's instruction: the guest app, not the review page. */
  welcome: string;
  /** What the guest app holds, in the welcome card's second line. */
  welcomeHint: string;
}

export const CARD_TEXT: Record<string, CardText> = {
  en: {
    name: "English",
    scan: "Scan to leave us a review",
    minute: "Takes about a minute",
    welcome: "Scan for our guest app",
    welcomeHint: "Everything for your stay, on your phone",
  },
  th: {
    name: "ไทย",
    scan: "สแกนเพื่อเขียนรีวิว",
    minute: "ใช้เวลาประมาณ 1 นาที",
    welcome: "สแกนเพื่อเปิดแอปสำหรับแขก",
    welcomeHint: "ทุกอย่างสำหรับการเข้าพัก ในโทรศัพท์ของคุณ",
  },
  zh: {
    name: "中文",
    scan: "扫码写评价",
    minute: "大约一分钟",
    welcome: "扫码打开宾客应用",
    welcomeHint: "住宿所需，尽在手机",
  },
  ja: {
    name: "日本語",
    scan: "スキャンしてレビューを書く",
    minute: "所要時間は約1分",
    welcome: "スキャンしてゲストアプリを開く",
    welcomeHint: "滞在に必要なものをスマホで",
  },
  ko: {
    name: "한국어",
    scan: "스캔해서 리뷰 남기기",
    minute: "약 1분이면 됩니다",
    welcome: "스캔해서 게스트 앱 열기",
    welcomeHint: "숙박에 필요한 모든 것을 휴대폰으로",
  },
  es: {
    name: "Español",
    scan: "Escanea para dejarnos una reseña",
    minute: "Tarda alrededor de un minuto",
    welcome: "Escanea para abrir nuestra app de huéspedes",
    welcomeHint: "Todo para tu estancia, en tu móvil",
  },
  fr: {
    name: "Français",
    scan: "Scannez pour nous laisser un avis",
    minute: "Cela prend environ une minute",
    welcome: "Scannez pour ouvrir notre appli client",
    welcomeHint: "Tout pour votre séjour, sur votre téléphone",
  },
  de: {
    name: "Deutsch",
    scan: "Scannen und Bewertung schreiben",
    minute: "Dauert etwa eine Minute",
    welcome: "Scannen und unsere Gäste-App öffnen",
    welcomeHint: "Alles für deinen Aufenthalt auf dem Handy",
  },
  it: {
    name: "Italiano",
    scan: "Scansiona per lasciarci una recensione",
    minute: "Ci vuole circa un minuto",
    welcome: "Scansiona per aprire l'app per gli ospiti",
    welcomeHint: "Tutto per il tuo soggiorno, sul telefono",
  },
  pt: {
    name: "Português",
    scan: "Digitalize para deixar uma avaliação",
    minute: "Leva cerca de um minuto",
    welcome: "Digitalize para abrir o app de hóspedes",
    welcomeHint: "Tudo para a sua estadia, no seu celular",
  },
  nl: {
    name: "Nederlands",
    scan: "Scan om een review achter te laten",
    minute: "Duurt ongeveer een minuut",
    welcome: "Scan om onze gasten-app te openen",
    welcomeHint: "Alles voor je verblijf op je telefoon",
  },
};

/**
 * The second language a card carries, by default.
 *
 * Thai, because this is sold in Thailand and the guests writing the reviews are
 * writing them in Thai. A venue that wants another picks it; a venue that wants
 * none turns it off. Defaulting to nothing would mean the venues that most need
 * the second line are the ones who never discover it exists.
 */
export const DEFAULT_SECOND = "th";

export function cardText(code: string): CardText {
  return CARD_TEXT[code] ?? CARD_TEXT.en;
}

/** The languages a card can be printed in, English first then by name. */
export function cardLanguages(): { code: string; name: string }[] {
  return Object.entries(CARD_TEXT)
    .map(([code, t]) => ({ code, name: t.name }))
    .sort((a, b) => (a.code === "en" ? -1 : b.code === "en" ? 1 : a.name.localeCompare(b.name)));
}
