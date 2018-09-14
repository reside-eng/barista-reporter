import BaristaReporter from 'index';
import mocha from 'mocha';

describe('barista-reporter module', () => {
  describe('exports', () => {
    it('BaristaReporter function', () => {
      expect(BaristaReporter).to.be.a('function');
    });
  });

  describe('extends', () => {
    let entendStub;
    before(() => {
      entendStub = sinon.stub(mocha.reporters, 'Base');
    });

    // Skipped since test never exits. Check mocha reporter
    // tests here: https://github.com/mochajs/mocha/blob/master/test/reporters/json.spec.js
    it.skip('mocha reporters', () => {
      const onStub = sinon.stub();
      const fakeRunner = { on: onStub };
      BaristaReporter(fakeRunner);
      expect(entendStub).to.be.calledOnce;
    });
  });
});
