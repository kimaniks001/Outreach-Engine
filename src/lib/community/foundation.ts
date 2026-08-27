export type CommunityLens = "PLUG" | "MASTER" | "STAFF" | "BOARD";

export type CommunityPostKind =
  | "STORY"
  | "QUESTION"
  | "VOICE"
  | "CELEBRATION"
  | "POLL"
  | "MARKET_NOTE"
  | "GOSPEL";

export interface CommunityAuthor {
  name: string;
  role: string;
  place: string;
  official?: boolean;
}

export interface MarketInsightCandidate {
  summary: string;
  anonymised: string;
  teams: string[];
}

export interface CommunityPost {
  id: string;
  kind: CommunityPostKind;
  author: CommunityAuthor;
  when: string;
  body: string;
  circle?: string;
  media?: string;
  poll?: string[];
  reactions: { label: string; count: number }[];
  comments: { name: string; body: string }[];
  insight?: MarketInsightCandidate;
}

export interface CircleSummary {
  slug: string;
  name: string;
  visibility: "PRIVATE" | "INVITE_ONLY" | "OPEN_TO_NETWORK";
  members: number;
  about: string;
  whoCanSee: string;
  posts: { author: string; kind: CommunityPostKind; body: string; when: string }[];
}

export const communityPrinciples = {
  title: "Community LIVE",
  line: "Money stays quiet. People come alive here.",
  purpose:
    "The living community layer around SecurePay: people teach, listen, celebrate, ask for help, share stories and stay connected between the work.",
  moneyBoundary:
    "Community LIVE never displays personal earnings or Lifetime 10% Share. Economic information stays private in My Market / Share, and SecurePay remains the source of financial truth.",
  circleBoundary:
    "Circles are private by default. A Circle conversation does not become Community LIVE content or management intelligence unless a member deliberately chooses to share it.",
};

export const stories = [
  { name: "Amina W.", caption: "Cement delivery agreed before pickup", type: "Photo" },
  { name: "Fundi Fred", caption: "How I explain a SecureLink in 20 seconds", type: "Voice" },
  { name: "Wanjiku M.", caption: "Site walk, Kimbo", type: "Video" },
  { name: "SecurePay", caption: "The Gospel: agreement first", type: "Official" },
  { name: "Kamau N.", caption: "New Property Specialist", type: "Celebration" },
  { name: "Grace A.", caption: "Question about estate levies", type: "Voice" },
] as const;

export const communityPosts: CommunityPost[] = [
  {
    id: "welcome",
    kind: "CELEBRATION",
    author: { name: "SecurePay Community", role: "Official", place: "Kenya", official: true },
    when: "Morning",
    body:
      "Karibu to eleven new Market Ready Plugs this week, and congratulations to Kamau N. on his Property Specialist credential. Progress recognised — no earnings, no noise.",
    reactions: [
      { label: "Respect", count: 64 },
      { label: "Welcome", count: 41 },
    ],
    comments: [{ name: "Amina W.", body: "Karibu everyone. Ask anything here — we all started at zero." }],
  },
  {
    id: "hardware-delivery",
    kind: "QUESTION",
    author: { name: "Peter M.", role: "Plug", place: "Ruiru hardware" },
    when: "08:25",
    body:
      "A hardware trader asked me: if a customer pays through a SecureLink, who confirms the cement actually left the yard? How do you answer this simply?",
    reactions: [{ label: "Good question", count: 22 }],
    comments: [
      {
        name: "Fundi Fred",
        body: "I say: the money follows the agreement you both wrote. Delivery is part of that agreement.",
      },
    ],
    insight: {
      summary: "Hardware traders want a simpler explanation of who confirms delivery.",
      anonymised: "Hardware segment · Ruiru area · delivery-confirmation wording unclear",
      teams: ["Training", "Marketing", "Product"],
    },
  },
  {
    id: "estate-voice",
    kind: "VOICE",
    author: { name: "Grace A.", role: "Plug", place: "Kiambu estates" },
    when: "09:40",
    body:
      "How I introduce an estate levy collection to a new committee without sounding like a salesperson.",
    media: "Voice note · 0:48 · prototype playback",
    reactions: [{ label: "Useful", count: 37 }],
    comments: [],
  },
  {
    id: "village-story",
    kind: "GOSPEL",
    author: { name: "SecurePay Community", role: "Keyman Village", place: "Kenya", official: true },
    when: "13:00",
    body:
      "Wanjiku ordered timber for her shop extension. Fundi Fred wanted a deposit; Wanjiku wanted the timber on site. They wrote what they both meant, and the money followed the agreement. Nobody had to trust a stranger — they trusted what they agreed.",
    reactions: [{ label: "This is it", count: 88 }],
    comments: [
      { name: "Kamau N.", body: "This lands better with customers than a long brochure." },
    ],
  },
  {
    id: "property-verification",
    kind: "QUESTION",
    author: { name: "Nairobi Property Circle", role: "Circle", place: "Nairobi" },
    when: "14:20",
    circle: "Nairobi Property Circle",
    body:
      "Customers in property keep asking whether seller verification means title verification. Three of us heard the same confusion this week.",
    reactions: [{ label: "Same here", count: 19 }],
    comments: [
      { name: "Joseph K.", body: "Let us submit the pattern properly rather than each person guessing." },
    ],
    insight: {
      summary: "Customers in property are confusing seller verification with title verification.",
      anonymised:
        "Property segment · Nairobi · verification terminology misunderstood · three independent reports",
      teams: ["Marketing", "Training", "Product", "Compliance"],
    },
  },
  {
    id: "fundi-evening",
    kind: "STORY",
    author: { name: "Fundi Fred", role: "Fundi", place: "Thika Road site" },
    when: "17:05",
    body:
      "Eleven hours on site and the only thing I lifted easily today was my phone to check the agreement. Small wins count.",
    reactions: [
      { label: "Ha", count: 52 },
      { label: "Rest well", count: 12 },
    ],
    comments: [],
  },
  {
    id: "weekly-poll",
    kind: "POLL",
    author: { name: "SecurePay Community", role: "Official", place: "Kenya", official: true },
    when: "17:40",
    body: "What are customers asking you most this week?",
    poll: [
      "What happens if work is late?",
      "Who confirms delivery?",
      "Is my money safe with you?",
      "How do I share a SecureLink?",
    ],
    reactions: [{ label: "Voted", count: 130 }],
    comments: [],
  },
];

export const liveRooms = [
  {
    title: "Explaining a SecureLink without jargon",
    host: "Amina W.",
    state: "LIVE",
    when: "Now",
    note: "34 listening · prototype",
  },
  {
    title: "Property questions, plainly answered",
    host: "Joseph K. · Master",
    state: "UPCOMING",
    when: "16:00",
    note: "Property Circle",
  },
  {
    title: "Friday chai room",
    host: "Community",
    state: "UPCOMING",
    when: "Friday 17:00",
    note: "No agenda. Just people.",
  },
] as const;

export const gospel = [
  {
    title: "Money should follow the agreement",
    body: "Write what you both mean first. The payment follows what was agreed.",
  },
  {
    title: "Clarity beats persuasion",
    body: "A customer who understands the agreement rarely needs a hard sell.",
  },
  {
    title: "Creator is not always payer",
    body: "Explain the real roles in the agreement instead of forcing every deal into one shape.",
  },
] as const;

export const peopleToKnow = [
  {
    name: "Grace A.",
    place: "Kiambu estates",
    knownFor: "Explaining levies to committees",
    credential: "Community Collections Specialist",
  },
  {
    name: "Kamau N.",
    place: "Nairobi",
    knownFor: "Patient property explanations",
    credential: "Property Specialist",
  },
  {
    name: "Peter M.",
    place: "Ruiru",
    knownFor: "Hardware-yard relationships",
    credential: "Market Ready",
  },
] as const;

export const circles: CircleSummary[] = [
  {
    slug: "nairobi-property",
    name: "Nairobi Property Circle",
    visibility: "INVITE_ONLY",
    members: 42,
    about: "Property questions, misconceptions and real customer situations in and around Nairobi.",
    whoCanSee: "Members with a current Property qualification, plus the Circle steward.",
    posts: [
      {
        author: "Kamau N.",
        kind: "QUESTION",
        body: "Customers keep hearing seller verification as title verification. How are you wording it?",
        when: "14:20",
      },
      {
        author: "Joseph K.",
        kind: "MARKET_NOTE",
        body: "Let us submit the pattern as market insight rather than each of us guessing.",
        when: "14:35",
      },
    ],
  },
  {
    slug: "ruiru-hardware",
    name: "Ruiru Hardware Crew",
    visibility: "PRIVATE",
    members: 28,
    about: "Hardware and cement traders around Ruiru, Kimbo and Kamakis.",
    whoCanSee: "Only members. Nothing leaves the Circle unless a member deliberately shares it.",
    posts: [
      {
        author: "Peter M.",
        kind: "QUESTION",
        body: "Who confirms cement left the yard? Best simple answer wins.",
        when: "08:25",
      },
      {
        author: "Amina W.",
        kind: "STORY",
        body: "Delivery agreed before pickup — quick yard-board story.",
        when: "09:00",
      },
    ],
  },
  {
    slug: "women-in-trade",
    name: "Women in Trade",
    visibility: "INVITE_ONLY",
    members: 96,
    about: "Support, negotiation practice and honest conversation.",
    whoCanSee: "Members only. Posts are never quoted outside the Circle without deliberate sharing.",
    posts: [
      {
        author: "Wanjiku M.",
        kind: "STORY",
        body: "How I priced my first big supply job without apologising for it.",
        when: "11:10",
      },
    ],
  },
  {
    slug: "new-plugs",
    name: "New Plugs Cohort",
    visibility: "OPEN_TO_NETWORK",
    members: 61,
    about: "First 90 days. No question is too basic here.",
    whoCanSee: "Anyone in the market network may read; cohort members post.",
    posts: [
      {
        author: "Brian K.",
        kind: "STORY",
        body: "Day three. Introduced SecurePay to my uncle's hardware shop and did not panic.",
        when: "07:50",
      },
    ],
  },
  {
    slug: "construction-masters",
    name: "Construction Masters Central",
    visibility: "INVITE_ONLY",
    members: 17,
    about: "Mentoring, escalations and territory patterns in construction.",
    whoCanSee: "Masters with construction stewardship. Aggregated themes only leave the Circle.",
    posts: [
      {
        author: "Joseph K.",
        kind: "MARKET_NOTE",
        body: "Three Plugs in Kiambu need help with completion-stage conversations.",
        when: "10:20",
      },
    ],
  },
];

export const communityProfile = {
  name: "Wanjiku M.",
  territory: "Ruiru & Kimbo",
  knownFor: "Making property and construction agreements easy to explain",
  peopleHelped: 186,
  qualifications: ["Market Ready", "Property Specialist", "Construction · Level 2"],
  circleNames: ["Nairobi Property Circle", "Women in Trade", "Ruiru Hardware Crew"],
  accolades: ["First 100 People Helped", "Customer Favourite", "Market Explorer"],
  contributions: [
    "7 helpful answers recognised by the community",
    "3 market insights deliberately submitted",
    "2 LIVE rooms hosted",
  ],
};
