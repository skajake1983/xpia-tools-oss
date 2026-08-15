/**
 * Security framework definitions and category mappings.
 * Mirrors server-side data in server/src/data/xpia-techniques.ts.
 */

export type XPIAFramework = 'mitre_atlas' | 'owasp_llm_top10' | 'greshake';

export const XPIA_FRAMEWORKS: Record<XPIAFramework, { label: string; description: string; version: string }> = {
  mitre_atlas: {
    label: 'MITRE ATLAS',
    description: 'Adversarial Threat Landscape for AI Systems — industry-standard taxonomy of adversary tactics and techniques targeting AI.',
    version: 'v4.0',
  },
  owasp_llm_top10: {
    label: 'OWASP LLM Top 10',
    description: 'Top 10 critical security risks for large language model applications.',
    version: '2025',
  },
  greshake: {
    label: 'Greshake et al.',
    description: 'Foundational indirect prompt injection taxonomy from "Not what you\'ve signed up for" (2023).',
    version: '2023',
  },
};

export const FRAMEWORK_IDS = Object.keys(XPIA_FRAMEWORKS) as XPIAFramework[];

/**
 * Maps each framework to the attack categories it covers, with framework-specific reference IDs.
 * Categories absent from a framework's map are excluded when that framework is selected.
 *
 * - MITRE ATLAS: All 10 categories (comprehensive adversarial AI taxonomy)
 * - OWASP LLM Top 10: All 10 categories (LLM01 Prompt Injection, LLM02 Sensitive Info, LLM06 Excessive Agency)
 * - Greshake et al.: 8 categories (excludes encoding_evasion and persona_switching — not primary taxonomy items in the paper)
 */
export const FRAMEWORK_CATEGORIES: Record<XPIAFramework, Record<string, string>> = {
  mitre_atlas: {
    direct_instruction: 'AML.T0051.000',
    context_manipulation: 'AML.T0051.001',
    role_hijacking: 'AML.T0051.002',
    data_exfiltration: 'AML.T0024',
    encoding_evasion: 'AML.T0015.004',
    delimiter_injection: 'AML.T0051.003',
    multimodal: 'AML.T0051.004',
    tool_manipulation: 'AML.T0040.002',
    goal_hijacking: 'AML.T0051.005',
    persona_switching: 'AML.T0051.006',
  },
  owasp_llm_top10: {
    direct_instruction: 'LLM01',
    context_manipulation: 'LLM01',
    role_hijacking: 'LLM01',
    data_exfiltration: 'LLM02',
    encoding_evasion: 'LLM01',
    delimiter_injection: 'LLM01',
    multimodal: 'LLM01',
    tool_manipulation: 'LLM06',
    goal_hijacking: 'LLM01',
    persona_switching: 'LLM01',
  },
  greshake: {
    direct_instruction: 'Direct',
    context_manipulation: 'Indirect',
    role_hijacking: 'Indirect',
    data_exfiltration: 'Active',
    delimiter_injection: 'Indirect',
    multimodal: 'Indirect',
    tool_manipulation: 'Active',
    goal_hijacking: 'Passive',
  },
};

/** Returns the category IDs covered by a given framework */
export function getCategoriesForFramework(framework: XPIAFramework): string[] {
  return Object.keys(FRAMEWORK_CATEGORIES[framework]);
}

/** Returns the framework-specific reference ID for a category, or undefined if not mapped */
export function getFrameworkRef(framework: XPIAFramework, category: string): string | undefined {
  return FRAMEWORK_CATEGORIES[framework][category];
}
