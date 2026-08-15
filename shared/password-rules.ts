/**
 * Shared password complexity rules.
 * Used by both server-side Zod validation and client-side UI feedback.
 */

export interface PasswordRule {
  id: string;
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 12 characters', test: (pw) => pw.length >= 12 },
  { id: 'uppercase', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lowercase', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'digit', label: 'One number', test: (pw) => /\d/.test(pw) },
  { id: 'special', label: 'One special character (!@#$%…)', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function validatePassword(password: string): { valid: boolean; failures: string[] } {
  const failures = PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.label);
  return { valid: failures.length === 0, failures };
}
