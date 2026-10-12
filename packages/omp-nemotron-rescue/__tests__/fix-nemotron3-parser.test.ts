import { fixNemotron3Parser } from '../src/fixes/fix-nemotron3-parser';

describe('fix-nemotron3-parser', () => {
  it('should be defined', () => {
    expect(fixNemotron3Parser).toBeDefined();
  });

  it('should have a name', () => {
    expect(fixNemotron3Parser.name).toBe('fix-nemotron3-parser');
  });

  it('should have an apply function', () => {
    expect(typeof fixNemotron3Parser.apply).toBe('function');
  });
});
