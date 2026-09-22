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

  const SYMBOLS = new Map([[null, '0'], ...AMOUNTS.map((amount, index) => [amount, String(index + 1)])]);
  const FROM_SYMBOL = new Map([...SYMBOLS].map(([amount, symbol]) => [symbol, amount]));
  function checksum(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
  function encode(records) {
    if (!Array.isArray(records) || records.length < 1 || records.length > 500) throw Error('Invalid records');
    const payload = records.map((record) => {
      if (!record || !SYMBOLS.has(record.amount)) throw Error('Invalid record');
      return SYMBOLS.get(record.amount);
    }).join('');
    return `【九条履歴:v1:${payload}:${checksum(payload)}】`;
  }
  function decode(text) {
    const source = String(text);
    const matches = [...source.matchAll(/【九条履歴:v1:([0-6]{1,500}):([0-9a-f]{8})】/gu)];
    if (matches.length === 0) {
      if (source.includes('【九条履歴:')) throw Error('Invalid transfer code');
      return null;
    }
    if (matches.length !== 1 || checksum(matches[0][1]) !== matches[0][2]) throw Error('Invalid transfer code');
    return [...matches[0][1]].map((symbol) => FROM_SYMBOL.get(symbol));
  }
  function rebuild(current, outcomes) {
    validateState(current);
    if (!Array.isArray(outcomes) || outcomes.length < 1 || outcomes.length > 500 ||
        outcomes.some((amount) => !SYMBOLS.has(amount))) throw Error('Invalid outcomes');
    const currentTotal = count(current.total), currentSuccess = count(current.success);
    const successful = outcomes.filter((amount) => amount !== null).length;
    const baseTotal = currentTotal - outcomes.length;
    const baseSuccess = currentSuccess - successful;
    if (baseTotal < 0 || baseSuccess < 0 || baseSuccess > baseTotal) throw Error('Invalid baseline');
    const state = copy(current);
    for (const amount of AMOUNTS) {
      state.refunds[amount] -= outcomes.filter((value) => value === amount).length;
      if (!validCount(state.refunds[amount])) throw Error('Invalid refund baseline');
    }
    state.total = baseTotal === 0 && baseSuccess === 0 ? '' : String(baseTotal);
    state.success = baseTotal === 0 && baseSuccess === 0 ? '' : String(baseSuccess);
    validateState(state);
    const records = [];
    for (const amount of outcomes) {
      const refund = amount === null ? null : state.refunds[amount];
      const record = {
        transferred: true,
        amount,
        before: { total: state.total, success: state.success, refund },
      };
      state.total = String(count(state.total) + 1);
      state.success = String(count(state.success) + Number(amount !== null));
      if (amount !== null) state.refunds[amount] += 1;
      record.after = { total: state.total, success: state.success, refund: amount === null ? null : state.refunds[amount] };
      records.push(record);
    }
    validateState(state);
    if (JSON.stringify(state) !== JSON.stringify(current)) throw Error('Inconsistent rebuild');
    return records;
  }
  const api = { baseline, revise, encode, decode, rebuild };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PigRecordHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
