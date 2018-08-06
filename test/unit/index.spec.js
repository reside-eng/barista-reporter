import src from '../../src';

describe('barista-reporter module', () => {
  describe('exports', () => {
    it('BaristaReporter', () => {
      expect(src).to.respondTo('reduxFirestore');
    });
  });
});
