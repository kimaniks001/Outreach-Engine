export type ReadinessStage =
  | "ORIENTATION"
  | "MARKET_READY"
  | "EXPERIENCED"
  | "SPECIALIST"
  | "MASTER_PATHWAY";

export type CredentialKind = "READINESS" | "SPECIALIST";

export interface ReadinessCredentialDefinition {
  id: string;
  name: string;
  kind: CredentialKind;
  stage: ReadinessStage;
  industry?: string;
  description: string;
  evidenceRequired: string[];
  currentnessNote: string;
}

export interface ScenarioOption {
  id: string;
  label: string;
  correct: boolean;
  feedback: string;
}

export interface ReadinessScenario {
  id: string;
  title: string;
  context: string;
  question: string;
  options: ScenarioOption[];
}

export interface ReadinessCheck {
  id: string;
  title: string;
  credentialPreview: string;
  passScore: number;
  scenarios: ReadinessScenario[];
}

export interface MarketOpportunityPreview {
  id: string;
  title: string;
  place: string;
  need: string;
  requirements: string[];
  whyItFits: string;
  authorityNote: string;
}

export const readinessPrinciples = {
  gate:
    "Registering for the market network does not make someone Market Ready. Readiness must be demonstrated and awarded by backend authority.",
  learning:
    "Learning should feel like real market practice: short situations, clear feedback, retry without shame, and direct connection to useful work.",
  credentials:
    "Credentials prove demonstrated capability. Accolades celebrate contribution. They are intentionally different things.",
  opportunity:
    "A real opportunity may only unlock from current backend-authoritative qualifications, availability and any other required eligibility state.",
  prototype:
    "This experience can simulate training progress for product review, but it never writes a real Plug, Market Ready, specialist or Master credential.",
};

export const readinessLadder: Array<{
  stage: ReadinessStage;
  title: string;
  description: string;
}> = [
  {
    stage: "ORIENTATION",
    title: "Orientation",
    description: "Understand SecurePay language, boundaries, privacy and how to help without overpromising.",
  },
  {
    stage: "MARKET_READY",
    title: "Market Ready",
    description: "Demonstrate that you can handle common customer situations safely and simply.",
  },
  {
    stage: "EXPERIENCED",
    title: "Experienced Plug",
    description: "Grow through healthy customer work, feedback and demonstrated judgement — not time served alone.",
  },
  {
    stage: "SPECIALIST",
    title: "Industry Specialist",
    description: "Qualify for markets such as Property, Construction or Developer Integration through focused scenarios and evidence.",
  },
  {
    stage: "MASTER_PATHWAY",
    title: "Master pathway",
    description: "A later stewardship path for people who can mentor, support complexity and help grow capability in others.",
  },
];

export const credentialDefinitions: ReadinessCredentialDefinition[] = [
  {
    id: "market-ready",
    name: "Market Ready",
    kind: "READINESS",
    stage: "MARKET_READY",
    description: "Core readiness to support ordinary SecurePay market conversations within defined boundaries.",
    evidenceRequired: [
      "Pass current core scenario check",
      "Understand product and authority boundaries",
      "Understand privacy and escalation expectations",
    ],
    currentnessNote: "May require a short refresh when material product or policy guidance changes.",
  },
  {
    id: "property-specialist",
    name: "Property Specialist",
    kind: "SPECIALIST",
    stage: "SPECIALIST",
    industry: "Property",
    description: "Demonstrated ability to explain SecurePay safely in common property-payment situations.",
    evidenceRequired: [
      "Current Market Ready credential",
      "Pass current Property scenarios",
      "Respect due-diligence and verification boundaries",
    ],
    currentnessNote: "Specialist status must remain current when property guidance materially changes.",
  },
  {
    id: "construction-specialist",
    name: "Construction Specialist",
    kind: "SPECIALIST",
    stage: "SPECIALIST",
    industry: "Construction",
    description: "Demonstrated ability to explain staged work, materials, variations and evidence without inventing agreement authority.",
    evidenceRequired: [
      "Current Market Ready credential",
      "Pass current Construction scenarios",
      "Understand milestone and evidence boundaries",
    ],
    currentnessNote: "Refresh can be requested when construction workflow guidance changes.",
  },
  {
    id: "developer-integration-specialist",
    name: "Developer Integration Specialist",
    kind: "SPECIALIST",
    stage: "SPECIALIST",
    industry: "Developer Integration",
    description: "Demonstrated ability to help builders understand SecurePay integration options without fabricating technical or financial capabilities.",
    evidenceRequired: [
      "Current Market Ready credential",
      "Pass developer integration scenarios",
      "Know when to escalate to official technical support",
    ],
    currentnessNote: "Requires refresh when supported integration surfaces or API guidance materially changes.",
  },
];

export const marketReadyCheck: ReadinessCheck = {
  id: "market-ready-core-v1",
  title: "Market Ready check",
  credentialPreview: "Market Ready",
  passScore: 3,
  scenarios: [
    {
      id: "cement-delivery",
      title: "Cement at a hardware yard",
      context: "A buyer asks whether SecurePay itself confirms that 100 bags of cement physically left the yard.",
      question: "What is the safest simple answer?",
      options: [
        {
          id: "a",
          label: "Yes. SecurePay verifies every delivery itself.",
          correct: false,
          feedback: "That invents operational authority SecurePay does not have.",
        },
        {
          id: "b",
          label: "The agreement should state who confirms delivery and what evidence matters; SecurePay follows that agreed process.",
          correct: true,
          feedback: "Correct. Explain the agreement and the real confirmation role instead of claiming SecurePay witnessed delivery.",
        },
        {
          id: "c",
          label: "Tell the buyer not to worry because the money is frozen.",
          correct: false,
          feedback: "Avoid custody/frozen-money language and explain the actual agreement flow instead.",
        },
      ],
    },
    {
      id: "customer-verification",
      title: "A customer asks what verification means",
      context: "A customer sees that another participant has a verified SecurePay identity.",
      question: "What should you avoid implying?",
      options: [
        {
          id: "a",
          label: "Identity verification does not automatically prove ownership of property, goods or professional claims.",
          correct: true,
          feedback: "Correct. Keep identity truth separate from title, asset, professional or transaction truth.",
        },
        {
          id: "b",
          label: "Verified identity means SecurePay guarantees the whole deal.",
          correct: false,
          feedback: "SecurePay does not guarantee the whole deal simply because identity was verified.",
        },
        {
          id: "c",
          label: "Verification means the customer no longer needs to read the agreement.",
          correct: false,
          feedback: "The agreement remains central; identity verification does not replace understanding the deal.",
        },
      ],
    },
    {
      id: "hard-question",
      title: "You do not know the answer",
      context: "A customer asks a legal or technical question you are not qualified to answer.",
      question: "What is the strongest Plug behaviour?",
      options: [
        {
          id: "a",
          label: "Give the most likely answer so the customer does not lose confidence.",
          correct: false,
          feedback: "Confidence must not come from invented certainty.",
        },
        {
          id: "b",
          label: "Say what you know, name the boundary, and escalate the specific question to the appropriate specialist or official team.",
          correct: true,
          feedback: "Correct. Good market support includes knowing when not to improvise.",
        },
        {
          id: "c",
          label: "End the conversation completely.",
          correct: false,
          feedback: "You can remain helpful while escalating the part outside your capability.",
        },
      ],
    },
  ],
};

export const propertySpecialistCheck: ReadinessCheck = {
  id: "property-specialist-v1",
  title: "Property skills check",
  credentialPreview: "Property Specialist",
  passScore: 2,
  scenarios: [
    {
      id: "seller-title",
      title: "Seller verification vs title verification",
      context: "A buyer asks whether a verified seller means the land title has also been verified.",
      question: "What should you say?",
      options: [
        {
          id: "a",
          label: "Yes — verified seller and verified title are the same thing.",
          correct: false,
          feedback: "They are different claims and must never be collapsed into one.",
        },
        {
          id: "b",
          label: "No. Seller identity and title due diligence are separate. Explain what SecurePay verified and direct title questions to the appropriate due-diligence process.",
          correct: true,
          feedback: "Correct. Property support must keep identity, legal title and payment agreement truth separate.",
        },
      ],
    },
    {
      id: "land-deposit",
      title: "Land purchase deposit",
      context: "A buyer wants to pay a land deposit before every due-diligence step is complete.",
      question: "How should a Property specialist help?",
      options: [
        {
          id: "a",
          label: "Tell them SecurePay makes the purchase safe, so due diligence can happen later.",
          correct: false,
          feedback: "SecurePay does not replace legal, survey, title or other due diligence.",
        },
        {
          id: "b",
          label: "Help them describe the payment agreement clearly, but keep legal/title due diligence as a separate responsibility and escalate professional questions appropriately.",
          correct: true,
          feedback: "Correct. SecurePay can support payment clarity without pretending to perform property due diligence.",
        },
      ],
    },
  ],
};

export const opportunityPreviews: MarketOpportunityPreview[] = [
  {
    id: "property-ruaka",
    title: "Property buyer needs a plain-language SecurePay walkthrough",
    place: "Ruaka",
    need: "A buyer wants to understand how a deposit agreement can be structured before speaking with the seller.",
    requirements: ["Market Ready", "Property Specialist"],
    whyItFits: "Requires someone who can explain payment structure while keeping identity and title due diligence separate.",
    authorityNote: "Prototype opportunity. A real match requires backend-confirmed current credentials and availability.",
  },
  {
    id: "hardware-ruiru",
    title: "Hardware trader wants help creating a simple customer payment journey",
    place: "Ruiru",
    need: "The trader wants a simple explanation for delivery confirmation and SecureLink sharing.",
    requirements: ["Market Ready"],
    whyItFits: "Core Market Ready capability should be enough; specialist status is not required for this example.",
    authorityNote: "Prototype opportunity. No customer assignment or commercial entitlement is created here.",
  },
  {
    id: "developer-nairobi",
    title: "Small builder wants SecurePay on a new website",
    place: "Nairobi",
    need: "A non-technical founder wants to understand what can be integrated and when official technical support is needed.",
    requirements: ["Market Ready", "Developer Integration Specialist"],
    whyItFits: "Requires current developer-integration capability, not general sales confidence alone.",
    authorityNote: "Prototype opportunity. Real technical eligibility must come from backend-authoritative credentials.",
  },
];

export function scoreCheck(check: ReadinessCheck, answers: Record<string, string>) {
  const score = check.scenarios.reduce((total, scenario) => {
    const selected = scenario.options.find((option) => option.id === answers[scenario.id]);
    return total + (selected?.correct ? 1 : 0);
  }, 0);

  return {
    score,
    total: check.scenarios.length,
    passed: score >= check.passScore,
  };
}

export function previewOpportunityEligible(
  requirements: string[],
  demonstratedPreviewCredentials: string[]
): boolean {
  return requirements.every((requirement) => demonstratedPreviewCredentials.includes(requirement));
}
