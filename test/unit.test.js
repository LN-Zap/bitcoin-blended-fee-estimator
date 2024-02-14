import test from 'tape';
import { addFeeEstimates } from '../src/util';

test('addFeeEstimates', (t) => {
  t.plan(4);

  const feeByBlockTarget = { 1: 100, 2: 200, 3: 300 };
  const newEstimates = { 4: 50, 5: 150, 6: 250 };

  addFeeEstimates(feeByBlockTarget, newEstimates);

  t.equal(feeByBlockTarget[4], 50, 'Should add new estimate with block target 4 and fee 50');
  t.equal(feeByBlockTarget[5], undefined, 'Should not add new estimate with block target 5 and fee 150');
  t.equal(feeByBlockTarget[6], undefined, 'Should not add new estimate with block target 6 and fee 250');
  t.equal(Object.keys(feeByBlockTarget).length, 4, 'Should add only one new estimate');
});
