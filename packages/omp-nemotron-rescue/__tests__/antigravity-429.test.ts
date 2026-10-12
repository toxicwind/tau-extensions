import { shouldRetry } from '../src/fixes/antigravity-429';

describe('antigravity-429 fix', () => {
  it('should have shouldRetry function', () => {
    expect(typeof shouldRetry).toBe('function');
  });

  it('should return retry=true for false 429 with antigravity', () => {
    const result = shouldRetry(429, 'RESOURCE_EXHAUSTED antigravity');
    expect(result.retry).toBe(true);
    expect(result.reason).toBe('false 429 - defensive skip + flat-rate fallback');
  });

  it('should return retry=false for non-429 status', () => {
    const result = shouldRetry(200, 'OK');
    expect(result.retry).toBe(false);
  });

  it('should return retry=false for 429 without antigravity', () => {
    const result = shouldRetry(429, 'RESOURCE_EXHAUSTED');
    expect(result.retry).toBe(false);
  });
});
