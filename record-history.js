'use strict';

// Pure replay engine: preserve the pre-recording baseline and rebuild only
// recorded pig actions. Never infer individual events from imported totals.
((root) => {
  const AMOUNTS = [2000, 2500, 3000, 3500, 4000, 4500];
  const validCount = (n) => Number.isSafeInteger(n) && n >= 0;
  const count = (text) => {
    if (typeof text !== 'string' || (text !== '' && !/^\d+$/.test(text))) throw Error('Invalid count');
    const n = Number(text);
    if (!validCount(n)) throw Error('Invalid count');
    return n;
  };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function validateState(state) {
    const total = count(state.total), success = count(state.success);
    if (success > total || ((state.total === '') !== (state.success === ''))) throw Error('Invalid pair');
    for (const amount of AMOUNTS) if (!validCount(state.refunds[amount])) throw Error('Invalid refund');
  }
  function baseline(current, records) {
    validateState(current);
    if (!Array.isArray(records) || records.length > 500) throw Error('Invalid records');
    const state = copy(current);
    for (const record of [...records].reverse()) {
      if (!record || !record.before || !record.after ||
          (record.amount !== null && !AMOUNTS.includes(record.amount))) throw Error('Invalid record');
      const { before, after, amount } = record;
      const total = count(before.total), success = count(before.success);
      if (success > total || ((before.total === '') !== (before.success === '')) ||
          after.total !== String(total + 1) || after.success !== String(success + Number(amount !== null)) ||
          !validCount(total + 1) || !validCount(success + Number(amount !== null)) ||
          state.total !== after.total || state.success !== after.success) throw Error('Inconsistent record');
      if (amount === null) {
        if (before.refund !== null || after.refund !== null) throw Error('Invalid failure');
      } else {
        if (!validCount(before.refund) || !validCount(before.refund + 1) ||
            after.refund !== before.refund + 1 || state.refunds[amount] !== after.refund) throw Error('Inconsistent refund');
        state.refunds[amount] = before.refund;
      }
      state.total = before.total;
      state.success = before.success;
    }
    validateState(state);
    return state;
  }
  function revise(current, records, index, replacement) {
    const state = baseline(current, records);
    if (!Number.isInteger(index) || index < 0 || index >= records.length ||
        (replacement !== 'delete' && replacement !== null && !AMOUNTS.includes(replacement))) throw Error('Invalid change');
    const next = copy(records);
    if (replacement === 'delete') next.splice(index, 1);
    else {
      next[index].amount = replacement;
      next[index].edited = true;
    }
    for (const record of next) {
      const amount = record.amount;
      const refund = amount === null ? null : state.refunds[amount];
      record.before = { total: state.total, success: state.success, refund };
      state.total = String(count(state.total) + 1);
      state.success = String(count(state.success) + Number(amount !== null));
      if (amount !== null) state.refunds[amount] += 1;
      validateState(state);
      record.after = { total: state.total, success: state.success, refund: amount === null ? null : state.refunds[amount] };
    }
    return { state, records: next };
  }
  const api = { baseline, revise };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PigRecordHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
