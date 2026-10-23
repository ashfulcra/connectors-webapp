import { it, expect } from 'vitest';
import {normalizeRunEvents} from './harness.js';
it('malformed records cannot invent a completed review', () => {
  const good={id:'record',run_id:'run',milestone_id:'M1',role:'Evaluator',step:'REVIEW',status:'started',detail:'Reviewing',evidence:'API returned 200',revision:'abc',start_time:'2026-10-23T12:00:00Z'};
  const result=normalizeRunEvents([good,{...good,id:'bad',status:'completed',evidence:''}]);
  expect(result.events).toEqual([good]);
  expect(result.invalidCount).toBe(1);
});
