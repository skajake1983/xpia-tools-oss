import { describe, it, expect, vi } from 'vitest';
import * as list from './list';

describe('list command', () => {
  it('lists techniques with ids', () => {
    const techniques = list.listTechniques();
    expect(techniques.length).toBeGreaterThan(0);
    expect(techniques[0]).toHaveProperty('id');
  });

  it('lists document types including docx', () => {
    expect(list.listDocTypes()).toContain('docx');
  });

  it('lists image layouts including timeline', () => {
    expect(list.listLayouts()).toContain('timeline');
  });

  it('lists payload categories', () => {
    expect(list.listCategories().length).toBeGreaterThan(0);
  });

  it('lists evasion modifiers', () => {
    expect(list.listEvasions().length).toBeGreaterThan(0);
  });

  it('run* helpers emit output', () => {
    const log = vi.fn();
    list.runListTechniques(log);
    list.runListTypes(log);
    list.runListLayouts(log);
    list.runListCategories(log);
    list.runListEvasions(log);
    expect(log).toHaveBeenCalled();
  });
});
