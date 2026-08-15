import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Replicate the slug validation regex from pages.ts for independent unit testing
const slugRegex = /^[a-f0-9-]{8}$/;

// The 404 HTML should contain these key elements
const EXPECTED_404_TITLE = 'This page has been removed';
const EXPECTED_404_LINK = 'href="https://';
const EXPECTED_404_DESCRIPTION = 'no longer active';

const staticDir = join(__dirname, '..', '..', '..', 'static-pages');
const html404 = readFileSync(join(staticDir, '404.html'), 'utf-8');
const htmlIndex = readFileSync(join(staticDir, 'index.html'), 'utf-8');

describe('pages route — slug validation', () => {
  it('accepts a valid 8-char hex slug', () => {
    expect(slugRegex.test('a1b2c3d4')).toBe(true);
  });

  it('accepts slug with hyphens', () => {
    expect(slugRegex.test('a1b2-3d4')).toBe(true);
  });

  it('rejects slug shorter than 8 chars', () => {
    expect(slugRegex.test('a1b2c3')).toBe(false);
  });

  it('rejects slug longer than 8 chars', () => {
    expect(slugRegex.test('a1b2c3d4e')).toBe(false);
  });

  it('rejects uppercase hex characters', () => {
    expect(slugRegex.test('A1B2C3D4')).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(slugRegex.test('ghijklmn')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(slugRegex.test('')).toBe(false);
  });

  it('rejects path traversal attempts', () => {
    expect(slugRegex.test('../etc/')).toBe(false);
  });
});

describe('pages route — 404 page content expectations', () => {
  it('contains the "page removed" heading', () => {
    expect(html404).toContain(EXPECTED_404_TITLE);
  });

  it('contains an external https link', () => {
    expect(html404).toContain(EXPECTED_404_LINK);
  });

  it('explains the page is no longer active', () => {
    expect(html404).toContain(EXPECTED_404_DESCRIPTION);
  });

  it('is valid HTML with doctype', () => {
    expect(html404).toMatch(/^<!DOCTYPE html>/i);
  });

  it('does not contain any script tags', () => {
    expect(html404).not.toMatch(/<script[\s>]/i);
  });
});

describe('pages route — index.html redirect expectations', () => {
  it('contains a meta refresh redirect', () => {
    expect(htmlIndex).toMatch(/meta\s+http-equiv="refresh"/i);
  });

  it('redirects via a meta refresh URL', () => {
    expect(htmlIndex).toContain('url=https://');
  });

  it('is valid HTML with doctype', () => {
    expect(htmlIndex).toMatch(/^<!DOCTYPE html>/i);
  });
});
