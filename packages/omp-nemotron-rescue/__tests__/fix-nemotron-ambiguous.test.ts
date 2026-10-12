import { fixNemotronAmbiguous } from '../src/fixes/fix-nemotron-ambiguous';

describe('fix-nemotron-ambiguous', () => {
  it('should be defined', () => {
    expect(fixNemotronAmbiguous).toBeDefined();
  });

  it('should have a name', () => {
    expect(fixNemotronAmbiguous.name).toBe('fix-nemotron-ambiguous');
  });

  it('should have an apply function', () => {
    expect(typeof fixNemotronAmbiguous.apply).toBe('function');
  });
});
