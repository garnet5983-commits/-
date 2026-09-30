'use strict';

// Aggregate correction does not invent an individual event or its position.
((root) => {
  const refunds = Object.freeze({
    2000: 'pRefund2000Count', 2500: 'pRefund2500Count',
    3000: 'pRefund3000Count', 3500: 'pRefund3500Count',
    4000: 'pRefund4000Count', 4500: 'pRefundCount',
  });
  const names = Object.freeze({ r: 'ルーレット', p: '豚', b: '野球' });
  const integer = (value, label) => {
    if (!/^\d+$/.test(String(value))) throw Error(`${label}を整数で入力してください。`);
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0) throw Error(`${label}が扱える範囲を超えています。`);
    return n;
  };
  const label = (value) => value === 'failure' ? '失敗' : value === 'success' ? '成功'
    : value === 'unknown' ? '成功（還元未記録）' : value === 'delete' ? '削除' : `${value}還元の成功`;

  function plan(snapshot, choice) {
    const { game, from, to } = choice;
    if (!Object.hasOwn(names, game)) throw Error('種目を選んでください。');
    const sources = game === 'p' ? ['failure', 'unknown', ...Object.keys(refunds)] : ['failure', 'success'];
    const targets = game === 'p' ? ['failure', ...Object.keys(refunds), 'delete'] : ['failure', 'success', 'delete'];
    if (!sources.includes(from) || !targets.includes(to)) throw Error('変更前・変更後を選んでください。');
    if (from === to) throw Error('変更前と変更後が同じです。');
    const count = integer(choice.count, '修正件数');
    if (count < 1) throw Error('修正件数は1件以上にしてください。');
    const total = integer(snapshot[`${game}Total`], '試行回数');
    const success = integer(snapshot[`${game}Success`], '成功回数');
    if (total < 1 || success > total) throw Error('この種目の試行回数・成功回数を確認してください。');
    const after = { ...snapshot };
    const refundValues = {};
    if (game === 'p') {
      for (const key of Object.values(refunds)) refundValues[key] = integer(snapshot[key], '還元人数');
    }
    const sourceSuccess = from !== 'failure';
    const targetSuccess = !['failure', 'delete'].includes(to);
    let available = sourceSuccess ? success : total - success;
    if (game === 'p' && from === 'unknown') {
      const recorded = Object.values(refundValues).reduce((sum, n) => sum + BigInt(n), 0n);
      available = Number(BigInt(success) > recorded ? BigInt(success) - recorded : 0n);
    } else if (game === 'p' && Object.hasOwn(refunds, from)) {
      available = Math.min(success, refundValues[refunds[from]]);
    }
    if (count > available) throw Error(`${label(from)}は現在${available}件です。修正件数が多すぎます。`);
    const nextTotal = to === 'delete' ? total - count : total;
    const nextSuccess = success + (Number(targetSuccess) - Number(sourceSuccess)) * count;
    if (!Number.isSafeInteger(nextSuccess) || nextSuccess < 0 || nextSuccess > nextTotal) {
      throw Error('修正後の成功回数が試行回数の範囲を超えます。');
    }
    after[`${game}Total`] = nextTotal === 0 ? '' : String(nextTotal);
    after[`${game}Success`] = nextTotal === 0 ? '' : String(nextSuccess);
    if (game === 'p') {
      if (Object.hasOwn(refunds, from)) after[refunds[from]] = refundValues[refunds[from]] - count;
      if (Object.hasOwn(refunds, to)) {
        const next = refundValues[refunds[to]] + count;
        if (!Number.isSafeInteger(next)) throw Error('修正後の還元人数が扱える範囲を超えます。');
        after[refunds[to]] = next;
      }
    }
    return { before: { ...snapshot }, after, game, count,
      description: `${names[game]}：${label(from)} → ${label(to)}（${count}件）` };
  }
  root.TargetCorrection = Object.freeze({ plan, label, refunds });
})(typeof window !== 'undefined' ? window : globalThis);
