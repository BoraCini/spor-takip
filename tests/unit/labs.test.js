import { describe, it, expect } from 'vitest';
import { status } from '../../public/js/data/labs.js';

describe('Tahlil durumu', () => {
  it('aralığa göre düşük/normal/yüksek', () => {
    expect(status(5, 4, 10)).toBe('ok');
    expect(status(3, 4, 10)).toBe('low');
    expect(status(11, 4, 10)).toBe('high');
    expect(status(11, null, 10)).toBe('high');
    expect(status(3, 4, null)).toBe('low');
  });
});
