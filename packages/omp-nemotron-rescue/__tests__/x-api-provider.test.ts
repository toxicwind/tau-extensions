import { fixHeaders, upstreamProviderFor } from '../src/fixes/x-api-provider';

describe('x-api-provider fix', () => {
  it('should have fixHeaders function', () => {
    expect(typeof fixHeaders).toBe('function');
  });

  it('should have upstreamProviderFor function', () => {
    expect(typeof upstreamProviderFor).toBe('function');
  });

  it('should return fireworks for nemotron model', () => {
    expect(upstreamProviderFor('nemotron-3-super')).toBe('fireworks');
  });

  it('should fix headers to set x-api-provider', () => {
    const headers: Record<string, string> = {};
    const result = fixHeaders('nemotron-3-super', headers);
    expect(result['x-api-provider']).toBe('fireworks');
    expect(result).toBe(headers); // should return the same map
  });
});
