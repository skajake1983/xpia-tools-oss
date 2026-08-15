import rateLimit from 'express-rate-limit';

// Azure App Service may pass IP:port in X-Forwarded-For; strip the port
const keyGenerator = (req: { ip?: string }) => {
  const ip = req.ip || '127.0.0.1';
  return ip.replace(/:\d+$/, '');
};

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: false,
});



/** Rate limiter for public page serving — generous but prevents abuse/enumeration */
export const publicPageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: '<!DOCTYPE html><html><body><h1>Too many requests</h1></body></html>',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: false,
});

/** Tight limiter for feedback submissions — accessible without auth */
export const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many feedback submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: false,
});

/** Rate limiter for generation endpoints (documents, payloads) — expensive LLM calls */
export const generationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20,
  message: { error: 'Too many generation requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: false,
});

/** Rate limiter for invite request submissions — public, no auth required */
export const inviteRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many invite requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: false,
});
