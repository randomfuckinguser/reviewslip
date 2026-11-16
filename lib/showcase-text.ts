import type { Locale } from "@/lib/i18n/config";

/**
 * The words on the home page's showcase: real screens from the app, a tab
 * each, in the site's eleven languages.
 *
 * Kept apart from the site dictionaries for the same reason the marketplace's
 * words are (stays-text.ts): it is one section with its own pictures, and the
 * pictures change when the app does, the words with them.
 *
 * Written without a native speaker for every language: plain on purpose, and
 * worth a read before a language is announced.
 */

export type ShotId = "dashboard" | "reviews" | "calendar" | "guest-app" | "phone" | "table-card";

export interface Shot {
  id: ShotId;
  /** The tab. One or two words. */
  tab: string;
  title: string;
  body: string;
  points: [string, string, string];
  alt: string;
}

export interface ShowcaseText {
  eyebrow: string;
  title: string;
  lede: string;
  /** The tab list's name, for screen readers. */
  tabsLabel: string;
  demo: string;
  /** Under the pictures: they are a sample venue, not a real one. */
  note: string;
  shots: Shot[];
}

const en: ShowcaseText = {
  eyebrow: "See it",
  title: "What you get, screen by screen.",
  lede: "Real screens from Reviewslip, shown with a sample guesthouse. It all runs in the browser, on a computer or a phone.",
  tabsLabel: "Screens",
  demo: "Try the live demo",
  note: "Shown with sample data.",
  shots: [
    {
      id: "dashboard",
      tab: "Dashboard",
      title: "Your venue at a glance",
      body: "Today’s arrivals and departures, rooms to clean and how your reviews are doing, all on one screen.",
      points: [
        "Today’s counts, each one opening the screen behind it",
        "Who is arriving and leaving, with their room",
        "Reviews per day and what guests mention most",
      ],
      alt: "The venue dashboard: today’s counts, the front desk, review page health and reviews per day",
    },
    {
      id: "reviews",
      tab: "Reviews",
      title: "Every review in one place",
      body: "What guests wrote here and took to Google, next to what they wrote on your listings themselves.",
      points: [
        "Grouped by the site each review went to",
        "Rate a review to teach the writer what works",
        "See which listing reviews still need an answer",
      ],
      alt: "The reviews page: the latest reviews grouped by listing, with star ratings",
    },
    {
      id: "calendar",
      tab: "Bookings",
      title: "Bookings and a room calendar",
      body: "Take walk-in and phone bookings, give each stay a room and move it by dragging.",
      points: [
        "A line for each room, a bar for each stay",
        "Nightly rates, minimum stays and closed nights",
        "TM30 notices for foreign guests",
      ],
      alt: "The room calendar: a line for each room and a bar for each stay across the month",
    },
    {
      id: "guest-app",
      tab: "Guest App",
      title: "A guest app with nothing to download",
      body: "Guests scan your QR code and get your Wi-Fi, menu, map and LINE as tiles, in your colours.",
      points: [
        "Your links, in the order you choose",
        "Guests can join your mailing list",
        "A printable welcome card with the QR code",
      ],
      alt: "The Guest App settings: the QR code, the guests’ links and who signed up",
    },
    {
      id: "phone",
      tab: "Phone",
      title: "Guests call you from the app",
      body: "A Call button in the Guest App rings your staff’s phones. No phone line and no extra hardware.",
      points: [
        "Rings even when the app is closed",
        "Choose who answers each venue’s calls",
        "A missed call leaves a voice message",
      ],
      alt: "The Reviewslip Phone on a mobile: on duty, with a voice message waiting",
    },
    {
      id: "table-card",
      tab: "Table Card",
      title: "A table card ready to print",
      body: "An A5 card in your venue’s look, with the QR code to your review page, in two languages.",
      points: [
        "Download a PDF or print it straight away",
        "A second language for your guests",
        "For tables, rooms and the counter",
      ],
      alt: "The table card: an A5 card with the venue’s name and a QR code to its review page",
    },
  ],
};

const th: ShowcaseText = {
  eyebrow: "ดูตัวอย่าง",
  title: "สิ่งที่คุณจะได้ ทีละหน้าจอ",
  lede: "หน้าจอจริงจาก Reviewslip แสดงด้วยเกสต์เฮาส์ตัวอย่าง ทุกอย่างใช้งานบนเบราว์เซอร์ ทั้งบนคอมพิวเตอร์และโทรศัพท์",
  tabsLabel: "หน้าจอ",
  demo: "ลองเดโม",
  note: "แสดงด้วยข้อมูลตัวอย่าง",
  shots: [
    {
      id: "dashboard",
      tab: "แดชบอร์ด",
      title: "ภาพรวมที่พักของคุณ",
      body: "แขกที่มาถึงและออกวันนี้ ห้องที่ต้องทำความสะอาด และรีวิวของคุณ ทั้งหมดในหน้าจอเดียว",
      points: [
        "ตัวเลขของวันนี้ แต่ละรายการเปิดหน้าจอที่เกี่ยวข้อง",
        "ใครมาถึงและใครออก พร้อมหมายเลขห้อง",
        "รีวิวต่อวันและหัวข้อที่แขกพูดถึงมากที่สุด",
      ],
      alt: "แดชบอร์ดที่พัก: ตัวเลขของวันนี้ แผนกต้อนรับ สถานะหน้ารีวิว และรีวิวต่อวัน",
    },
    {
      id: "reviews",
      tab: "รีวิว",
      title: "รีวิวทั้งหมดในที่เดียว",
      body: "รีวิวที่แขกเขียนที่นี่และนำไปโพสต์บน Google คู่กับรีวิวที่แขกเขียนบนหน้าเพจของคุณเอง",
      points: [
        "จัดกลุ่มตามเว็บไซต์ที่รีวิวถูกโพสต์",
        "ให้คะแนนรีวิวเพื่อสอนตัวช่วยเขียนว่าอะไรดี",
        "ดูว่ารีวิวไหนยังไม่ได้ตอบ",
      ],
      alt: "หน้ารีวิว: รีวิวล่าสุดจัดกลุ่มตามเว็บไซต์ พร้อมคะแนนดาว",
    },
    {
      id: "calendar",
      tab: "การจอง",
      title: "การจองและปฏิทินห้องพัก",
      body: "รับการจองแบบวอล์กอินและทางโทรศัพท์ จัดห้องให้แต่ละการเข้าพัก และย้ายได้ด้วยการลาก",
      points: [
        "หนึ่งแถวต่อห้อง หนึ่งแถบต่อการเข้าพัก",
        "ราคาต่อคืน จำนวนคืนขั้นต่ำ และคืนที่ปิดขาย",
        "แจ้ง ตม.30 สำหรับแขกชาวต่างชาติ",
      ],
      alt: "ปฏิทินห้องพัก: หนึ่งแถวต่อห้องและหนึ่งแถบต่อการเข้าพักตลอดเดือน",
    },
    {
      id: "guest-app",
      tab: "แอปแขก",
      title: "แอปสำหรับแขกที่ไม่ต้องดาวน์โหลด",
      body: "แขกสแกน QR code แล้วเห็น Wi-Fi เมนู แผนที่ และ LINE ของคุณเป็นปุ่ม ในสีของคุณ",
      points: [
        "ลิงก์ของคุณ เรียงตามที่คุณเลือก",
        "แขกสมัครรับข่าวสารจากคุณได้",
        "การ์ดต้อนรับพร้อม QR code สำหรับพิมพ์",
      ],
      alt: "การตั้งค่าแอปแขก: QR code ลิงก์สำหรับแขก และรายชื่อแขกที่สมัคร",
    },
    {
      id: "phone",
      tab: "โทรศัพท์",
      title: "แขกโทรหาคุณจากแอป",
      body: "ปุ่มโทรในแอปแขกจะดังที่โทรศัพท์ของพนักงาน ไม่ต้องมีสายโทรศัพท์หรืออุปกรณ์เพิ่ม",
      points: [
        "ดังแม้ปิดแอปอยู่",
        "เลือกได้ว่าใครรับสายของแต่ละที่พัก",
        "สายที่ไม่ได้รับจะฝากข้อความเสียงไว้",
      ],
      alt: "Reviewslip Phone บนมือถือ: กำลังรับสาย มีข้อความเสียงรออยู่",
    },
    {
      id: "table-card",
      tab: "การ์ดตั้งโต๊ะ",
      title: "การ์ดตั้งโต๊ะพร้อมพิมพ์",
      body: "การ์ดขนาด A5 ในสไตล์ของที่พัก พร้อม QR code ไปยังหน้ารีวิว เป็นสองภาษา",
      points: [
        "ดาวน์โหลดเป็น PDF หรือพิมพ์ได้ทันที",
        "ภาษาที่สองสำหรับแขกของคุณ",
        "สำหรับโต๊ะ ห้องพัก และเคาน์เตอร์",
      ],
      alt: "การ์ดตั้งโต๊ะ: การ์ด A5 พร้อมชื่อที่พักและ QR code ไปยังหน้ารีวิว",
    },
  ],
};

const zh: ShowcaseText = {
  eyebrow: "看一看",
  title: "逐个界面，看看您能得到什么。",
  lede: "Reviewslip 的真实界面，以一家示例民宿展示。全部在浏览器中运行，电脑和手机都可以用。",
  tabsLabel: "界面",
  demo: "试用在线演示",
  note: "使用示例数据展示。",
  shots: [
    {
      id: "dashboard",
      tab: "仪表板",
      title: "一眼看清您的店",
      body: "今天的入住和退房、待打扫的房间以及评价情况，都在一个界面上。",
      points: [
        "今天的各项数字，点击即可打开对应界面",
        "谁入住、谁退房，以及他们的房间",
        "每日评价数和客人最常提到的话题",
      ],
      alt: "店铺仪表板：今日数字、前台、评价页状态和每日评价",
    },
    {
      id: "reviews",
      tab: "评价",
      title: "所有评价集中在一处",
      body: "客人在这里写好并发到 Google 的评价，和他们直接在您的页面上写的评价放在一起。",
      points: [
        "按评价发布的网站分组",
        "给评价打分，教写作助手什么样的好",
        "查看哪些评价还没有回复",
      ],
      alt: "评价页面：按网站分组的最新评价，带星级",
    },
    {
      id: "calendar",
      tab: "预订",
      title: "预订和房间日历",
      body: "接受到店和电话预订，为每次入住分配房间，拖动即可调整。",
      points: [
        "每个房间一行，每次入住一条",
        "每晚价格、最少入住晚数和关房日期",
        "外国客人的 TM30 通知",
      ],
      alt: "房间日历：每个房间一行，整月每次入住一条",
    },
    {
      id: "guest-app",
      tab: "客人应用",
      title: "无需下载的客人应用",
      body: "客人扫描二维码，就能以按钮形式看到您的 Wi-Fi、菜单、地图和 LINE，使用您的品牌颜色。",
      points: [
        "您的链接，按您选择的顺序排列",
        "客人可以订阅您的邮件",
        "带二维码、可打印的欢迎卡",
      ],
      alt: "客人应用设置：二维码、客人链接和已注册的客人",
    },
    {
      id: "phone",
      tab: "电话",
      title: "客人从应用里给您打电话",
      body: "客人应用里的呼叫按钮会让员工的手机响铃。无需电话线路，也无需额外设备。",
      points: [
        "应用关闭时也会响铃",
        "选择由谁接听每家店的电话",
        "未接来电会留下语音留言",
      ],
      alt: "手机上的 Reviewslip Phone：值班中，有一条语音留言",
    },
    {
      id: "table-card",
      tab: "桌卡",
      title: "可直接打印的桌卡",
      body: "符合您店铺风格的 A5 卡片，带有通往评价页的二维码，支持两种语言。",
      points: [
        "下载 PDF 或直接打印",
        "为客人添加第二种语言",
        "适合餐桌、客房和前台",
      ],
      alt: "桌卡：印有店名和评价页二维码的 A5 卡片",
    },
  ],
};

const ja: ShowcaseText = {
  eyebrow: "画面を見る",
  title: "画面ごとに、できることをご紹介。",
  lede: "Reviewslip の実際の画面を、サンプルのゲストハウスでお見せします。すべてブラウザで動き、パソコンでもスマートフォンでも使えます。",
  tabsLabel: "画面",
  demo: "ライブデモを試す",
  note: "サンプルデータで表示しています。",
  shots: [
    {
      id: "dashboard",
      tab: "ダッシュボード",
      title: "施設の今がひと目でわかる",
      body: "今日のチェックインとチェックアウト、清掃が必要な部屋、レビューの状況を一画面で。",
      points: [
        "今日の件数。それぞれから詳しい画面を開けます",
        "到着する人と出発する人、その部屋",
        "1日ごとのレビュー数と、よく選ばれる話題",
      ],
      alt: "施設のダッシュボード：今日の件数、フロント、レビューページの状態、1日ごとのレビュー",
    },
    {
      id: "reviews",
      tab: "レビュー",
      title: "すべてのレビューを一か所に",
      body: "ここで書かれて Google に投稿されたレビューと、各サイトに直接書かれたレビューを並べて表示します。",
      points: [
        "投稿先のサイトごとにまとめて表示",
        "評価をつけて、文章アシスタントに良い例を教える",
        "まだ返信していないレビューがわかる",
      ],
      alt: "レビュー画面：サイトごとにまとめた最新のレビューと星の評価",
    },
    {
      id: "calendar",
      tab: "予約",
      title: "予約と客室カレンダー",
      body: "飛び込みや電話の予約を受け、宿泊ごとに部屋を割り当て、ドラッグで移動できます。",
      points: [
        "部屋ごとに1行、宿泊ごとに1本のバー",
        "1泊ごとの料金、最低泊数、販売停止日",
        "外国人宿泊者の TM30 通知",
      ],
      alt: "客室カレンダー：部屋ごとの行と、1か月分の宿泊のバー",
    },
    {
      id: "guest-app",
      tab: "ゲストアプリ",
      title: "ダウンロード不要のゲストアプリ",
      body: "ゲストが QR コードを読み取ると、Wi-Fi、メニュー、地図、LINE がボタンで表示されます。色はあなたの施設のものです。",
      points: [
        "リンクは好きな順番に並べられます",
        "ゲストはメールマガジンに登録できます",
        "QR コード付きの印刷用ウェルカムカード",
      ],
      alt: "ゲストアプリの設定：QR コード、ゲスト向けリンク、登録したゲスト",
    },
    {
      id: "phone",
      tab: "電話",
      title: "ゲストがアプリから電話できる",
      body: "ゲストアプリの通話ボタンでスタッフのスマートフォンが鳴ります。電話回線も追加の機器も不要です。",
      points: [
        "アプリを閉じていても鳴ります",
        "施設ごとに電話に出る人を選べます",
        "出られなかった電話には音声メッセージが残ります",
      ],
      alt: "スマートフォンの Reviewslip Phone：対応中、音声メッセージが1件",
    },
    {
      id: "table-card",
      tab: "卓上カード",
      title: "すぐに印刷できる卓上カード",
      body: "施設のデザインに合わせた A5 カード。レビューページへの QR コード付きで、2か国語に対応します。",
      points: [
        "PDF をダウンロード、またはそのまま印刷",
        "ゲスト向けに2つ目の言語を追加",
        "テーブル、客室、カウンターに",
      ],
      alt: "卓上カード：施設名とレビューページへの QR コードが入った A5 カード",
    },
  ],
};

const ko: ShowcaseText = {
  eyebrow: "살펴보기",
  title: "화면별로 보는 Reviewslip.",
  lede: "샘플 게스트하우스로 보여 드리는 Reviewslip의 실제 화면입니다. 모두 브라우저에서 작동하며 컴퓨터와 휴대폰에서 쓸 수 있습니다.",
  tabsLabel: "화면",
  demo: "라이브 데모 체험하기",
  note: "샘플 데이터로 표시했습니다.",
  shots: [
    {
      id: "dashboard",
      tab: "대시보드",
      title: "숙소 현황을 한눈에",
      body: "오늘의 체크인과 체크아웃, 청소할 객실, 리뷰 현황을 한 화면에서 봅니다.",
      points: [
        "오늘의 수치, 각각 해당 화면으로 연결",
        "도착하고 떠나는 사람과 객실",
        "일별 리뷰 수와 손님이 가장 많이 언급한 주제",
      ],
      alt: "숙소 대시보드: 오늘의 수치, 프런트, 리뷰 페이지 상태, 일별 리뷰",
    },
    {
      id: "reviews",
      tab: "리뷰",
      title: "모든 리뷰를 한곳에서",
      body: "여기서 작성해 Google에 올린 리뷰와 손님이 각 사이트에 직접 남긴 리뷰를 함께 봅니다.",
      points: [
        "리뷰가 올라간 사이트별로 묶어서 표시",
        "리뷰에 별점을 매겨 작성 도우미에게 좋은 예를 알려 줌",
        "아직 답하지 않은 리뷰 확인",
      ],
      alt: "리뷰 화면: 사이트별로 묶인 최신 리뷰와 별점",
    },
    {
      id: "calendar",
      tab: "예약",
      title: "예약과 객실 캘린더",
      body: "방문 및 전화 예약을 받고, 숙박마다 객실을 배정하고, 끌어서 옮길 수 있습니다.",
      points: [
        "객실마다 한 줄, 숙박마다 막대 하나",
        "1박 요금, 최소 숙박일, 판매 중지일",
        "외국인 손님을 위한 TM30 신고",
      ],
      alt: "객실 캘린더: 객실별 줄과 한 달 동안의 숙박 막대",
    },
    {
      id: "guest-app",
      tab: "게스트 앱",
      title: "다운로드가 필요 없는 게스트 앱",
      body: "손님이 QR 코드를 스캔하면 Wi-Fi, 메뉴, 지도, LINE이 숙소 색상의 버튼으로 나타납니다.",
      points: [
        "원하는 순서로 링크 배치",
        "손님이 메일링 리스트에 가입 가능",
        "QR 코드가 있는 인쇄용 웰컴 카드",
      ],
      alt: "게스트 앱 설정: QR 코드, 손님용 링크, 가입한 손님",
    },
    {
      id: "phone",
      tab: "전화",
      title: "손님이 앱에서 바로 전화",
      body: "게스트 앱의 통화 버튼을 누르면 직원 휴대폰이 울립니다. 전화 회선도 추가 장비도 필요 없습니다.",
      points: [
        "앱이 닫혀 있어도 울림",
        "숙소별로 전화 받을 사람 선택",
        "받지 못한 전화는 음성 메시지로 남음",
      ],
      alt: "휴대폰의 Reviewslip Phone: 근무 중, 음성 메시지 1개",
    },
    {
      id: "table-card",
      tab: "테이블 카드",
      title: "바로 인쇄하는 테이블 카드",
      body: "숙소 디자인에 맞춘 A5 카드로, 리뷰 페이지로 가는 QR 코드가 들어 있으며 두 가지 언어를 지원합니다.",
      points: [
        "PDF로 내려받거나 바로 인쇄",
        "손님을 위한 두 번째 언어",
        "테이블, 객실, 카운터에 비치",
      ],
      alt: "테이블 카드: 숙소 이름과 리뷰 페이지 QR 코드가 있는 A5 카드",
    },
  ],
};

const es: ShowcaseText = {
  eyebrow: "Míralo",
  title: "Lo que obtienes, pantalla a pantalla.",
  lede: "Pantallas reales de Reviewslip, con una casa de huéspedes de ejemplo. Todo funciona en el navegador, en el ordenador o en el móvil.",
  tabsLabel: "Pantallas",
  demo: "Prueba la demo",
  note: "Con datos de ejemplo.",
  shots: [
    {
      id: "dashboard",
      tab: "Panel",
      title: "Tu negocio de un vistazo",
      body: "Las llegadas y salidas de hoy, las habitaciones por limpiar y cómo van tus reseñas, en una sola pantalla.",
      points: [
        "Las cifras de hoy, cada una abre su pantalla",
        "Quién llega y quién se va, con su habitación",
        "Reseñas por día y los temas que más mencionan los huéspedes",
      ],
      alt: "El panel del negocio: cifras de hoy, recepción, estado de la página de reseñas y reseñas por día",
    },
    {
      id: "reviews",
      tab: "Reseñas",
      title: "Todas las reseñas en un lugar",
      body: "Lo que los huéspedes escribieron aquí y llevaron a Google, junto a lo que escribieron en tus fichas.",
      points: [
        "Agrupadas por el sitio al que fue cada reseña",
        "Valora una reseña para enseñar al asistente qué funciona",
        "Mira qué reseñas siguen sin respuesta",
      ],
      alt: "La página de reseñas: las últimas reseñas agrupadas por sitio, con estrellas",
    },
    {
      id: "calendar",
      tab: "Reservas",
      title: "Reservas y calendario de habitaciones",
      body: "Toma reservas en persona y por teléfono, asigna una habitación a cada estancia y muévela arrastrando.",
      points: [
        "Una línea por habitación, una barra por estancia",
        "Precios por noche, estancias mínimas y noches cerradas",
        "Avisos TM30 para huéspedes extranjeros",
      ],
      alt: "El calendario de habitaciones: una línea por habitación y una barra por estancia a lo largo del mes",
    },
    {
      id: "guest-app",
      tab: "App de huéspedes",
      title: "Una app de huéspedes sin descargas",
      body: "Los huéspedes escanean tu código QR y ven tu Wi-Fi, menú, mapa y LINE como botones, con tus colores.",
      points: [
        "Tus enlaces, en el orden que elijas",
        "Los huéspedes pueden unirse a tu lista de correo",
        "Una tarjeta de bienvenida imprimible con el código QR",
      ],
      alt: "Los ajustes de la app de huéspedes: el código QR, los enlaces y quién se ha registrado",
    },
    {
      id: "phone",
      tab: "Teléfono",
      title: "Los huéspedes te llaman desde la app",
      body: "Un botón de llamada en la app hace sonar el móvil de tu personal. Sin línea telefónica ni equipos extra.",
      points: [
        "Suena aunque la app esté cerrada",
        "Elige quién atiende las llamadas de cada negocio",
        "Una llamada perdida deja un mensaje de voz",
      ],
      alt: "Reviewslip Phone en un móvil: de guardia, con un mensaje de voz pendiente",
    },
    {
      id: "table-card",
      tab: "Tarjeta de mesa",
      title: "Una tarjeta de mesa lista para imprimir",
      body: "Una tarjeta A5 con el estilo de tu negocio y el código QR de tu página de reseñas, en dos idiomas.",
      points: [
        "Descarga un PDF o imprímela al momento",
        "Un segundo idioma para tus huéspedes",
        "Para mesas, habitaciones y el mostrador",
      ],
      alt: "La tarjeta de mesa: una tarjeta A5 con el nombre del negocio y un código QR a su página de reseñas",
    },
  ],
};

const fr: ShowcaseText = {
  eyebrow: "Aperçu",
  title: "Ce que vous obtenez, écran par écran.",
  lede: "De vrais écrans de Reviewslip, avec une maison d’hôtes d’exemple. Tout fonctionne dans le navigateur, sur ordinateur comme sur téléphone.",
  tabsLabel: "Écrans",
  demo: "Essayer la démo",
  note: "Affiché avec des données d’exemple.",
  shots: [
    {
      id: "dashboard",
      tab: "Tableau de bord",
      title: "Votre établissement en un coup d’œil",
      body: "Les arrivées et départs du jour, les chambres à nettoyer et l’état de vos avis, sur un seul écran.",
      points: [
        "Les chiffres du jour, chacun ouvrant son écran",
        "Qui arrive et qui part, avec leur chambre",
        "Les avis par jour et les sujets les plus cités",
      ],
      alt: "Le tableau de bord : chiffres du jour, réception, état de la page d’avis et avis par jour",
    },
    {
      id: "reviews",
      tab: "Avis",
      title: "Tous vos avis au même endroit",
      body: "Ce que les clients ont écrit ici et publié sur Google, à côté de ce qu’ils ont écrit directement sur vos fiches.",
      points: [
        "Regroupés par site de publication",
        "Notez un avis pour montrer à l’assistant ce qui marche",
        "Voyez quels avis attendent encore une réponse",
      ],
      alt: "La page des avis : les derniers avis regroupés par site, avec des étoiles",
    },
    {
      id: "calendar",
      tab: "Réservations",
      title: "Réservations et planning des chambres",
      body: "Prenez les réservations sur place et par téléphone, attribuez une chambre à chaque séjour et déplacez-le d’un glisser.",
      points: [
        "Une ligne par chambre, une barre par séjour",
        "Prix par nuit, séjours minimum et nuits fermées",
        "Déclarations TM30 pour les clients étrangers",
      ],
      alt: "Le planning des chambres : une ligne par chambre et une barre par séjour sur le mois",
    },
    {
      id: "guest-app",
      tab: "Appli client",
      title: "Une appli client sans téléchargement",
      body: "Vos clients scannent le QR code et trouvent votre Wi-Fi, menu, plan et LINE sous forme de boutons, à vos couleurs.",
      points: [
        "Vos liens, dans l’ordre de votre choix",
        "Les clients peuvent s’inscrire à vos e-mails",
        "Une carte de bienvenue imprimable avec le QR code",
      ],
      alt: "Les réglages de l’appli client : le QR code, les liens et les inscrits",
    },
    {
      id: "phone",
      tab: "Téléphone",
      title: "Vos clients vous appellent depuis l’appli",
      body: "Un bouton d’appel dans l’appli fait sonner le téléphone de votre équipe. Ni ligne téléphonique ni matériel en plus.",
      points: [
        "Sonne même appli fermée",
        "Choisissez qui répond pour chaque établissement",
        "Un appel manqué laisse un message vocal",
      ],
      alt: "Reviewslip Phone sur un mobile : en service, avec un message vocal en attente",
    },
    {
      id: "table-card",
      tab: "Chevalet",
      title: "Un chevalet prêt à imprimer",
      body: "Une carte A5 aux couleurs de votre établissement, avec le QR code de votre page d’avis, en deux langues.",
      points: [
        "Téléchargez un PDF ou imprimez tout de suite",
        "Une deuxième langue pour vos clients",
        "Pour les tables, les chambres et le comptoir",
      ],
      alt: "Le chevalet : une carte A5 avec le nom de l’établissement et un QR code vers sa page d’avis",
    },
  ],
};

const de: ShowcaseText = {
  eyebrow: "Ansehen",
  title: "Was Sie bekommen, Bildschirm für Bildschirm.",
  lede: "Echte Bildschirme aus Reviewslip, gezeigt mit einem Beispiel-Gästehaus. Alles läuft im Browser, am Computer oder auf dem Handy.",
  tabsLabel: "Bildschirme",
  demo: "Live-Demo ausprobieren",
  note: "Mit Beispieldaten gezeigt.",
  shots: [
    {
      id: "dashboard",
      tab: "Übersicht",
      title: "Ihr Betrieb auf einen Blick",
      body: "Die heutigen Anreisen und Abreisen, die zu reinigenden Zimmer und Ihre Bewertungen auf einem Bildschirm.",
      points: [
        "Die Zahlen von heute, jede öffnet ihren Bildschirm",
        "Wer anreist und wer abreist, mit Zimmer",
        "Bewertungen pro Tag und die häufigsten Themen",
      ],
      alt: "Die Übersicht: Zahlen von heute, Rezeption, Zustand der Bewertungsseite und Bewertungen pro Tag",
    },
    {
      id: "reviews",
      tab: "Bewertungen",
      title: "Alle Bewertungen an einem Ort",
      body: "Was Gäste hier geschrieben und zu Google gebracht haben, neben dem, was sie direkt auf Ihren Einträgen schrieben.",
      points: [
        "Nach der Website gruppiert, auf der sie landeten",
        "Bewerten Sie eine Bewertung, damit der Assistent lernt, was gut ist",
        "Sehen Sie, welche Bewertungen noch eine Antwort brauchen",
      ],
      alt: "Die Bewertungsseite: die neuesten Bewertungen nach Website gruppiert, mit Sternen",
    },
    {
      id: "calendar",
      tab: "Buchungen",
      title: "Buchungen und Zimmerkalender",
      body: "Nehmen Sie Buchungen vor Ort und am Telefon an, geben Sie jedem Aufenthalt ein Zimmer und verschieben Sie ihn per Ziehen.",
      points: [
        "Eine Zeile pro Zimmer, ein Balken pro Aufenthalt",
        "Preise pro Nacht, Mindestaufenthalte und geschlossene Nächte",
        "TM30-Meldungen für ausländische Gäste",
      ],
      alt: "Der Zimmerkalender: eine Zeile pro Zimmer und ein Balken pro Aufenthalt über den Monat",
    },
    {
      id: "guest-app",
      tab: "Gäste-App",
      title: "Eine Gäste-App ohne Download",
      body: "Gäste scannen Ihren QR-Code und finden WLAN, Speisekarte, Karte und LINE als Kacheln in Ihren Farben.",
      points: [
        "Ihre Links in der Reihenfolge, die Sie wählen",
        "Gäste können sich für Ihre E-Mails eintragen",
        "Eine druckbare Willkommenskarte mit QR-Code",
      ],
      alt: "Die Einstellungen der Gäste-App: QR-Code, Links für Gäste und wer sich eingetragen hat",
    },
    {
      id: "phone",
      tab: "Telefon",
      title: "Gäste rufen Sie aus der App an",
      body: "Ein Anruf-Knopf in der Gäste-App lässt die Handys Ihres Teams klingeln. Ohne Telefonleitung und ohne zusätzliche Geräte.",
      points: [
        "Klingelt auch bei geschlossener App",
        "Legen Sie fest, wer für welchen Betrieb abnimmt",
        "Ein verpasster Anruf hinterlässt eine Sprachnachricht",
      ],
      alt: "Reviewslip Phone auf dem Handy: im Dienst, mit einer wartenden Sprachnachricht",
    },
    {
      id: "table-card",
      tab: "Tischkarte",
      title: "Eine druckfertige Tischkarte",
      body: "Eine A5-Karte im Stil Ihres Betriebs, mit dem QR-Code zu Ihrer Bewertungsseite, in zwei Sprachen.",
      points: [
        "Als PDF herunterladen oder direkt drucken",
        "Eine zweite Sprache für Ihre Gäste",
        "Für Tische, Zimmer und die Theke",
      ],
      alt: "Die Tischkarte: eine A5-Karte mit dem Namen des Betriebs und einem QR-Code zur Bewertungsseite",
    },
  ],
};

const it: ShowcaseText = {
  eyebrow: "Guarda",
  title: "Cosa ottieni, schermata per schermata.",
  lede: "Schermate reali di Reviewslip, con una guesthouse di esempio. Tutto funziona nel browser, sul computer o sul telefono.",
  tabsLabel: "Schermate",
  demo: "Prova la demo",
  note: "Mostrato con dati di esempio.",
  shots: [
    {
      id: "dashboard",
      tab: "Dashboard",
      title: "La tua struttura a colpo d’occhio",
      body: "Arrivi e partenze di oggi, camere da pulire e l’andamento delle recensioni, in una sola schermata.",
      points: [
        "I numeri di oggi, ognuno apre la sua schermata",
        "Chi arriva e chi parte, con la camera",
        "Recensioni al giorno e i temi più citati dagli ospiti",
      ],
      alt: "La dashboard: numeri di oggi, reception, stato della pagina recensioni e recensioni al giorno",
    },
    {
      id: "reviews",
      tab: "Recensioni",
      title: "Tutte le recensioni in un posto",
      body: "Ciò che gli ospiti hanno scritto qui e portato su Google, accanto a ciò che hanno scritto direttamente sulle tue schede.",
      points: [
        "Raggruppate per il sito in cui sono state pubblicate",
        "Valuta una recensione per insegnare all’assistente cosa funziona",
        "Vedi quali recensioni aspettano ancora una risposta",
      ],
      alt: "La pagina delle recensioni: le ultime recensioni raggruppate per sito, con le stelle",
    },
    {
      id: "calendar",
      tab: "Prenotazioni",
      title: "Prenotazioni e calendario delle camere",
      body: "Prendi prenotazioni di persona e al telefono, assegna una camera a ogni soggiorno e spostalo trascinando.",
      points: [
        "Una riga per camera, una barra per soggiorno",
        "Prezzi a notte, soggiorni minimi e notti chiuse",
        "Notifiche TM30 per gli ospiti stranieri",
      ],
      alt: "Il calendario delle camere: una riga per camera e una barra per soggiorno nel mese",
    },
    {
      id: "guest-app",
      tab: "App ospiti",
      title: "Un’app per gli ospiti senza download",
      body: "Gli ospiti scansionano il QR code e trovano Wi-Fi, menu, mappa e LINE come pulsanti, nei tuoi colori.",
      points: [
        "I tuoi link, nell’ordine che scegli",
        "Gli ospiti possono iscriversi alla tua mailing list",
        "Un biglietto di benvenuto stampabile con il QR code",
      ],
      alt: "Le impostazioni dell’app ospiti: il QR code, i link e chi si è iscritto",
    },
    {
      id: "phone",
      tab: "Telefono",
      title: "Gli ospiti ti chiamano dall’app",
      body: "Un pulsante di chiamata nell’app fa squillare i telefoni del tuo staff. Senza linea telefonica né hardware aggiuntivo.",
      points: [
        "Squilla anche con l’app chiusa",
        "Scegli chi risponde per ogni struttura",
        "Una chiamata persa lascia un messaggio vocale",
      ],
      alt: "Reviewslip Phone su un cellulare: in servizio, con un messaggio vocale in attesa",
    },
    {
      id: "table-card",
      tab: "Cartoncino",
      title: "Un cartoncino da tavolo pronto da stampare",
      body: "Un cartoncino A5 nello stile della tua struttura, con il QR code della pagina recensioni, in due lingue.",
      points: [
        "Scarica un PDF o stampalo subito",
        "Una seconda lingua per i tuoi ospiti",
        "Per tavoli, camere e bancone",
      ],
      alt: "Il cartoncino da tavolo: un A5 con il nome della struttura e un QR code alla pagina recensioni",
    },
  ],
};

const pt: ShowcaseText = {
  eyebrow: "Veja",
  title: "O que você recebe, tela por tela.",
  lede: "Telas reais do Reviewslip, com uma pousada de exemplo. Tudo funciona no navegador, no computador ou no celular.",
  tabsLabel: "Telas",
  demo: "Experimente a demonstração",
  note: "Mostrado com dados de exemplo.",
  shots: [
    {
      id: "dashboard",
      tab: "Painel",
      title: "Seu negócio num relance",
      body: "As chegadas e saídas de hoje, os quartos a limpar e como estão suas avaliações, numa só tela.",
      points: [
        "Os números de hoje, cada um abre sua tela",
        "Quem chega e quem sai, com o quarto",
        "Avaliações por dia e os temas mais citados",
      ],
      alt: "O painel: números de hoje, recepção, estado da página de avaliações e avaliações por dia",
    },
    {
      id: "reviews",
      tab: "Avaliações",
      title: "Todas as avaliações num só lugar",
      body: "O que os hóspedes escreveram aqui e levaram ao Google, ao lado do que escreveram diretamente nas suas páginas.",
      points: [
        "Agrupadas pelo site onde foram publicadas",
        "Dê nota a uma avaliação para ensinar o assistente",
        "Veja quais avaliações ainda precisam de resposta",
      ],
      alt: "A página de avaliações: as últimas avaliações agrupadas por site, com estrelas",
    },
    {
      id: "calendar",
      tab: "Reservas",
      title: "Reservas e calendário de quartos",
      body: "Receba reservas no balcão e por telefone, dê um quarto a cada estadia e mova-a arrastando.",
      points: [
        "Uma linha por quarto, uma barra por estadia",
        "Preços por noite, estadias mínimas e noites fechadas",
        "Avisos TM30 para hóspedes estrangeiros",
      ],
      alt: "O calendário de quartos: uma linha por quarto e uma barra por estadia ao longo do mês",
    },
    {
      id: "guest-app",
      tab: "App do hóspede",
      title: "Um app para hóspedes sem download",
      body: "Os hóspedes leem o seu QR code e veem Wi-Fi, cardápio, mapa e LINE como botões, nas suas cores.",
      points: [
        "Seus links, na ordem que você escolher",
        "Os hóspedes podem entrar na sua lista de e-mails",
        "Um cartão de boas-vindas para imprimir com o QR code",
      ],
      alt: "As configurações do app do hóspede: o QR code, os links e quem se cadastrou",
    },
    {
      id: "phone",
      tab: "Telefone",
      title: "Os hóspedes ligam para você pelo app",
      body: "Um botão de chamada no app faz tocar o celular da sua equipe. Sem linha telefônica e sem equipamento extra.",
      points: [
        "Toca mesmo com o app fechado",
        "Escolha quem atende as chamadas de cada negócio",
        "Uma chamada perdida deixa uma mensagem de voz",
      ],
      alt: "O Reviewslip Phone num celular: de plantão, com uma mensagem de voz à espera",
    },
    {
      id: "table-card",
      tab: "Cartão de mesa",
      title: "Um cartão de mesa pronto para imprimir",
      body: "Um cartão A5 com o estilo do seu negócio e o QR code da sua página de avaliações, em dois idiomas.",
      points: [
        "Baixe um PDF ou imprima na hora",
        "Um segundo idioma para seus hóspedes",
        "Para mesas, quartos e o balcão",
      ],
      alt: "O cartão de mesa: um A5 com o nome do negócio e um QR code para a página de avaliações",
    },
  ],
};

const nl: ShowcaseText = {
  eyebrow: "Bekijk het",
  title: "Wat je krijgt, scherm voor scherm.",
  lede: "Echte schermen uit Reviewslip, getoond met een voorbeeldpension. Alles werkt in de browser, op een computer of een telefoon.",
  tabsLabel: "Schermen",
  demo: "Probeer de live demo",
  note: "Getoond met voorbeeldgegevens.",
  shots: [
    {
      id: "dashboard",
      tab: "Dashboard",
      title: "Je zaak in één oogopslag",
      body: "De aankomsten en vertrekken van vandaag, de kamers om schoon te maken en hoe je reviews ervoor staan, op één scherm.",
      points: [
        "De cijfers van vandaag, elk opent zijn eigen scherm",
        "Wie aankomt en wie vertrekt, met hun kamer",
        "Reviews per dag en de onderwerpen die gasten het vaakst noemen",
      ],
      alt: "Het dashboard: cijfers van vandaag, de receptie, de staat van de reviewpagina en reviews per dag",
    },
    {
      id: "reviews",
      tab: "Reviews",
      title: "Alle reviews op één plek",
      body: "Wat gasten hier schreven en naar Google brachten, naast wat ze zelf op je vermeldingen schreven.",
      points: [
        "Gegroepeerd per site waar de review terechtkwam",
        "Beoordeel een review om de schrijfhulp te leren wat werkt",
        "Zie welke reviews nog een antwoord nodig hebben",
      ],
      alt: "De reviewpagina: de nieuwste reviews gegroepeerd per site, met sterren",
    },
    {
      id: "calendar",
      tab: "Boekingen",
      title: "Boekingen en een kamerkalender",
      body: "Neem boekingen aan de balie en per telefoon aan, geef elk verblijf een kamer en verplaats het door te slepen.",
      points: [
        "Een regel per kamer, een balk per verblijf",
        "Prijzen per nacht, minimale verblijven en gesloten nachten",
        "TM30-meldingen voor buitenlandse gasten",
      ],
      alt: "De kamerkalender: een regel per kamer en een balk per verblijf over de maand",
    },
    {
      id: "guest-app",
      tab: "Gasten-app",
      title: "Een gasten-app zonder download",
      body: "Gasten scannen je QR-code en zien je wifi, menu, kaart en LINE als tegels, in jouw kleuren.",
      points: [
        "Je links, in de volgorde die jij kiest",
        "Gasten kunnen zich aanmelden voor je mailinglijst",
        "Een afdrukbare welkomstkaart met de QR-code",
      ],
      alt: "De instellingen van de gasten-app: de QR-code, de links en wie zich heeft aangemeld",
    },
    {
      id: "phone",
      tab: "Telefoon",
      title: "Gasten bellen je vanuit de app",
      body: "Een belknop in de gasten-app laat de telefoons van je personeel overgaan. Geen telefoonlijn en geen extra apparatuur.",
      points: [
        "Gaat over, ook als de app dicht is",
        "Kies wie de oproepen van elke zaak beantwoordt",
        "Een gemiste oproep laat een spraakbericht achter",
      ],
      alt: "Reviewslip Phone op een telefoon: in dienst, met een wachtend spraakbericht",
    },
    {
      id: "table-card",
      tab: "Tafelkaart",
      title: "Een tafelkaart klaar om te printen",
      body: "Een A5-kaart in de stijl van je zaak, met de QR-code naar je reviewpagina, in twee talen.",
      points: [
        "Download een pdf of print hem meteen",
        "Een tweede taal voor je gasten",
        "Voor tafels, kamers en de balie",
      ],
      alt: "De tafelkaart: een A5-kaart met de naam van de zaak en een QR-code naar de reviewpagina",
    },
  ],
};

const TEXT: Record<Locale, ShowcaseText> = { en, th, zh, ja, ko, es, fr, de, it, pt, nl };

export function showcaseText(lang: Locale): ShowcaseText {
  return TEXT[lang] ?? en;
}
