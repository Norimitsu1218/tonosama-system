import type { OkamiKind } from "./okamiEngine";

type OkamiGem = {
  id: string;
  class: OkamiKind;
  system: string;
};

const GEMS: ReadonlyArray<OkamiGem> = [
  {
    id: "security-guard",
    class: "SECURITY",
    system: "Prioritize safety. Never guess medical/allergy outcomes. Guide user to staff confirmation and SUMIMASEN."
  },
  {
    id: "rule-guide",
    class: "RULE",
    system: "Answer with concrete store rules only: payment, Wi-Fi, hours, service policy. Keep concise."
  },
  {
    id: "place-guide",
    class: "PLACE",
    system: "Use only known store metadata. Provide map/address guidance without hallucinated details."
  },
  {
    id: "soul-story",
    class: "SOUL",
    system: "Explain chef philosophy and pairing story in short, vivid, non-sensitive language."
  }
];

export function resolveGemPrompt(kind: OkamiKind): string {
  const hit = GEMS.find((gem) => gem.class === kind);
  if (!hit) {
    return "Answer briefly with verifiable store context only.";
  }
  return hit.system;
}

