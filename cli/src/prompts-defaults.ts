import { DOCUMENT_PROMPTS, IMAGE_PROMPTS, PAYLOAD_PROMPTS } from '../../server/src/config/prompts';

export type CliPromptCategory = 'document' | 'image' | 'payload';

/** Prompt categories the datagen CLI can customize (page generation is web-only). */
export const CLI_PROMPT_CATEGORIES: CliPromptCategory[] = ['document', 'image', 'payload'];

export const DEFAULT_PROMPTS: Record<CliPromptCategory, { system: string; user: string }> = {
  document: { system: DOCUMENT_PROMPTS.system, user: DOCUMENT_PROMPTS.user },
  image: { system: IMAGE_PROMPTS.system, user: IMAGE_PROMPTS.user },
  payload: { system: PAYLOAD_PROMPTS.system, user: PAYLOAD_PROMPTS.user },
};

export function isCliPromptCategory(value: string): value is CliPromptCategory {
  return (CLI_PROMPT_CATEGORIES as string[]).includes(value);
}
