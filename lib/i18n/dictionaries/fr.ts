import type { Dictionary } from "./en";

const fr: Dictionary = {
  common: {
    getInTouch: "Contactez-nous",
    tryDemo: "Essayer la démo en direct",
    brandNote: "Reviewslip aide uniquement les vrais clients à rédiger leurs propres avis.",
  },

  selectors: {
    language: "Langue",
    country: "Pays",
  },

  seo: {
    home: {
      title: "Reviewslip — Plus d'avis Google 5 étoiles",
      description:
        "Reviewslip aide vos clients satisfaits à rédiger un véritable avis Google en quelques secondes. Scannez un QR code, ajustez le brouillon et publiez.",
    },
    pricing: {
      title: "Tarifs",
      description:
        "Des formules Reviewslip simples, pour un ou plusieurs établissements. Comparez Starter, Pro et Enterprise — toutes incluent les mêmes fonctionnalités.",
    },
    howItWorks: {
      title: "Comment ça marche",
      description:
        "Du scan du QR code à l'avis Google publié en trois clics. Découvrez comment Reviewslip aide vos vrais clients à laisser un avis en quelques secondes.",
    },
    compliance: {
      title: "Conformité et confiance",
      description:
        "Comment Reviewslip reste du bon côté des lois sur les faux avis (États-Unis, UE, Royaume-Uni, Asie) et des politiques des plateformes — en n'aidant que de vrais clients.",
    },
    demo: {
      title: "Démo en direct",
      description:
        "Essayez Reviewslip vous-même. Choisissez ce qui vous a marqué et voyez apparaître un vrai brouillon d'avis 5 étoiles — sans inscription.",
    },
    faq: {
      title: "Guide et FAQ",
      description:
        "Mener un programme d'avis sans être signalé : bonne configuration, rythme à tenir, signaux surveillés par Google et ce qui est en jeu.",
    },
    contact: {
      title: "Contact",
      description:
        "Contactez-nous au sujet de Reviewslip pour votre entreprise. Parlez-nous de vos établissements : nous vous aiderons à obtenir plus d'avis Google.",
    },
    privacy: {
      title: "Politique de confidentialité",
      description:
        "Comment Reviewslip collecte, utilise et protège les données des entreprises et de leurs clients.",
    },
    terms: {
      title: "Conditions d'utilisation",
      description:
        "Les conditions régissant l'utilisation de Reviewslip, y compris l'usage acceptable et les comportements interdits.",
    },
    login: {
      title: "Connexion",
      description:
        "Connectez-vous à votre compte Reviewslip pour gérer vos établissements, vos QR codes et vos slips d'avis.",
    },
    signup: {
      title: "Créer un compte",
      description:
        "Créez votre compte Reviewslip et commencez à transformer de vrais clients en avis honnêtes.",
    },
  },

  nav: {
    howItWorks: "Comment ça marche",
    features: "Fonctionnalités",
    pricing: "Tarifs",
    trust: "Confiance",
    demo: "Démo en direct",
    faq: "Guide et FAQ",
    contact: "Contact",
    login: "Connexion",
    signup: "Créer un compte",
  },

  footer: {
    blurb: "Aidez vos clients satisfaits à laisser un véritable avis Google en quelques secondes.",
    colProduct: "Produit",
    colCompany: "Entreprise",
    colGetStarted: "Commencer",
    complianceTrust: "Conformité et confiance",
    privacy: "Confidentialité",
    terms: "Conditions",
    rights: "© {year} Reviewslip. Tous droits réservés.",
  },

  home: {
    heroEyebrow: "De vrais avis, en toute simplicité",
    heroTitleLead: "Transformez vos belles visites en",
    heroTitleEm: "avis 5 étoiles.",
    heroLede:
      "Reviewslip aide vos clients satisfaits à rédiger et publier un véritable avis Google en quelques secondes. Ils scannent, sélectionnent ce qu'ils ont aimé et partagent — avec leurs propres mots.",
    heroNote: "Jamais de faux avis. Uniquement de vrais clients, avec leurs propres mots.",

    proofRating: "La confiance de l'hôtellerie et des commerces de proximité",
    proofBuiltFor: "Conçu pour les cafés, gîtes, salons, cliniques et bien plus",

    howEyebrow: "Comment ça marche",
    howTitle: "Trois taps entre la visite et l'avis.",
    steps: [
      {
        title: "Scanner",
        body: "Votre client satisfait scanne un QR code et arrive sur votre fiche d'avis personnalisée.",
      },
      {
        title: "Rédiger",
        body: "Il sélectionne ce qui l'a marqué ; Reviewslip rédige un court et véritable avis 5 étoiles qu'il peut modifier.",
      },
      {
        title: "Publier",
        body: "Un tap le copie et ouvre votre fiche Google. L'avis est publié en quelques secondes.",
      },
    ],

    featuresEyebrow: "Fonctionnalités",
    featuresTitle: "Tout ce qu'il vous faut pour obtenir plus d'avis authentiques.",
    features: [
      {
        title: "Un QR code au moment qui compte",
        body: "Placez une fiche sur la table, le reçu ou dans la chambre. Un simple scan ouvre votre page d'avis personnalisée — aucune application à télécharger.",
      },
      {
        title: "Des brouillons adaptés à votre établissement",
        body: "L'IA rédige dans votre ton en utilisant uniquement des détails réels et sûrs sur votre établissement. Les clients choisissent ce qu'ils ont aimé ; nous le formulons.",
      },
      {
        title: "Un tap vers Google",
        body: "Copiez le brouillon et ouvrez instantanément votre page d'avis Google. Moins d'abandons entre l'envie de laisser un avis et sa publication.",
      },
      {
        title: "Régénérer pour trouver les bons mots",
        body: "Pas tout à fait ça ? Un simple tap propose une nouvelle formulation, pour que chaque avis ressemble au client, et non à un modèle.",
      },
      {
        title: "Uniquement de vrais clients",
        body: "Pas de génération en masse, pas de faux comptes. Un brouillon par visite authentique — conçu pour vous garder du bon côté des règles des plateformes.",
      },
      {
        title: "Votre établissement, votre message",
        body: "Personnalisez les catégories et le ton pour chaque emplacement, afin que chaque brouillon semble provenir de votre établissement.",
      },
    ],

    metrics: [
      { value: "3×", label: "d'avis en plus des mêmes clients satisfaits*" },
      { value: "20s", label: "de temps moyen entre le scan et la publication de l'avis*" },
      { value: "4.9★", label: "moyenne typique des avis assistés*" },
    ],
    metricsFootnote:
      "*Chiffres illustratifs — de véritables références seront publiées au lancement.",

    pricingEyebrow: "Tarifs",
    pricingTitle: "Des offres simples qui évoluent avec vous.",
    pricingCompare: "Voir la comparaison complète des offres →",

    trustEyebrow: "Conformité et confiance",
    trustTitle: "Honnête par conception.",
    trustLede:
      "Des États-Unis à l'Europe et à l'Asie, les régulateurs — comme toutes les grandes plateformes — interdisent les faux avis et les avis fabriqués par IA. Reviewslip est conçu à l'opposé : il aide uniquement un vrai client à exprimer une véritable opinion. Pas de bots, pas de masse, pas de détails inventés.",
    trustCta: "Découvrir notre approche de la conformité",

    faqEyebrow: "Questions",
    faqTitle: "Questions fréquentes.",
    faqMore: "Lire le guide complet : mise en place, risques et signaux d'alerte →",
    faq: [
      {
        q: "N'est-ce pas simplement de faux avis ?",
        a: "Non — et c'est tout l'intérêt. Reviewslip aide uniquement un vrai client qui vient de vivre une véritable expérience à mettre ses propres pensées en mots. Il n'y a aucune génération en masse ni aucune publication au nom de quiconque. Le client rédige, modifie et publie lui-même.",
      },
      {
        q: "Est-ce autorisé par les politiques de Google et par la loi ?",
        a: "Aider un vrai client à rédiger son propre avis honnête est permis. Fabriquer des avis, les inciter ou en publier de faux ne l'est pas — que ce soit au regard de la règle de la FTC aux États-Unis, des lois sur les avis de l'UE et du Royaume-Uni, des règles asiatiques telles que l'interdiction du marketing furtif au Japon, ou des politiques des plateformes. Reviewslip est spécialement conçu pour éviter tout cela. Consultez notre page Conformité et confiance pour plus de détails.",
      },
      {
        q: "Quelles plateformes d'avis sont prises en charge ?",
        a: "Google, TripAdvisor, LINE, Facebook, Xiaohongshu et Wongnai. Reviewslip aide vos clients à publier sur la plateforme la plus importante pour votre entreprise et votre région.",
      },
      {
        q: "Combien de temps prend la configuration ?",
        a: "Quelques minutes. Nous ajoutons votre établissement et votre lien d'avis Google, ajustons les catégories et le ton à votre activité, et vous remettons un QR code prêt à être placé.",
      },
      {
        q: "Ai-je besoin de ma propre clé IA ?",
        a: "Non. La génération des avis est prise en charge pour vous et incluse dans chaque offre.",
      },
    ],

    ctaTitle: "Vos clients les plus satisfaits n'attendent que de s'exprimer.",
    ctaLede: "Offrez-leur le moyen le plus simple de le dire.",
  },

  pricing: {
    eyebrow: "Tarifs",
    title: "Des offres qui évoluent avec vous.",
    lede: "Commencez modestement avec un seul emplacement. Développez-vous à mesure que davantage de vos clients satisfaits laissent des avis.",
    disclaimer: "Les tarifs affichés sont provisoires pendant que nous finalisons les offres.",
    monthly: "Mensuel",
    yearly: "Annuel",
    savings: "2 mois offerts",
    billedAnnually: "Facturé annuellement · 2 mois offerts",
    mostPopular: "Le plus populaire",
    perMonth: "/mois",
    perYear: "/an",
    free: "Gratuit",
    custom: "Sur mesure",
    faqTitle: "Questions sur les tarifs",
    faq: [
      {
        q: "Les tarifs sont-ils définitifs ?",
        a: "Pas encore — les chiffres affichés sont provisoires pendant que nous finalisons les offres. Les niveaux et les fonctionnalités correspondent globalement à ce qui est prévu ; les tarifs définitifs seront confirmés avant le lancement.",
      },
      {
        q: "Qu'est-ce qui compte comme une génération ?",
        a: "Chaque fois que l'application rédige un avis pour un client compte comme une génération. Régénérer pour obtenir une nouvelle formulation au cours de la même session utilise aussi votre quota, mais les limites restent généreuses.",
      },
      {
        q: "Puis-je changer d'offre plus tard ?",
        a: "Oui. Contactez-nous simplement et nous vous ferons passer à une offre supérieure ou inférieure quand vous le souhaitez.",
      },
      {
        q: "Quelle est la différence entre les offres ?",
        a: "Uniquement le nombre d'établissements que vous pouvez gérer — 1 avec Starter, jusqu'à 3 avec Pro et jusqu'à 10 avec Enterprise. Chaque offre inclut les mêmes fonctionnalités ; vous ne payez plus qu'en ajoutant des emplacements.",
      },
    ],
  },

  plans: {
    starterName: "Starter",
    starterTagline: "Pour un établissement unique qui débute.",
    proName: "Pro",
    proTagline: "Pour les entreprises en croissance avec quelques établissements.",
    businessName: "Enterprise",
    businessTagline: "Pour les entreprises multi-établissements.",
    cta: "Contactez-nous",
    features: {
      venues1: "1 établissement",
      venues3: "Jusqu'à 3 établissements",
      venues10: "Jusqu'à 10 établissements",
      qr: "QR code + lien d'avis partageable",
      drafts: "Brouillons d'avis assistés par IA",
      oneTap: "Copier et publier sur Google en un tap",
      branding: "Marque Reviewslip sur la fiche",
    },
  },

  how: {
    eyebrow: "Comment ça marche",
    title: "Trois taps entre la visite et l'avis.",
    lede: "Reviewslip supprime les frictions entre un client satisfait et l'avis qu'il comptait laisser — sans jamais en rédiger un faux.",
    steps: [
      {
        title: "Placez votre QR code",
        body: "Ajoutez un QR code Reviewslip à vos reçus, chevalets de table, chambres ou écran de paiement. Chaque code renvoie vers une fiche d'avis personnalisée pour cet emplacement précis.",
      },
      {
        title: "Le client scanne",
        body: "Aucune application à installer. La fiche s'ouvre dans son navigateur, l'accueille au nom de votre établissement et lui pose une question simple : qu'est-ce qui vous a marqué ?",
      },
      {
        title: "Il choisit ce qu'il a aimé",
        body: "Le client sélectionne quelques éléments qu'il a réellement appréciés — un service chaleureux, une excellente cuisine, un cadre agréable. Ceux-ci deviennent la base honnête de l'avis.",
      },
      {
        title: "Reviewslip le rédige",
        body: "En une ou deux secondes, un court avis 5 étoiles naturel apparaît dans le ton de votre établissement — en utilisant uniquement des détails réels et sûrs. Le client peut modifier chaque mot.",
      },
      {
        title: "Un tap pour publier",
        body: "Il copie le brouillon et accède à votre page d'avis Google. L'avis est le sien, avec ses mots, publié depuis son compte.",
      },
    ],
    demoNote: "Un aperçu fonctionnel — appuyez sur les puces et générez un brouillon vous-même.",
  },

  compliance: {
    eyebrow: "Conformité et confiance",
    title: "Honnête par conception.",
    lede: "Les faux avis sont illégaux et contraires aux règles de toutes les plateformes. Reviewslip est conçu de fond en comble pour faire l'inverse : aider de vrais clients à partager de vraies opinions, plus rapidement.",
    calloutLead: "En bref :",
    callout:
      "Reviewslip ne rédige jamais de faux avis, ne publie jamais au nom d'un client et ne génère jamais d'avis en masse. Un vrai client, après une véritable visite, est aidé à formuler son propre avis honnête — et le publie lui-même.",
    h1: "Les règles autour desquelles nous concevons",
    p1: "Les faux avis sont illégaux dans un nombre croissant de pays, et non dans un seul. Aux États-Unis, la règle de 2024 de la FTC interdit les faux avis et les avis fabriqués par IA, les avis incités non divulgués et d'autres pratiques trompeuses, avec des sanctions par infraction. Dans l'Union européenne, la directive sur les pratiques commerciales déloyales (Unfair Commercial Practices Directive) — mise à jour par la directive Omnibus (Omnibus Directive) — exige que les avis soient authentiques et vérifiables, et le règlement sur les services numériques (Digital Services Act) ajoute des obligations au niveau des plateformes ; au Royaume-Uni, le Digital Markets, Competition and Consumers Act 2024 interdit purement et simplement les avis faux et trompeurs. En Asie, les règles japonaises de 2023 sur le marketing furtif et la loi chinoise contre la concurrence déloyale visent les avis fabriqués ou non divulgués. Google, TripAdvisor, Trustpilot et les autres plateformes interdisent les mêmes pratiques dans le monde entier. Ces règles existent pour de bonnes raisons, et nous les prenons au sérieux.",
    h2: "Comment Reviewslip reste conforme",
    list: [
      "Vrai client, véritable expérience. L'outil est destiné à être utilisé dans votre établissement par une personne qui l'a réellement visité.",
      "Le client est l'auteur. Il choisit ce qu'il souhaite mettre en avant, modifie librement le brouillon et le publie depuis son propre compte. Nous ne publions jamais à sa place.",
      "Aucun détail inventé. Les instructions sont limitées à des détails sûrs et véridiques sur votre établissement — l'IA ne peut pas inventer de faits, d'événements ou d'affirmations.",
      "Aucune publication en masse ou automatisée. Un brouillon par session authentique. Il n'existe aucun moyen de générer ou de soumettre des avis en masse.",
      "Aucune incitation intégrée. Reviewslip n'offre ni n'encourage de récompenses en échange d'avis.",
    ],
    h3: "Ce que Reviewslip n'est pas",
    p3: "Ce n'est pas une ferme à avis, un réseau de bots ni un moyen d'acheter des étoiles. Si c'est ce que vous recherchez, Reviewslip n'est pas l'outil — et honnêtement, ces approches feront pénaliser votre fiche.",
    h4: "Votre responsabilité",
    p4Lead: "Vous vous engagez à utiliser Reviewslip uniquement avec de vrais clients et conformément aux politiques des plateformes d'avis et à la loi applicable. Tous les détails figurent dans nos ",
    p4Link: "Conditions d'utilisation",
    p4End: ".",
    disclaimer:
      "Cette page est un résumé en langage clair, et non un conseil juridique. Consultez les directives en vigueur de la FTC, de l'UE, du Royaume-Uni et les directives locales — ainsi que les politiques de chaque plateforme — pour chaque marché où vous exercez.",
  },

  faqPage: {
    eyebrow: "Guide et FAQ",
    title: "Comment utiliser Reviewslip sans être signalé.",
    lede: "Reviewslip n'est utile que si vous l'utilisez comme les plateformes d'avis l'attendent. Ce guide couvre une mise en place correcte, le rythme à tenir, les schémas qui font filtrer ou sanctionner les campagnes d'avis, et ce qui est réellement en jeu si vous vous y prenez mal.",

    warningLead: "La plus grosse erreur :",
    warning:
      "Ne remettre le QR code qu'aux clients que vous pensez satisfaits. C'est de la sollicitation sélective des avis (review gating) — Google l'interdit, tout comme les règles de protection des consommateurs, de la FTC aux États-Unis à l'UE, au Royaume-Uni et à l'Asie. Proposez le même parcours d'avis à tout le monde, et laissez les opinions honnêtes se déposer où elles se déposent.",

    sections: [
      {
        title: "La mise en place",
        blurb:
          "La plupart des problèmes se créent dès le départ. L'endroit et le moment où vous placez le QR code déterminent si les avis qui suivront paraîtront naturels.",
        items: [
          {
            q: "Où placer le QR code ?",
            a: "À un endroit par lequel passe chaque client à la fin de sa visite — sur le reçu, un chevalet de table, le classeur de la chambre, l'écran de paiement. L'objectif est que tout le monde ait la même occasion de le scanner, et non que vous choisissiez qui le voit. Évitez les emplacements où seuls certains clients le rencontreront.",
          },
          {
            q: "Quel est le bon moment pour demander ?",
            a: "Une fois l'expérience terminée — au moment de payer, du départ ou de la sortie. Assez tôt pour que la visite soit encore fraîche à l'esprit, assez tard pour qu'ils aient réellement vécu l'ensemble. Ne sollicitez pas en plein service : vous demanderiez à quelqu'un d'évaluer quelque chose qu'il n'a pas terminé.",
          },
          {
            q: "Dois-je demander à tous les clients, ou seulement à ceux qui sont satisfaits ?",
            a: "À tous les clients. Ne solliciter que les personnes dont vous attendez un avis positif constitue une sollicitation sélective des avis (review gating), interdite par les politiques de Google et par les règles de protection des consommateurs, de la FTC aux États-Unis à l'UE, au Royaume-Uni et à l'Asie. C'est également contre-productif : une fiche où absolument tous les avis sont de cinq étoiles inspire moins confiance aux acheteurs qu'une fiche présentant une répartition réaliste. Rendez le QR code accessible à tout le monde.",
          },
          {
            q: "Et si quelqu'un a eu une mauvaise expérience ?",
            a: "Laissez-le le dire — ou mieux, réglez le problème avant son départ. Reviewslip rédige à partir de ce que le client sélectionne ; la voie honnête pour un visiteur mécontent est donc d'écrire ses propres mots ou de vous en parler directement. Ce que vous ne devez jamais faire, c'est masquer le parcours d'avis ou en priver quelqu'un parce que vous vous attendez à une critique. Supprimer les avis négatifs est précisément ce que la règle de la FTC — et ses équivalents dans l'UE, au Royaume-Uni et en Asie — ont été écrits pour empêcher.",
          },
        ],
      },
      {
        title: "Rythme et schémas",
        blurb:
          "Les avis authentiques s'accumulent à un rythme crédible. La forme de votre historique d'avis compte autant que leur contenu.",
        items: [
          {
            q: "Combien d'avis, en combien de temps, est-ce trop ?",
            a: "Il n'existe aucun seuil publié — Google n'en publie pas, et quiconque cite un chiffre précis fait une supposition. Le principe est celui de la proportionnalité : votre rythme d'avis doit ressembler à une fraction plausible de votre volume réel de clients, et il ne doit pas changer brusquement. Un café qui sert 500 personnes par semaine peut en soutenir bien plus qu'une maison d'hôtes de six chambres. Comme règle empirique, si les avis d'une seule semaine devaient augmenter votre total historique de plus d'environ un cinquième, levez le pied.",
          },
          {
            q: "À quoi ressemble concrètement un pic suspect ?",
            a: "Une fiche qui affichait en moyenne deux avis par mois pendant trois ans et qui en recueille ensuite quarante en neuf jours présente la signature typique des avis achetés, et les filtres automatiques sont réglés précisément pour cette forme. Les avis peuvent ne jamais apparaître, apparaître puis disparaître quelques jours plus tard, ou entraîner l'examen de la fiche entière. Une montée en puissance progressive — une fraction des clients au début, élargie au fil des semaines — évite entièrement cette forme.",
          },
          {
            q: "Est-ce un problème si tout le monde publie depuis mon WiFi ?",
            a: "Oui, et c'est un piège fréquent. Si chaque client scanne et publie en étant connecté à votre réseau invité, un lot d'avis provient tout entier d'une seule adresse IP. C'est un fort signal de regroupement, et cela ressemble beaucoup à quelqu'un qui publierait des avis depuis l'arrière-boutique. Les clients qui utilisent leurs propres données mobiles évitent naturellement ce problème : ne poussez donc pas les gens à se connecter au WiFi de l'établissement uniquement pour laisser un avis.",
          },
          {
            q: "Les clients peuvent-ils publier depuis une tablette au comptoir ?",
            a: "Non. Plusieurs avis provenant d'un même appareil — même empreinte, souvent le même navigateur connecté — comptent parmi les signaux d'avis artificiels les plus évidents qui soient. Cela vous place aussi à un pas de rédiger l'avis vous-même. Les avis doivent toujours provenir du téléphone du client et de son propre compte.",
          },
          {
            q: "Puis-je envoyer un e-mail ou un SMS à toute ma liste de clients d'un coup ?",
            a: "Soyez prudent. Un envoi massif à des milliers d'anciens clients produit exactement le pic de vitesse décrit plus haut, et des avis portant sur des visites remontant à plusieurs mois sont plus vagues et moins crédibles. Si vous prenez contact, procédez par petits lots, auprès de clients récents, et étalez-les dans le temps.",
          },
        ],
      },
      {
        title: "Les signaux d'alerte qui vous font sanctionner",
        blurb:
          "Voici les pratiques qui transforment un programme d'avis légitime en risque. Aucune n'en vaut la peine.",
        items: [
          {
            q: "Puis-je offrir une remise ou un produit gratuit en échange d'un avis ?",
            a: "Non. Les avis incités sont interdits par Google, et également visés par la règle de la FTC et ses équivalents dans l'UE, au Royaume-Uni et en Asie. Cela vaut même si vous accepteriez volontiers un avis négatif en échange — c'est le paiement qui pose problème, pas le sentiment exprimé. Vous pouvez remercier les gens. Vous ne pouvez pas les payer.",
          },
          {
            q: "Le personnel, les amis ou la famille peuvent-ils laisser des avis ?",
            a: "Non. Les avis provenant de personnes liées à l'entreprise sont purement et simplement interdits et sont souvent faciles à repérer. Cela inclut le personnel qui évalue son propre lieu de travail et le fait de demander à des amis de gonfler le compteur après un mauvais mois.",
          },
          {
            q: "Les avis rédigés par IA vont-ils tous se ressembler ?",
            a: "Ils le peuvent, et c'est un risque réel. Reviewslip l'atténue en rédigeant à partir des éléments précis que chaque client sélectionne et en proposant de nouvelles formulations lors de la régénération — mais la véritable protection, c'est que le client modifie le texte. Encouragez-le. Une page d'avis partageant la même structure de phrases et le même vocabulaire constitue un schéma détectable, peu importe qui ou quoi les a écrits.",
          },
          {
            q: "Puis-je rédiger l'avis pour un client qui dit être satisfait ?",
            a: "Non. Même avec son accord verbal, le fait que vous le rédigiez et le publiiez en fait un avis émanant de vous, et non de lui — et c'est la définition même d'un faux avis, selon la politique de Google, selon la règle de la FTC aux États-Unis comme selon les lois sur les avis dans l'UE, au Royaume-Uni et en Asie. Remettez-lui le QR code et laissez-le faire.",
          },
        ],
      },
      {
        title: "Ce qui est réellement en jeu",
        blurb:
          "Les conséquences vont de l'invisible au grave, et certaines surviennent des mois après les faits.",
        items: [
          {
            q: "Quel est le pire qui puisse arriver ?",
            a: "À peu près par ordre de gravité : des avis individuels sont filtrés et n'apparaissent jamais ; un lot est supprimé rétroactivement, parfois des mois plus tard ; la fiche reçoit une alerte consommateur avertissant les visiteurs qu'une activité suspecte a été détectée ; ou la fiche est suspendue. Sur le plan juridique, la règle de la FTC aux États-Unis prévoit des sanctions civiles évaluées par infraction — c'est-à-dire par faux avis, et non par entreprise — et les régimes de l'UE, du Royaume-Uni et d'Asie prévoient leurs propres amendes et mesures d'application. Et il y a tout simplement l'atteinte à la réputation lorsqu'on est publiquement pris sur le fait.",
          },
          {
            q: "Qu'interdisent réellement ces règles ?",
            a: "Que ce soit dans la règle de la FTC aux États-Unis, les lois sur les avis de l'UE et du Royaume-Uni ou leurs équivalents asiatiques, les cibles communes sont les mêmes : les faux avis et les avis fabriqués par IA émanant de personnes n'ayant jamais vécu de véritable expérience, les avis incités ou sponsorisés non divulgués, les initiés se faisant passer pour des clients, ainsi que la suppression ou la dissimulation d'avis négatifs. Ce qu'aucune d'elles n'interdit, c'est d'aider un vrai client à mettre en mots sa propre opinion honnête — ce qui est précisément la conception de Reviewslip.",
          },
          {
            q: "Si des avis sont supprimés, est-ce la faute de Reviewslip ou la mienne ?",
            a: "La vôtre, en pratique. Reviewslip limite ce que l'IA peut dire et ne publie jamais au nom de quiconque, mais il ne peut pas contrôler à qui vous remettez le QR code, avec quelle insistance vous sollicitez, ni si vous offrez des incitations. Ce sont les pratiques décrites sur cette page qui déterminent le résultat.",
          },
          {
            q: "Cela s'applique-t-il en dehors des États-Unis ?",
            a: "Oui — la règle de la FTC est une loi américaine, mais la plupart des marchés disposent désormais des leurs. La directive sur les pratiques commerciales déloyales de l'UE (Unfair Commercial Practices Directive, mise à jour par la directive Omnibus) et le règlement sur les services numériques (Digital Services Act), le Digital Markets, Competition and Consumers Act 2024 du Royaume-Uni, la réglementation japonaise de 2023 sur le marketing furtif et les règles chinoises contre la concurrence déloyale visant les avis fabriqués ciblent tous les mêmes comportements — et plusieurs se sont durcis. Les politiques des plateformes (Google, TripAdvisor, Facebook, LINE, Xiaohongshu, Wongnai) s'appliquent partout quoi qu'il en soit. Considérez ces recommandations comme un plancher, et non comme un plafond, et vérifiez les règles des marchés où vous exercez.",
          },
        ],
      },
      {
        title: "Bien mener son programme",
        blurb:
          "À quoi ressemble concrètement un programme d'avis sain et durable.",
        items: [
          {
            q: "À quoi ressemble un schéma d'avis sain ?",
            a: "Un flux régulier plutôt que des rafales. Un mélange de notes plutôt qu'un mur de cinq étoiles. Des avis de longueur variable — certains d'une ligne, d'autres détaillés. Des horaires répartis sur les jours et les heures plutôt que regroupés. Des réponses du propriétaire aux bons comme aux mauvais avis. Ce profil correspond à la fois à ce qu'attendent les plateformes et à ce qui convainc réellement une personne qui consulte votre fiche.",
          },
          {
            q: "Comment gérer un avis négatif ?",
            a: "Répondez publiquement, sans polémiquer. Reconnaissez-le, ajoutez brièvement du contexte s'il y en a, et indiquez ce que vous changez. Les clients potentiels lisent les réponses aussi attentivement que les avis. Ne demandez pas sa suppression sauf s'il enfreint réellement la politique de la plateforme, et n'essayez jamais de l'enterrer sous un afflux de nouveaux avis positifs — c'est de nouveau le schéma du pic, cette fois avec un motif évident.",
          },
          {
            q: "En combien de temps verrai-je des résultats ?",
            a: "Plus lentement que vous ne le souhaiteriez, et c'est justement l'intérêt. Un programme qui ajoute une poignée d'avis authentiques chaque semaine se cumule en une fiche nettement plus solide au fil des mois, sans jamais paraître anormal à aucun moment. Les tentatives de comprimer cela en une quinzaine de jours sont ce qui déclenche tout ce qui est décrit plus haut.",
          },
          {
            q: "Quelles plateformes Reviewslip prend-il en charge ?",
            a: "Google, TripAdvisor, LINE, Facebook, Xiaohongshu et Wongnai — pour que vous puissiez rejoindre vos clients sur la plateforme la plus importante de votre marché. Chaque plateforme a toutefois ses propres règles, et certaines sont plus strictes que Google : plusieurs restreignent ou interdisent purement et simplement toute sollicitation d'avis. Vérifiez la politique de toute plateforme avant d'y diriger vos clients, où que vous exerciez.",
          },
        ],
      },
    ],

    ctaTitle: "Mettez-le en place correctement dès le premier jour.",
    ctaLede:
      "Parlez-nous de votre établissement et nous vous aiderons à démarrer du bon pied.",

    disclaimer:
      "Il s'agit de conseils pratiques tirés des politiques publiées des plateformes et des règles de protection des consommateurs aux États-Unis (FTC), dans l'UE et au Royaume-Uni, et en Asie — ce n'est pas un conseil juridique. Les règles évoluent et diffèrent selon les marchés. Vérifiez les directives en vigueur là où vous exercez et faites appel à un professionnel en cas de doute.",
  },

  demo: {
    eyebrow: "Démo en direct",
    title: "Constatez-le par vous-même.",
    lede: "Voici la fiche destinée au client, exactement telle que vos visiteurs la verraient. Sélectionnez ce qui vous a marqué et générez un brouillon. C'est un aperçu sûr — rien n'est publié où que ce soit.",
    note: "Les brouillons de démo sont des exemples préenregistrés afin que cette page ne nécessite aucune clé IA. Dans le produit réel, les brouillons sont générés en direct et adaptés à votre établissement.",
    cta: "Configurer cela pour mon établissement",
  },

  contact: {
    eyebrow: "Contactez-nous",
    title: "Mettons-vous en route.",
    lede: "Parlez-nous de votre établissement et nous vous aiderons à commencer à transformer vos clients satisfaits en véritables avis Google.",
    h1: "Écrivez-nous",
    p1: "Le moyen le plus rapide de nous joindre est l'e-mail. Indiquez-nous le nom de votre établissement, environ combien d'emplacements vous avez et ce que vous espérez — nous nous occupons du reste.",
    button: "Écrire à {email}",
    calloutLead: "Une promesse rapide :",
    callout:
      "Reviewslip aide uniquement les vrais clients à rédiger leurs propres avis. Nous ne faisons pas d'avis faux, en masse ou automatisés — consultez notre page Conformité et confiance.",
    demoNote: "Voici la fiche que vos clients verraient. Essayez-la.",
    demoVenue: "Votre établissement",
    form: {
      heading: "Envoyez-nous un message",
      name: "Votre nom",
      namePlaceholder: "Marie Dupont",
      email: "E-mail",
      emailPlaceholder: "marie@votreentreprise.com",
      business: "Nom de l'établissement",
      businessPlaceholder: "Le Café des Berges",
      locations: "Nombre d'emplacements",
      message: "Message",
      messagePlaceholder: "Parlez-nous un peu de votre établissement et de ce que vous espérez…",
      submit: "Envoyer le message",
      sending: "Envoi…",
      successTitle: "Merci — votre message est en route !",
      successBody: "Nous vous répondrons sous peu.",
      errorTitle: "Une erreur est survenue",
      errorBody: "Veuillez réessayer, ou écrivez-nous directement.",
      orEmail: "Vous préférez l'e-mail ? Écrivez-nous à",
      errRequired: "Ce champ est obligatoire.",
      errEmail: "Veuillez saisir une adresse e-mail valide.",
    },
  },

  auth: {
    login: {
      eyebrow: "Bon retour",
      title: "Connectez-vous à Reviewslip.",
      lede: "Gérez vos établissements, vos QR codes et vos slips d'avis.",
      submit: "Se connecter",
      sending: "Connexion…",
      remember: "Rester connecté",
      forgot: "Mot de passe oublié ?",
      altLead: "Nouveau sur Reviewslip ?",
      altLink: "Créez un compte",
    },
    signup: {
      eyebrow: "Créez votre compte",
      title: "Commencez à recueillir des avis honnêtes.",
      lede: "Configurez votre premier établissement en quelques minutes. Aucune carte requise pendant que nous finalisons les offres.",
      submit: "Créer un compte",
      sending: "Création du compte…",
      altLead: "Vous avez déjà un compte ?",
      altLink: "Connectez-vous",
      points: [
        "Un QR code personnalisé pour chaque établissement",
        "Des brouillons assistés par IA que vos clients modifient et publient eux-mêmes",
        "Conçu pour vous garder du bon côté des règles des plateformes",
      ],
    },
    fields: {
      password: "Mot de passe",
      passwordPlaceholder: "Au moins 10 caractères",
      passwordHint: "Utilisez au moins 10 caractères. Une courte phrase fonctionne bien.",
      confirm: "Confirmer le mot de passe",
      confirmPlaceholder: "Saisissez-le une seconde fois",
      show: "Afficher le mot de passe",
      hide: "Masquer le mot de passe",
    },
    terms: {
      lead: "J'accepte les ",
      termsLink: "Conditions d'utilisation",
      mid: " et la ",
      privacyLink: "Politique de confidentialité",
      end: ".",
    },
    errors: {
      passwordShort: "Utilisez au moins 10 caractères.",
      passwordMatch: "Les deux mots de passe ne correspondent pas.",
      termsRequired: "Veuillez accepter les conditions pour continuer.",
    },
    pendingTitle: "Les comptes ne sont pas encore ouverts",
    pendingBody:
      "Reviewslip n'est pas encore lancé : il n'y a donc pas encore d'espace où se connecter. Parlez-nous de votre établissement et nous vous préviendrons dès l'ouverture des inscriptions. Rien de ce que vous avez saisi ici n'a été envoyé ni conservé.",
    pendingCta: "Nous contacter",
  },

  slip: {
    thanks: "Merci de votre visite.",
    prompt: "Qu'est-ce qui vous a marqué ?",
    fiveStars: "Cinq étoiles",
    placeholder: "Choisissez ce que vous avez aimé, puis générez un brouillon.",
    generate: "Générer mon avis",
    writing: "Rédaction…",
    regenerate: "Régénérer",
    copy: "Copier",
    copied: "Copié ✓",
    proceed: "Continuer vers Google",
    categories: {
      service: "Service chaleureux",
      food: "Excellente cuisine",
      clean: "Impeccable et soigné",
      value: "Bon rapport qualité-prix",
      location: "Cadre agréable",
      cosy: "Ambiance chaleureuse",
    },
  },

  legal: {
    lastUpdated: "Dernière mise à jour : modèle provisoire",
    placeholderLead: "Provisoire.",
    placeholder:
      "Ceci est une trame de modèle, et non une politique définitive. Faites-la relire par un professionnel qualifié avant le lancement.",
    privacy: {
      eyebrow: "Mentions légales",
      title: "Politique de confidentialité",
      s1: "Qui nous sommes",
      p1: "Reviewslip (« nous ») fournit un outil qui aide les entreprises à inviter de vrais clients à rédiger et publier leurs propres avis.",
      s2: "Ce que nous collectons",
      list2: [
        "Les données de compte des utilisateurs professionnels (nom, e-mail, organisation).",
        "La configuration de l'établissement que vous fournissez (nom de l'entreprise, lien d'avis).",
        "L'utilisation agrégée et non identifiante de la fiche d'avis (par ex. le nombre de brouillons générés et copiés).",
        "Les informations de facturation traitées par notre prestataire de paiement.",
      ],
      s3: "Ce que nous ne faisons pas",
      p3: "Nous ne vendons pas vos données. Nous ne collectons pas d'informations personnelles auprès de vos clients finaux via la fiche d'avis, et nous ne publions pas d'avis au nom de quiconque.",
      s4: "Sous-traitants de données",
      p4: "Nous faisons appel à des tiers pour l'hébergement, l'authentification, les paiements et la génération par IA. Chacun ne traite les données que dans la mesure nécessaire à la fourniture du service.",
      s5: "Vos droits",
      p5: "Vous pouvez accéder à vos données de compte, les corriger ou les supprimer. Contactez-nous pour faire une demande.",
      s6: "Contact",
      p6: "Les questions concernant cette politique peuvent être envoyées à notre adresse d'assistance.",
    },
    terms: {
      eyebrow: "Mentions légales",
      title: "Conditions d'utilisation",
      s1: "Utilisation acceptable",
      p1Lead:
        "Vous vous engagez à utiliser Reviewslip uniquement pour inviter de vrais clients ayant vécu une véritable expérience avec votre établissement à rédiger leurs propres avis honnêtes. Vous respecterez la loi applicable en matière d'avis — y compris les règles de la FTC aux États-Unis, la directive sur les pratiques commerciales déloyales et la directive Omnibus de l'UE, le Digital Markets, Competition and Consumers Act 2024 du Royaume-Uni, les règles asiatiques telles que la réglementation japonaise sur le marketing furtif et la loi chinoise contre la concurrence déloyale, et la loi locale partout ailleurs où vous exercez — ainsi que les politiques de toute plateforme vers laquelle vous dirigez les clients. Consultez notre page ",
      p1Link: "Conformité et confiance",
      p1End: ".",
      s2: "Conduite interdite",
      list2: [
        "Générer ou publier des avis faux, fabriqués ou en masse.",
        "Offrir des incitations en échange d'avis.",
        "Se faire passer pour des clients ou publier en leur nom.",
        "Utiliser le service pour enfreindre une loi ou une politique de plateforme.",
      ],
      p2: "Nous pouvons suspendre ou résilier les comptes qui abusent du service.",
      s3: "Offres et facturation",
      p3: "Les offres sont convenues directement avec nous. Vous êtes responsable de la manière dont le service est utilisé pour votre établissement. Les tarifs ne sont pas encore définitifs et peuvent changer avant la disponibilité générale.",
      s4: "Service « en l'état »",
      p4: "Le service est fourni en l'état, sans garanties. Nous ne sommes pas responsables de la manière dont les avis affectent vos fiches ni des actions entreprises par les plateformes d'avis.",
      s5: "Modifications",
      p5: "Nous pouvons mettre à jour ces conditions ; la poursuite de l'utilisation après modifications vaut acceptation.",
      s6: "Contact",
      p6: "Les questions concernant ces conditions peuvent être envoyées à notre adresse d'assistance.",
    },
  },

  demoReviews: {
    service: [
      "L'équipe n'aurait pas pu être plus accueillante — sincèrement chaleureuse dès notre arrivée. Tout a été géré avec le sourire et rien ne semblait poser problème.",
      "Un service merveilleux et attentionné du début à la fin. Le personnel nous a fait nous sentir bien pris en charge sans jamais être envahissant. Cela a fait toute la visite.",
    ],
    food: [
      "La cuisine était le point fort — fraîche, généreuse et pleine de saveurs. Nous sommes repartis ravis et prévoyons déjà de revenir pour en profiter davantage.",
      "Chaque assiette qui arrivait était magnifique et délicieuse. Manifestement préparée avec soin. Difficile de reprocher la moindre bouchée.",
    ],
    clean: [
      "Impeccable de haut en bas. Ce sont les petits détails qui se remarquent — tout semblait frais, soigné et entretenu avec attention.",
      "Impeccablement propre et magnifiquement entretenu. On sent qu'ils sont réellement fiers de l'endroit.",
    ],
    value: [
      "Un excellent rapport qualité-prix pour ce que l'on obtient. Une qualité bien supérieure à ce que nous attendions pour le prix — nous le recommanderions à tout le monde.",
      "Un rapport qualité-prix vraiment excellent. Nous sommes repartis avec le sentiment d'en avoir eu bien plus que pour notre argent.",
    ],
    location: [
      "Un endroit si charmant — le cadre à lui seul vaut le déplacement. Paisible, pittoresque et exactement ce que nous espérions.",
      "L'emplacement est magnifique et facile d'accès. Une parfaite petite évasion du quotidien.",
    ],
    cosy: [
      "Une ambiance chaleureuse et cosy qui nous a donné envie de rester plus longtemps. Détendue, confortable et pleine de caractère.",
      "Immédiatement confortable — le genre de cocon où l'on s'installe et où l'on perd la notion du temps. Nous avons adoré.",
    ],
  },
};

export default fr;
