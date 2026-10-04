// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './isTypingTarget';

function el(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe('isTypingTarget', () => {
  it('is true for text-like inputs, textareas and selects', () => {
    expect(isTypingTarget(el('<input>'))).toBe(true);
    expect(isTypingTarget(el('<input type="text">'))).toBe(true);
    expect(isTypingTarget(el('<input type="search">'))).toBe(true);
    expect(isTypingTarget(el('<input type="number">'))).toBe(true);
    expect(isTypingTarget(el('<textarea></textarea>'))).toBe(true);
    expect(isTypingTarget(el('<select></select>'))).toBe(true);
  });

  it('is false for ranges, checkboxes, buttons and plain elements', () => {
    expect(isTypingTarget(el('<input type="range">'))).toBe(false);
    expect(isTypingTarget(el('<input type="checkbox">'))).toBe(false);
    expect(isTypingTarget(el('<button></button>'))).toBe(false);
    expect(isTypingTarget(el('<div></div>'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
