import type { ReadinessProgram } from "./securepay-readiness-client";

export const demoReadinessPrograms: ReadinessProgram[] = [
  {
    code: "MARKET_READY",
    version: 1,
    title: "Market Ready",
    description: "Core SecurePay market conduct and explanation readiness.",
    passScore: 2,
    prerequisite: null,
    questions: [
      {
        id: "agreement-first",
        prompt: "A customer asks you to promise that money will be released before the agreed condition is complete. What should you do?",
        options: [
          "Promise release so the customer stays happy",
          "Explain that money follows the agreement and release authority stays with SecurePay backend rules",
          "Ask the recipient to decide privately",
        ],
      },
      {
        id: "creator-payer",
        prompt: "Does the person who creates an agreement always have to be the payer?",
        options: [
          "Yes, creator and payer are always the same",
          "No, creator and payer are distinct roles and can be different people",
          "Only when using M-PESA",
        ],
      },
      {
        id: "verification-language",
        prompt: "If SecurePay confirms one identity fact, how should you explain it?",
        options: [
          "Describe only what SecurePay actually confirmed",
          "Expand it into a general trust guarantee",
          "Say SecurePay guarantees the transaction",
        ],
      },
    ],
  },
  {
    code: "PROPERTY_SPECIALIST",
    version: 1,
    title: "Property Specialist",
    description: "A short property-market explanation check for people supporting land and property customers.",
    passScore: 2,
    prerequisite: "MARKET_READY",
    questions: [
      {
        id: "seller-v-title",
        prompt: "A customer asks whether verifying a seller means SecurePay verified the land title. What should you say?",
        options: [
          "Seller verification automatically verifies the title",
          "Explain exactly what identity verification covers and keep title due diligence separate",
          "SecurePay becomes the land registrar for the transaction",
        ],
      },
      {
        id: "property-conditions",
        prompt: "How should a property payment be structured when genuine conditions must be completed first?",
        options: [
          "Use the agreement to state the real conditions and confirmations before money moves",
          "Always force every deal into many milestones",
          "Skip agreement details and rely on chat history",
        ],
      },
      {
        id: "legal-boundary",
        prompt: "A buyer asks you for a legal opinion on title ownership. What is the safe boundary?",
        options: [
          "Give a binding legal opinion",
          "Explain SecurePay's role accurately and direct legal/title questions to the appropriate qualified authority or professional",
          "Guarantee the land is safe because SecurePay is being used",
        ],
      },
    ],
  },
];
