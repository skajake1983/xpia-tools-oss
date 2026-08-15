import { v4 as uuidv4 } from 'uuid';
import repos from '../db/repos';

const CAPTCHA_LIFETIME_MS = 5 * 60 * 1000; // 5 minutes
const CAPTCHA_TTL_SECONDS = 5 * 60;

export async function generateCaptcha(): Promise<{ id: string; question: string }> {
  const ops = ['+', '-', '×'] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];

  let a: number, b: number, answer: number;

  switch (op) {
    case '+':
      a = Math.floor(Math.random() * 50) + 1;
      b = Math.floor(Math.random() * 50) + 1;
      answer = a + b;
      break;
    case '-':
      a = Math.floor(Math.random() * 50) + 10;
      b = Math.floor(Math.random() * a) + 1;
      answer = a - b;
      break;
    case '×':
      a = Math.floor(Math.random() * 12) + 2;
      b = Math.floor(Math.random() * 12) + 2;
      answer = a * b;
      break;
  }

  const id = uuidv4();
  const expiresAt = new Date(Date.now() + CAPTCHA_LIFETIME_MS).toISOString();

  await repos.config.createCaptcha({
    id,
    type: 'captcha',
    answer: String(answer),
    expiresAt,
    used: false,
    createdAt: new Date().toISOString(),
    ttl: CAPTCHA_TTL_SECONDS,
  });

  return { id, question: `What is ${a} ${op} ${b}?` };
}

export async function verifyCaptcha(id: string, answer: string): Promise<boolean> {
  const challenge = await repos.config.getCaptcha(id);

  if (!challenge) return false;
  if (challenge.used) return false;
  if (new Date(challenge.expiresAt) < new Date()) return false;

  // Mark as used regardless of correctness (prevent replay)
  await repos.config.updateCaptcha(id, { used: true });

  return challenge.answer === answer.trim();
}
