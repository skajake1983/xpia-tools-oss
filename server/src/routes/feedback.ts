import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { feedbackLimiter } from '../middleware/rateLimiter';
import { AuthPayload } from '../middleware/auth';
import { generateCaptcha, verifyCaptcha } from '../services/captcha.service';
import logger from '../logger';

const router = Router();

export const feedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'feedback']),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(320),
  /** Correlation / session ID — auto-attached for bug reports by authenticated clients */
  correlationId: z.string().max(200).optional(),
  captchaId: z.string().uuid().optional(),
  captchaAnswer: z.string().max(20).optional(),
});

const LABEL_MAP: Record<string, string> = {
  bug: 'bug',
  feature: 'enhancement',
  feedback: 'feedback',
};

/** Try to extract user from token without enforcing auth.
 *  Returns the user payload and whether a token was present but expired/invalid. */
function optionalUser(req: Request): { user: AuthPayload | null; tokenExpired: boolean } {
  const tokenFromCookie = req.cookies?.access_token;
  const authHeader = req.headers.authorization;
  const token = tokenFromCookie || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);
  if (!token) return { user: null, tokenExpired: false };
  try {
    return { user: jwt.verify(token, config.jwt.secret) as AuthPayload, tokenExpired: false };
  } catch {
    return { user: null, tokenExpired: true };
  }
}

router.get('/captcha', async (_req: Request, res: Response) => {
  const captcha = await generateCaptcha();
  res.json(captcha);
});

router.post('/', feedbackLimiter, async (req: Request, res: Response) => {
  try {
    const { type, title, description, firstName, lastName, email, correlationId, captchaId, captchaAnswer } = feedbackSchema.parse(req.body);

    const { user, tokenExpired } = optionalUser(req);

    // Require captcha for unauthenticated submissions
    if (!user) {
      if (!captchaId || !captchaAnswer) {
        if (tokenExpired) {
          // Token was present but expired — 401 triggers the client's auto-refresh + retry
          res.status(401).json({ error: 'Session expired' });
        } else {
          res.status(400).json({ error: 'Captcha is required' });
        }
        return;
      }
      if (!(await verifyCaptcha(captchaId, captchaAnswer))) {
        res.status(400).json({ error: 'Incorrect captcha answer' });
        return;
      }
    }

    const submitterName = `${firstName} ${lastName}`;
    const submitterEmail = email;

    const bodyParts = [
      `**Type:** ${type}`,
      `**Submitted by:** ${submitterName} (${submitterEmail})`,
    ];
    if (correlationId) {
      bodyParts.push(`**Correlation ID:** \`${correlationId}\``);
    }
    bodyParts.push('', description);

    const body = bodyParts.join('\n');

    // If GitHub is configured, create an issue
    if (config.github.token && config.github.repo) {
      const response = await fetch(
        `https://api.github.com/repos/${config.github.repo}/issues`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.github.token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            title: `[${type}] ${title}`,
            body,
            labels: [LABEL_MAP[type] || type],
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ httpStatus: response.status, errorBody }, 'GitHub API error creating issue');
        res.status(502).json({ error: 'Failed to submit feedback. Please try again.' });
        return;
      }

      const issue = await response.json() as { number: number };
      res.json({ success: true, issueNumber: issue.number });
      return;
    }

    // Dev fallback — log to console
    logger.info({ type, title, submitterEmail }, 'Feedback received (no GitHub configured)');
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    logger.error({ err }, 'Feedback submission error');
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

export default router;
