'use strict';

(() => {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
  });

  const byId = (id) => document.getElementById(id);
  const MAX_COUNT = Number.MAX_SAFE_INTEGER;
  const DIGITS_ONLY = /^\d+$/;
  const VALID_SOUNDS = new Set(['click', 'pop', 'chime', 'tick', 'coin', 'drop', 'beep', 'sparkle']);
  const APP_CACHE_PREFIX = 'success-rate-calc-';
  const STEPPER_WINDOW_MS = 30000;
  const DEFAULT_TOAST_SECONDS = 60;
  const MIN_TOAST_SECONDS = 1;
  const MAX_TOAST_SECONDS = 600;
  const QUICK_UNDO_LIMIT = 500;
  const SOUND_GAIN = 0.7;

  const STORAGE_PREFIX = 'success-rate-calc:v8';
  const HIST_KEY = `${STORAGE_PREFIX}:history`;
  const INPUTS_KEY = `${STORAGE_PREFIX}:inputs`;
  const SETTINGS_KEY = `${STORAGE_PREFIX}:sound`;
  const LEGACY_HIST_KEY = 'history';
  const LEGACY_INPUTS_KEY = 'saved-inputs';
  const LEGACY_SETTINGS_KEY = 'sound-settings';
  const HISTORY_LIMIT = 100;

  const rSuccess = byId('r-success');
  const rTotal = byId('r-total');
  const rError = byId('r-error');
  const rResult = byId('r-result');
  const rCopyText = byId('r-copy-text');
  const rCopyBtn = byId('r-copy-btn');

  const pSuccess = byId('p-success');
  const pTotal = byId('p-total');
  const pError = byId('p-error');
  const pResult = byId('p-result');
  const pCopyText = byId('p-copy-text');
  const pCopyBtn = byId('p-copy-btn');
  const pigQuickUndoBtn = byId('pig-quick-undo');
  const pigQuickStatus = byId('pig-quick-status');
  const pigQuickButtons = document.querySelectorAll('.pig-quick-btn');
  const pRefundCountEl = byId('p-refund-count');
  const pRefundMinusBtn = byId('p-refund-minus');
  const pRefundPlusBtn = byId('p-refund-plus');
  const pRefund4000CountEl = byId('p-refund-4000-count');
  const pRefund4000MinusBtn = byId('p-refund-4000-minus');
  const pRefund4000PlusBtn = byId('p-refund-4000-plus');
  const pRefund3000CountEl = byId('p-refund-3000-count');
  const pRefund3000MinusBtn = byId('p-refund-3000-minus');
  const pRefund3000PlusBtn = byId('p-refund-3000-plus');
  const pRefund3500CountEl = byId('p-refund-3500-count');
  const pRefund3500MinusBtn = byId('p-refund-3500-minus');
  const pRefund3500PlusBtn = byId('p-refund-3500-plus');
  const pRefund2500CountEl = byId('p-refund-2500-count');
  const pRefund2500MinusBtn = byId('p-refund-2500-minus');
  const pRefund2500PlusBtn = byId('p-refund-2500-plus');
  const pRefund2000CountEl = byId('p-refund-2000-count');
  const pRefund2000MinusBtn = byId('p-refund-2000-minus');
  const pRefund2000PlusBtn = byId('p-refund-2000-plus');

  const comboResult = byId('combo-result');
  const comboLabel = byId('combo-label');
  const comboNote = byId('combo-note');
  const comboBreakdown = byId('combo-breakdown');
  const comboSuccessEl = byId('combo-success');
  const comboTotalEl = byId('combo-total');
  const cCopyText = byId('c-copy-text');
  const cCopyBtn = byId('c-copy-btn');
  const twoCopyText = byId('two-copy-text');
  const twoCopyBtn = byId('two-copy-btn');
  const allCopyText = byId('all-copy-text');
  const allCopyBtn = byId('all-copy-btn');

  const historyToggle = byId('history-toggle');
  const historyPanel = byId('history-panel');
  const historyList = byId('history-list');
  const historyClear = byId('history-clear');
  const snapshotSaveBtn = byId('snapshot-save');
  const resetToggle = byId('reset-toggle');
  const resetConfirm = byId('reset-confirm');
  const resetCancel = byId('reset-cancel');
  const resetExecute = byId('reset-execute');
  const statusMessage = byId('status-message');
  const stepperToastStack = byId('stepper-toast-stack');
  const toastDurationInput = byId('toast-duration');

  let rData = null;
  let pData = null;
  let rRate = null;
  let pRate = null;
  let pRefundCount = 0;
  let pRefund4000Count = 0;
  let pRefund3000Count = 0;
  let pRefund3500Count = 0;
  let pRefund2500Count = 0;
  let pRefund2000Count = 0;
  let quickRecords = [];
  const refundCounters = {
    2000: { get: () => pRefund2000Count, set: (value) => { pRefund2000Count = value; } },
    2500: { get: () => pRefund2500Count, set: (value) => { pRefund2500Count = value; } },
    3000: { get: () => pRefund3000Count, set: (value) => { pRefund3000Count = value; } },
    3500: { get: () => pRefund3500Count, set: (value) => { pRefund3500Count = value; } },
    4000: { get: () => pRefund4000Count, set: (value) => { pRefund4000Count = value; } },
    4500: { get: () => pRefundCount, set: (value) => { pRefundCount = value; } },
  };
  let comboValue = null;
  let comboCounts = null;
  let comboDetail = '';
  let historyData = [];
  let statusTimer = null;
  let resetConfirmTimer = null;
  let restoreBackup = null;
  let restoreToast = null;
  let applyingSnapshot = false;
  const stepperSummaries = new Map();
  let nonCriticalStorageWarningShown = false;
  const feedbackTimers = new WeakMap();

  function announce(message) {
    window.clearTimeout(statusTimer);
    statusMessage.textContent = message;
    statusMessage.classList.add('show');
    statusTimer = window.setTimeout(() => {
      statusMessage.classList.remove('show');
    }, 3000);
  }

  function readStoredJSON(primaryKey, legacyKey = null) {
    for (const [key, legacy] of [[primaryKey, false], [legacyKey, true]]) {
      if (!key) continue;
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) continue;
        return { value: JSON.parse(raw), legacy };
      } catch (error) {
        // 壊れた値や利用不可のストレージは読み飛ばす。
      }
    }
    return null;
  }

  function writeStoredJSON(key, value, notifyOnFailure = false) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      if (notifyOnFailure) {
        announce('端末に保存できませんでした。空き容量やブラウザ設定を確認してください。');
      } else if (!nonCriticalStorageWarningShown) {
        nonCriticalStorageWarningShown = true;
        announce('入力内容の自動保存を利用できません。');
      }
      return false;
    }
  }

  function setButtonAvailable(button, available) {
    button.dataset.available = available ? 'true' : 'false';
    button.disabled = !available || button.dataset.busy === 'true';
  }

  function flashButton(button, message, className, onDone = null) {
    const existing = feedbackTimers.get(button);
    if (existing) window.clearTimeout(existing);
    if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;

    button.textContent = message;
    button.classList.add(className);
    const timer = window.setTimeout(() => {
      button.textContent = button.dataset.defaultText;
      button.classList.remove(className);
      feedbackTimers.delete(button);
      if (onDone) onDone();
    }, 1200);
    feedbackTimers.set(button, timer);
  }

  function flashSaved(button) {
    button.dataset.busy = 'true';
    button.disabled = true;
    flashButton(button, '✓ 記憶しました', 'saved', () => {
      delete button.dataset.busy;
      button.disabled = button.dataset.available !== 'true';
    });
  }

  function flashCopied(button) {
    flashButton(button, '✓ コピー完了', 'copied');
  }

  function parseCount(rawValue) {
    const raw = String(rawValue).trim();
    if (raw === '') return { ok: false, empty: true };
    if (!DIGITS_ONLY.test(raw)) return { ok: false, empty: false };
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) return { ok: false, empty: false };
    return { ok: true, value };
  }

  function validatePair(successInput, totalInput, errorElement) {
    const successState = parseCount(successInput.value);
    const totalState = parseCount(totalInput.value);
    let message = '';
    let successInvalid = false;
    let totalInvalid = false;

    if (totalState.ok) {
      successInput.max = String(totalState.value);
    } else {
      successInput.max = String(MAX_COUNT);
    }

    if (successState.empty && totalState.empty) {
      // 初期状態ではエラーを表示しない。
    } else if (successState.empty || totalState.empty) {
      message = '試行回数と成功回数を両方入力してください。';
      successInvalid = successState.empty;
      totalInvalid = totalState.empty;
    } else if (!successState.ok || !totalState.ok) {
      message = '回数は0以上の整数で入力してください。';
      successInvalid = !successState.ok;
      totalInvalid = !totalState.ok;
    } else if (totalState.value < 1) {
      message = '試行回数は1以上で入力してください。';
      totalInvalid = true;
    } else if (successState.value > totalState.value) {
      message = '成功回数は試行回数以下にしてください。';
      successInvalid = true;
      totalInvalid = true;
    }

    successInput.setAttribute('aria-invalid', String(successInvalid));
    totalInput.setAttribute('aria-invalid', String(totalInvalid));
    errorElement.textContent = message;

    if (message || !successState.ok || !totalState.ok) return null;
    return { success: successState.value, total: totalState.value };
  }

  function fmt(rate) {
    if (!Number.isFinite(rate)) return '—';
    return `${(rate * 100).toFixed(2)}%`;
  }

  function buildRouletteText() {
    if (!rData || rRate === null) return null;
    return `ルレ${rData.total}回中${rData.success}回⭕️${fmt(rRate)}`;
  }

  function buildPigText() {
    if (!pData || pRate === null) return null;
    const refundParts = [
      pRefund2000Count > 0 ? `2000🐷${pRefund2000Count}回` : null,
      pRefund2500Count > 0 ? `2500🐷${pRefund2500Count}回` : null,
      pRefund3000Count > 0 ? `3000🐷${pRefund3000Count}回` : null,
      pRefund3500Count > 0 ? `3500🐷${pRefund3500Count}回` : null,
      pRefund4000Count > 0 ? `4000🐷${pRefund4000Count}回` : null,
      pRefundCount > 0 ? `4500🐷${pRefundCount}回` : null,
    ].filter(Boolean);
    const refundText = refundParts.length > 0 ? `\n${refundParts.join('　')}` : '';
    return `豚${pData.total}回中${pData.success}回⭕️${fmt(pRate)}${refundText}`;
  }

  function buildComboText() {
    if (comboValue === null) return null;
    return comboCounts ? `${comboCounts.total}回中${comboCounts.success}回⭕️${fmt(comboValue)}` : null;
  }

  function setCopyOutput(input, button, text) {
    input.value = text || '—';
    input.dataset.text = text || '';
    button.disabled = !text;
  }

  function updateAllCopyText() {
    const rText = buildRouletteText();
    const pText = buildPigText();
    const cText = buildComboText();

    if (rText && pText) {
      const combined = [rText, pText].join('\n');
      twoCopyText.value = combined;
      twoCopyText.dataset.text = combined;
      twoCopyBtn.disabled = false;
    } else {
      twoCopyText.value = '—';
      twoCopyText.dataset.text = '';
      twoCopyBtn.disabled = true;
    }

    if (rText && pText && cText) {
      const combined = [rText, pText, `合算：${cText}`].join('\n');
      allCopyText.value = combined;
      allCopyText.dataset.text = combined;
      allCopyBtn.disabled = false;
    } else {
      allCopyText.value = '—';
      allCopyText.dataset.text = '';
      allCopyBtn.disabled = true;
    }
  }

  function updateRoulette() {
    rData = validatePair(rSuccess, rTotal, rError);
    rRate = rData ? rData.success / rData.total : null;
    rResult.textContent = fmt(rRate);
    setCopyOutput(rCopyText, rCopyBtn, buildRouletteText());
    updateCombo();
  }

  function refreshQuickUndo() {
    const remaining = quickRecords.length;
    pigQuickUndoBtn.disabled = remaining === 0;
    pigQuickUndoBtn.textContent = remaining > 0 ? `↶ 記録を1件戻す（${remaining}件）` : '↶ 記録を1件戻す';
  }

  function clearQuickUndo() {
    quickRecords = [];
    refreshQuickUndo();
    pigQuickStatus.textContent = '記録すると順番に戻せます';
  }

  function updatePig(preserveQuickUndo = false) {
    if (!preserveQuickUndo) clearQuickUndo();
    pData = validatePair(pSuccess, pTotal, pError);
    pRate = pData ? pData.success / pData.total : null;
    pResult.textContent = fmt(pRate);
    setCopyOutput(pCopyText, pCopyBtn, buildPigText());
    updateCombo();
  }

  function captureSnapshot() {
    return {
      rSuccess: rSuccess.value,
      rTotal: rTotal.value,
      pSuccess: pSuccess.value,
      pTotal: pTotal.value,
      pRefundCount,
      pRefund4000Count,
      pRefund3500Count,
      pRefund3000Count,
      pRefund2500Count,
      pRefund2000Count,
    };
  }

  function normalizeSnapshot(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const normalizeSnapshotCount = (value) => {
      const parsed = parseCount(String(value ?? ''));
      if (parsed.empty) return '';
      return parsed.ok ? String(parsed.value) : null;
    };
    const snapshot = {
      rSuccess: normalizeSnapshotCount(raw.rSuccess),
      rTotal: normalizeSnapshotCount(raw.rTotal),
      pSuccess: normalizeSnapshotCount(raw.pSuccess),
      pTotal: normalizeSnapshotCount(raw.pTotal),
    };
    if (Object.values(snapshot).some((value) => value === null)) return null;
    for (const key of ['pRefundCount', 'pRefund4000Count', 'pRefund3500Count', 'pRefund3000Count', 'pRefund2500Count', 'pRefund2000Count']) {
      const parsed = parseCount(String(raw[key] ?? 0));
      if (!parsed.ok) return null;
      snapshot[key] = parsed.value;
    }
    for (const prefix of ['r', 'p']) {
      const success = parseCount(snapshot[`${prefix}Success`]);
      const total = parseCount(snapshot[`${prefix}Total`]);
      const empty = success.empty && total.empty;
      if (!empty && (!success.ok || !total.ok || total.value < 1 || success.value > total.value)) return null;
    }
    return snapshot;
  }

  function snapshotHasContent(snapshot) {
    return Boolean(snapshot.rSuccess || snapshot.rTotal || snapshot.pSuccess || snapshot.pTotal ||
      snapshot.pRefundCount || snapshot.pRefund4000Count || snapshot.pRefund3500Count ||
      snapshot.pRefund3000Count || snapshot.pRefund2500Count || snapshot.pRefund2000Count);
  }

  function snapshotPairText(name, successValue, totalValue) {
    const success = parseCount(successValue);
    const total = parseCount(totalValue);
    if (!success.ok || !total.ok || total.value < 1 || success.value > total.value) return null;
    return `${name}${total.value}回中${success.value}回⭕️${fmt(success.value / total.value)}`;
  }

  function buildSnapshotText(snapshot) {
    const lines = [];
    const roulette = snapshotPairText('ルレ', snapshot.rSuccess, snapshot.rTotal);
    const pig = snapshotPairText('豚', snapshot.pSuccess, snapshot.pTotal);
    if (roulette) lines.push(roulette);
    if (pig) {
      lines.push(pig);
      const refunds = [
        [2000, snapshot.pRefund2000Count], [2500, snapshot.pRefund2500Count],
        [3000, snapshot.pRefund3000Count], [3500, snapshot.pRefund3500Count],
        [4000, snapshot.pRefund4000Count], [4500, snapshot.pRefundCount],
      ].filter(([, count]) => count > 0).map(([amount, count]) => `${amount}🐷${count}回`);
      if (refunds.length) lines.push(refunds.join('　'));
    }
    const rSuccessState = parseCount(snapshot.rSuccess);
    const rTotalState = parseCount(snapshot.rTotal);
    const pSuccessState = parseCount(snapshot.pSuccess);
    const pTotalState = parseCount(snapshot.pTotal);
    if (roulette && pig) {
      const totalSuccess = rSuccessState.value + pSuccessState.value;
      const totalTrials = rTotalState.value + pTotalState.value;
      lines.push(`合算：${totalTrials}回中${totalSuccess}回⭕️${fmt(totalSuccess / totalTrials)}`);
    }
    if (!lines.length) {
      const refunds = [
        [2000, snapshot.pRefund2000Count], [2500, snapshot.pRefund2500Count],
        [3000, snapshot.pRefund3000Count], [3500, snapshot.pRefund3500Count],
        [4000, snapshot.pRefund4000Count], [4500, snapshot.pRefundCount],
      ].filter(([, count]) => count > 0).map(([amount, count]) => `${amount}🐷${count}回`);
      if (refunds.length) lines.push(refunds.join('　'));
    }
    return lines.join('\n');
  }

  function updateSnapshotSaveButton() {
    const snapshot = normalizeSnapshot(captureSnapshot());
    setButtonAvailable(snapshotSaveBtn, Boolean(snapshot && snapshotHasContent(snapshot)));
  }

  function recordPigResult(button) {
    const success = button.dataset.result === 'success';
    const amount = button.dataset.amount ? Number(button.dataset.amount) : null;
    if (success ? !refundCounters[amount] : button.dataset.result !== 'failure' || amount !== null) return;

    const totalState = parseCount(pTotal.value);
    const successState = parseCount(pSuccess.value);
    const blank = totalState.empty && successState.empty;
    if (!blank && (!totalState.ok || !successState.ok || totalState.value < 1 || successState.value > totalState.value)) {
      updatePig();
      saveInputs();
      announce('豚の回数入力を確認してから記録してください。');
      return;
    }

    const total = blank ? 0 : totalState.value;
    const successful = blank ? 0 : successState.value;
    const refund = amount === null ? null : refundCounters[amount];
    if (total >= MAX_COUNT || (success && successful >= MAX_COUNT) || (refund && refund.get() >= MAX_COUNT)) {
      announce('上限に達しているため記録できません。');
      return;
    }

    const before = { total: pTotal.value, success: pSuccess.value, refund: refund?.get() ?? null };
    pTotal.value = String(total + 1);
    pSuccess.value = String(successful + Number(success));
    if (refund) refund.set(refund.get() + 1);
    quickRecords.push({
      before,
      after: { total: pTotal.value, success: pSuccess.value, refund: refund?.get() ?? null },
      amount,
    });
    if (quickRecords.length > QUICK_UNDO_LIMIT) quickRecords.shift();
    renderRefundCount();
    updatePig(true);
    saveInputs();
    refreshQuickUndo();
    pigQuickStatus.textContent = `直前：${success ? `${amount}還元の成功` : '失敗'}を記録しました`;
    recordStepperAction(`pig-quick-${amount ?? 'failure'}`, 'plus', 1, (presses) =>
      success
        ? `🐷${amount}還元成功：${presses}回記録（試行＋${presses}・成功＋${presses}・還元＋${presses}）`
        : `🐷失敗：${presses}回記録（試行＋${presses}）`);
    playClickSound();
  }

  pigQuickButtons.forEach((button) => button.addEventListener('click', () => recordPigResult(button)));
  pigQuickUndoBtn.addEventListener('click', () => {
    const record = quickRecords[quickRecords.length - 1];
    if (!record) return;
    const refund = record.amount === null ? null : refundCounters[record.amount];
    if (pTotal.value !== record.after.total || pSuccess.value !== record.after.success ||
        (refund && refund.get() !== record.after.refund)) {
      clearQuickUndo();
      saveInputs();
      announce('数値が変更されているため、記録を取り消せません。');
      return;
    }
    pTotal.value = record.before.total;
    pSuccess.value = record.before.success;
    if (refund) refund.set(record.before.refund);
    quickRecords.pop();
    renderRefundCount();
    updatePig(true);
    saveInputs();
    refreshQuickUndo();
    pigQuickStatus.textContent = `直前の${record.amount === null ? '失敗' : `${record.amount}還元の成功`}を取り消しました`;
    recordStepperAction(`pig-quick-${record.amount ?? 'failure'}`, 'minus', 1, (presses) =>
      record.amount === null
        ? `↶ 🐷失敗を${presses}回取り消し（試行－${presses}）`
        : `↶ 🐷${record.amount}還元成功を${presses}回取り消し（試行－${presses}・成功－${presses}・還元－${presses}）`);
    playClickSound();
  });

  function clearCombo(note) {
    comboResult.textContent = '—';
    comboNote.textContent = note;
    comboValue = null;
    comboCounts = null;
    comboDetail = '';
    comboBreakdown.style.display = 'none';
    setCopyOutput(cCopyText, cCopyBtn, null);
    updateAllCopyText();
    updateSnapshotSaveButton();
  }

  function updateCombo() {
    comboBreakdown.style.display = 'none';
    comboCounts = null;

    comboLabel.textContent = '合計成功回数 ÷ 合計試行回数';
    if (!rData || !pData) {
      clearCombo('ルーレットと豚の有効な回数を両方入力すると自動計算されます。');
      return;
    }

    const totalSuccess = rData.success + pData.success;
    const totalTrials = rData.total + pData.total;
    if (!Number.isSafeInteger(totalSuccess) || !Number.isSafeInteger(totalTrials)) {
      clearCombo('合計値が大きすぎるため、安全に計算できません。');
      return;
    }

    comboValue = totalSuccess / totalTrials;
    comboCounts = { success: totalSuccess, total: totalTrials };
    comboDetail = `合計成功${totalSuccess}（ルーレット${rData.success}+豚${pData.success}） / 合計試行${totalTrials}（ルーレット${rData.total}+豚${pData.total}）`;
    comboResult.textContent = fmt(comboValue);
    comboNote.textContent = '2種類の成功回数と試行回数をそのまま合計して算出します。';
    comboBreakdown.style.display = 'flex';
    comboSuccessEl.textContent = `${totalSuccess}（${rData.success} + ${pData.success}）`;
    comboTotalEl.textContent = `${totalTrials}（${rData.total} + ${pData.total}）`;

    setCopyOutput(cCopyText, cCopyBtn, buildComboText());
    updateAllCopyText();
    updateSnapshotSaveButton();
  }

  function normalizeStoredCount(value) {
    if (value === '' || value === null || value === undefined) return '';
    const parsed = parseCount(String(value));
    return parsed.ok ? String(parsed.value) : '';
  }

  function renderRefundCount() {
    pRefundCountEl.textContent = `${pRefundCount}人`;
    pRefundMinusBtn.disabled = pRefundCount <= 0;
    pRefundPlusBtn.disabled = pRefundCount >= MAX_COUNT;
    pRefund4000CountEl.textContent = `${pRefund4000Count}人`;
    pRefund4000MinusBtn.disabled = pRefund4000Count <= 0;
    pRefund4000PlusBtn.disabled = pRefund4000Count >= MAX_COUNT;
    pRefund3000CountEl.textContent = `${pRefund3000Count}人`;
    pRefund3000MinusBtn.disabled = pRefund3000Count <= 0;
    pRefund3000PlusBtn.disabled = pRefund3000Count >= MAX_COUNT;
    pRefund3500CountEl.textContent = `${pRefund3500Count}人`;
    pRefund3500MinusBtn.disabled = pRefund3500Count <= 0;
    pRefund3500PlusBtn.disabled = pRefund3500Count >= MAX_COUNT;
    pRefund2500CountEl.textContent = `${pRefund2500Count}人`;
    pRefund2500MinusBtn.disabled = pRefund2500Count <= 0;
    pRefund2500PlusBtn.disabled = pRefund2500Count >= MAX_COUNT;
    pRefund2000CountEl.textContent = `${pRefund2000Count}人`;
    pRefund2000MinusBtn.disabled = pRefund2000Count <= 0;
    pRefund2000PlusBtn.disabled = pRefund2000Count >= MAX_COUNT;
    updateSnapshotSaveButton();
  }

  function saveInputs() {
    if (!applyingSnapshot) clearRestoreOffer();
    writeStoredJSON(INPUTS_KEY, {
      rSuccess: rSuccess.value,
      rTotal: rTotal.value,
      pSuccess: pSuccess.value,
      pTotal: pTotal.value,
      pRefundCount,
      pRefund4000Count,
      pRefund3000Count,
      pRefund3500Count,
      pRefund2500Count,
      pRefund2000Count,
      quickRecords,
    });
  }

  function normalizeQuickRecords(raw) {
    if (!Array.isArray(raw)) return [];
    const records = [];
    for (const record of raw.slice(-QUICK_UNDO_LIMIT)) {
      if (!record || typeof record !== 'object' || !record.before || !record.after) return [];
      const { before, after, amount } = record;
      if (typeof before.total !== 'string' || typeof before.success !== 'string' ||
          typeof after.total !== 'string' || typeof after.success !== 'string') return [];
      const beforeTotal = parseCount(before.total);
      const beforeSuccess = parseCount(before.success);
      const empty = beforeTotal.empty && beforeSuccess.empty;
      if (!empty && (!beforeTotal.ok || !beforeSuccess.ok || beforeTotal.value < 1 ||
          beforeSuccess.value > beforeTotal.value)) return [];
      const total = empty ? 0 : beforeTotal.value;
      const success = empty ? 0 : beforeSuccess.value;
      if (total >= MAX_COUNT || after.total !== String(total + 1) ||
          after.success !== String(success + Number(amount !== null))) return [];
      if (amount === null) {
        if (before.refund !== null || after.refund !== null) return [];
      } else if (!refundCounters[amount] || !Number.isSafeInteger(before.refund) ||
          before.refund < 0 || before.refund >= MAX_COUNT || after.refund !== before.refund + 1) return [];
      if (records.length > 0) {
        const previous = records[records.length - 1];
        if (previous.after.total !== before.total || previous.after.success !== before.success) return [];
      }
      records.push(record);
    }
    const latest = records[records.length - 1];
    if (latest && (latest.after.total !== pTotal.value || latest.after.success !== pSuccess.value ||
        (latest.amount !== null && refundCounters[latest.amount].get() !== latest.after.refund))) return [];
    return records;
  }

  function loadInputs() {
    const stored = readStoredJSON(INPUTS_KEY, LEGACY_INPUTS_KEY);
    if (!stored || !stored.value || typeof stored.value !== 'object') return;
    const data = stored.value;
    rSuccess.value = normalizeStoredCount(data.rSuccess);
    rTotal.value = normalizeStoredCount(data.rTotal);
    pSuccess.value = normalizeStoredCount(data.pSuccess);
    pTotal.value = normalizeStoredCount(data.pTotal);
    const refundState = parseCount(String(data.pRefundCount ?? 0));
    pRefundCount = refundState.ok ? refundState.value : 0;
    const refund4000State = parseCount(String(data.pRefund4000Count ?? 0));
    pRefund4000Count = refund4000State.ok ? refund4000State.value : 0;
    const refund3000State = parseCount(String(data.pRefund3000Count ?? 0));
    pRefund3000Count = refund3000State.ok ? refund3000State.value : 0;
    const refund3500State = parseCount(String(data.pRefund3500Count ?? 0));
    pRefund3500Count = refund3500State.ok ? refund3500State.value : 0;
    const refund2500State = parseCount(String(data.pRefund2500Count ?? 0));
    pRefund2500Count = refund2500State.ok ? refund2500State.value : 0;
    const refund2000State = parseCount(String(data.pRefund2000Count ?? 0));
    pRefund2000Count = refund2000State.ok ? refund2000State.value : 0;
    quickRecords = normalizeQuickRecords(data.quickRecords);
    renderRefundCount();
    refreshQuickUndo();
    if (quickRecords.length) pigQuickStatus.textContent = `${quickRecords.length}件の記録を順番に戻せます`;
    if (stored.legacy) saveInputs();
  }

  function normalizeHistory(raw) {
    if (!Array.isArray(raw)) return [];
    const legacyTypes = new Set(['roulette', 'pig', 'combo']);
    const normalized = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.id !== 'string') continue;
      if (item.type === 'snapshot') {
        const snapshot = normalizeSnapshot(item.snapshot);
        if (!snapshot || !snapshotHasContent(snapshot)) continue;
        normalized.push({
          id: item.id.slice(0, 80),
          type: 'snapshot',
          label: typeof item.label === 'string' ? item.label.slice(0, 100) : '集計記録',
          snapshot,
          summary: buildSnapshotText(snapshot),
          ts: typeof item.ts === 'string' ? item.ts.slice(0, 40) : '',
        });
      } else if (legacyTypes.has(item.type) && Number.isFinite(item.value) && item.value >= 0 && item.value <= 1 &&
          typeof item.label === 'string') {
        normalized.push({
          id: item.id.slice(0, 80),
          type: 'legacy',
          label: item.label.slice(0, 100),
          value: item.value,
          detail: typeof item.detail === 'string' ? item.detail.slice(0, 300) : '',
          ts: typeof item.ts === 'string' ? item.ts.slice(0, 40) : '',
        });
      }
      if (normalized.length >= HISTORY_LIMIT) break;
    }
    return normalized;
  }

  function historyIsOpen() {
    return historyPanel.classList.contains('open');
  }

  function updateHistoryToggleText() {
    const action = historyIsOpen() ? '閉じる' : '見る';
    historyToggle.textContent = `📜 記憶した結果を${action}（${historyData.length}件）`;
  }

  function renderHistory() {
    updateHistoryToggleText();
    historyList.replaceChildren();

    if (historyData.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'まだ記憶した結果はありません。';
      historyList.appendChild(empty);
      historyClear.style.display = 'none';
      return;
    }

    historyClear.style.display = 'block';
    for (const item of historyData) {
      const row = document.createElement('div');
      row.className = `history-item ${item.type}`;

      const dot = document.createElement('div');
      dot.className = 'dot';
      dot.setAttribute('aria-hidden', 'true');

      const info = document.createElement('div');
      info.className = 'info';
      const top = document.createElement('div');
      top.className = 'top';
      top.textContent = item.type === 'snapshot' ? `${item.label} — ${item.ts}` : `${item.label} — ${fmt(item.value)}`;
      const bottom = document.createElement('div');
      bottom.className = 'bottom';
      bottom.textContent = item.type === 'snapshot' ? item.summary : `${item.detail} ・ ${item.ts}（旧形式・反映不可）`;
      info.append(top, bottom);

      const actions = document.createElement('div');
      actions.className = 'history-actions';
      if (item.type === 'snapshot') {
        const restoreButton = document.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = 'restore';
        restoreButton.textContent = 'この状態を反映';
        restoreButton.addEventListener('click', () => restoreSnapshot(item));

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.textContent = 'コピー';
        copyButton.addEventListener('click', async () => {
          const copied = await copyToClipboard(item.summary);
          announce(copied ? '保存した結果をコピーしました。' : 'コピーできませんでした。');
        });
        actions.append(restoreButton, copyButton);
      }

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'delete';
      deleteButton.dataset.id = item.id;
      deleteButton.textContent = '削除';
      deleteButton.setAttribute('aria-label', `${item.label}の履歴を削除`);
      deleteButton.addEventListener('click', () => deleteRecord(item.id));
      actions.appendChild(deleteButton);

      row.append(dot, info, actions);
      historyList.appendChild(row);
    }
  }

  function loadHistory() {
    const stored = readStoredJSON(HIST_KEY, LEGACY_HIST_KEY);
    historyData = normalizeHistory(stored ? stored.value : []);
    if (stored && stored.legacy) writeStoredJSON(HIST_KEY, historyData);
    renderHistory();
  }

  function persistHistory(nextHistory) {
    return writeStoredJSON(HIST_KEY, nextHistory, true);
  }

  function nowStr() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function addSnapshotRecord() {
    const snapshot = normalizeSnapshot(captureSnapshot());
    if (!snapshot || !snapshotHasContent(snapshot)) return null;
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'snapshot',
      label: 'ルーレット・豚の集計',
      snapshot,
      summary: buildSnapshotText(snapshot),
      ts: nowStr(),
    };
    const nextHistory = [record, ...historyData].slice(0, HISTORY_LIMIT);
    if (!persistHistory(nextHistory)) return null;
    historyData = nextHistory;
    renderHistory();
    return record.id;
  }

  function clearRestoreOffer() {
    restoreToast?.remove();
    restoreToast = null;
    restoreBackup = null;
  }

  function applySnapshot(snapshot) {
    rSuccess.value = snapshot.rSuccess;
    rTotal.value = snapshot.rTotal;
    pSuccess.value = snapshot.pSuccess;
    pTotal.value = snapshot.pTotal;
    pRefundCount = snapshot.pRefundCount;
    pRefund4000Count = snapshot.pRefund4000Count;
    pRefund3500Count = snapshot.pRefund3500Count;
    pRefund3000Count = snapshot.pRefund3000Count;
    pRefund2500Count = snapshot.pRefund2500Count;
    pRefund2000Count = snapshot.pRefund2000Count;
    clearQuickUndo();
    renderRefundCount();
    updateRoulette();
    updatePig(true);
    saveInputs();
  }

  function showRestoreOffer() {
    restoreToast = document.createElement('div');
    restoreToast.className = 'stepper-toast';
    const message = document.createElement('span');
    message.className = 'stepper-toast-message';
    message.textContent = '保存した集計を反映しました。';
    const undoButton = document.createElement('button');
    undoButton.type = 'button';
    undoButton.className = 'stepper-toast-dismiss';
    undoButton.textContent = '反映前に戻す';
    undoButton.addEventListener('click', () => {
      if (!restoreBackup) return;
      const backup = restoreBackup;
      applyingSnapshot = true;
      applySnapshot(backup);
      applyingSnapshot = false;
      clearRestoreOffer();
      announce('反映前の状態へ戻しました。');
    });
    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'stepper-toast-dismiss';
    dismissButton.textContent = '閉じる';
    dismissButton.addEventListener('click', clearRestoreOffer);
    restoreToast.append(message, undoButton, dismissButton);
    stepperToastStack.prepend(restoreToast);
  }

  function restoreSnapshot(item) {
    const snapshot = normalizeSnapshot(item.snapshot);
    if (!snapshot) {
      announce('この記録は反映できません。');
      return;
    }
    clearRestoreOffer();
    restoreBackup = normalizeSnapshot(captureSnapshot());
    applyingSnapshot = true;
    applySnapshot(snapshot);
    applyingSnapshot = false;
    showRestoreOffer();
    announce('保存した集計を反映しました。');
  }

  function deleteRecord(id) {
    const nextHistory = historyData.filter((item) => item.id !== id);
    if (!persistHistory(nextHistory)) return;
    historyData = nextHistory;
    renderHistory();
    announce('履歴を1件削除しました。');
  }

  function setHistoryOpen(open) {
    historyPanel.classList.toggle('open', open);
    historyToggle.setAttribute('aria-expanded', String(open));
    updateHistoryToggleText();
  }

  function openHistoryAndHighlight(id) {
    setHistoryOpen(true);
    window.requestAnimationFrame(() => {
      const button = [...historyList.querySelectorAll('.delete')]
        .find((candidate) => candidate.dataset.id === id);
      const row = button ? button.closest('.history-item') : null;
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function fallbackCopy(text) {
    const activeElement = document.activeElement;
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    let copied = false;
    try {
      copied = document.execCommand('copy') === true;
    } catch (error) {
      copied = false;
    } finally {
      textArea.remove();
      if (activeElement instanceof HTMLElement) {
        activeElement.focus({ preventScroll: true });
      }
    }
    return copied;
  }

  async function copyToClipboard(text) {
    if (!text) return false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // 権限拒否時は旧方式を試す。
      }
    }
    return fallbackCopy(text);
  }

  async function handleCopy(input, button) {
    const text = input.dataset.text || '';
    if (!text) return;
    const copied = await copyToClipboard(text);
    if (copied) {
      flashCopied(button);
      announce('クリップボードにコピーしました。');
    } else {
      announce('コピーできませんでした。テキストを選択して手動でコピーしてください。');
    }
  }

  const STEPPER_LABELS = {
    'r-total': 'ルーレット試行回数',
    'r-success': 'ルーレット成功回数',
    'p-total': '豚の試行回数',
    'p-success': '豚の成功回数',
    'p-refund': '4500還元人数',
    'p-refund-4000': '4000還元人数',
    'p-refund-3000': '3000還元人数',
    'p-refund-3500': '3500還元人数',
    'p-refund-2500': '2500還元人数',
    'p-refund-2000': '2000還元人数',
  };

  function hideStepperToast(summary) {
    window.clearTimeout(summary.hideTimer);
    summary.toast?.remove();
    summary.toast = null;
    summary.message = null;
    summary.hideTimer = null;
  }

  function scheduleStepperToastHide(summary) {
    window.clearTimeout(summary.hideTimer);
    const elapsed = Math.max(0, Date.now() - summary.lastUpdatedAt);
    const remaining = toastDurationSeconds * 1000 - elapsed;
    if (remaining <= 0) {
      hideStepperToast(summary);
      return;
    }
    summary.hideTimer = window.setTimeout(() => hideStepperToast(summary), remaining);
  }

  function recordStepperAction(targetId, operation, amount, formatMessage = null) {
    if (amount <= 0) return;
    const now = Date.now();
    const key = `${targetId}:${operation}`;
    let summary = stepperSummaries.get(key);
    if (!summary || now - summary.lastPressedAt >= STEPPER_WINDOW_MS) {
      if (summary) {
        hideStepperToast(summary);
      }
      summary = {
        lastPressedAt: now,
        lastUpdatedAt: now,
        presses: 0,
        amount: 0,
        toast: summary?.toast || null,
        message: null,
        hideTimer: null,
      };
      summary.toast = null;
      stepperSummaries.set(key, summary);
    }

    summary.presses += 1;
    summary.amount += amount;
    summary.lastPressedAt = now;
    if (!summary.toast || !summary.toast.isConnected) {
      summary.toast = document.createElement('div');
      summary.toast.className = 'stepper-toast';
      summary.message = document.createElement('span');
      summary.message.className = 'stepper-toast-message';
      const dismissButton = document.createElement('button');
      dismissButton.type = 'button';
      dismissButton.className = 'stepper-toast-dismiss';
      dismissButton.textContent = '消去';
      const label = targetId.startsWith('pig-quick-') ? '豚のワンタップ記録' : (STEPPER_LABELS[targetId] || '数値');
      dismissButton.setAttribute('aria-label', `${label}の操作メッセージを消す`);
      dismissButton.addEventListener('click', () => {
        const activeSummary = stepperSummaries.get(key);
        if (activeSummary?.toast !== summary.toast) return;
        hideStepperToast(activeSummary);
      });
      summary.toast.append(summary.message, dismissButton);
      stepperToastStack.appendChild(summary.toast);
    }

    const action = operation === 'plus' ? 'プラス' : 'マイナス';
    const sign = operation === 'plus' ? '＋' : '－';
    summary.message.textContent = formatMessage
      ? formatMessage(summary.presses, summary.amount)
      : `${STEPPER_LABELS[targetId] || '数値'}：${action}${summary.presses}回（合計${sign}${summary.amount}）`;
    summary.lastUpdatedAt = now;
    scheduleStepperToastHide(summary);
  }

  function adjustValue(targetId, operation) {
    const targetInput = byId(targetId);
    const deltaInput = byId(`${targetId}-delta`);
    if (!targetInput || !deltaInput) return false;

    const deltaState = parseCount(deltaInput.value);
    if (!deltaState.ok || deltaState.value < 1) {
      deltaInput.setAttribute('aria-invalid', 'true');
      announce('増減幅は1以上の整数で入力してください。');
      return false;
    }
    deltaInput.setAttribute('aria-invalid', 'false');

    const min = Number(targetInput.min || 0);
    const declaredMax = Number(targetInput.max || MAX_COUNT);
    const max = Number.isSafeInteger(declaredMax) ? declaredMax : MAX_COUNT;
    const currentState = parseCount(targetInput.value);
    const current = currentState.ok ? currentState.value : min;
    let next;

    if (operation === 'plus') {
      next = current > max - deltaState.value ? max : current + deltaState.value;
    } else {
      next = Math.min(max, Math.max(min, current - deltaState.value));
    }
    targetInput.value = String(next);
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    return { changed: next !== current, amount: Math.abs(next - current) };
  }

  function resetConfirmationIsOpen() {
    return !resetConfirm.hidden;
  }

  function setResetConfirmation(open, returnFocus = false) {
    window.clearTimeout(resetConfirmTimer);
    resetConfirm.hidden = !open;
    resetToggle.setAttribute('aria-expanded', String(open));

    if (open) {
      resetConfirmTimer = window.setTimeout(() => {
        setResetConfirmation(false);
      }, 8000);
      window.requestAnimationFrame(() => resetCancel.focus());
    } else if (returnFocus) {
      resetToggle.focus();
    }
  }

  historyToggle.addEventListener('click', () => setHistoryOpen(!historyIsOpen()));
  historyClear.addEventListener('click', () => {
    if (!window.confirm('記憶した結果をすべて削除しますか？')) return;
    if (!persistHistory([])) return;
    historyData = [];
    renderHistory();
    announce('履歴をすべて削除しました。');
  });

  resetToggle.addEventListener('click', () => {
    setResetConfirmation(!resetConfirmationIsOpen());
  });

  resetCancel.addEventListener('click', () => {
    setResetConfirmation(false, true);
    announce('リセットをキャンセルしました。');
  });

  async function clearAppCaches() {
    if (!('caches' in window)) return { supported: false, deleted: 0 };
    try {
      const keys = await caches.keys();
      const targets = keys.filter((key) => key.startsWith(APP_CACHE_PREFIX));
      const results = await Promise.all(targets.map((key) => caches.delete(key)));
      return { supported: true, deleted: results.filter(Boolean).length };
    } catch (error) {
      return { supported: false, deleted: 0 };
    }
  }

  resetExecute.addEventListener('click', async () => {
    const inputs = [rSuccess, rTotal, pSuccess, pTotal];
    setResetConfirmation(false, true);
    inputs.forEach((input) => { input.value = ''; });
    pRefundCount = 0;
    pRefund4000Count = 0;
    pRefund3000Count = 0;
    pRefund3500Count = 0;
    pRefund2500Count = 0;
    pRefund2000Count = 0;
    renderRefundCount();
    updateRoulette();
    updatePig();
    saveInputs();
    const cacheResult = await clearAppCaches();
    if (cacheResult.supported) {
      announce('入力数値・還元人数・アプリキャッシュを消去しました。履歴は残っています。');
    } else {
      announce('入力数値と還元人数を消去しました。キャッシュはこの環境では消去できませんでした。');
    }
  });

  resetConfirm.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    setResetConfirmation(false, true);
  });

  snapshotSaveBtn.addEventListener('click', () => {
    const id = addSnapshotRecord();
    if (!id) return;
    flashSaved(snapshotSaveBtn);
    openHistoryAndHighlight(id);
  });

  rCopyBtn.addEventListener('click', () => handleCopy(rCopyText, rCopyBtn));
  pCopyBtn.addEventListener('click', () => handleCopy(pCopyText, pCopyBtn));
  cCopyBtn.addEventListener('click', () => handleCopy(cCopyText, cCopyBtn));
  twoCopyBtn.addEventListener('click', () => handleCopy(twoCopyText, twoCopyBtn));
  allCopyBtn.addEventListener('click', () => handleCopy(allCopyText, allCopyBtn));

  [rSuccess, rTotal].forEach((input) => {
    input.addEventListener('input', () => {
      if (resetConfirmationIsOpen()) setResetConfirmation(false);
      updateRoulette();
      saveInputs();
    });
  });
  [pSuccess, pTotal].forEach((input) => {
    input.addEventListener('input', () => {
      if (resetConfirmationIsOpen()) setResetConfirmation(false);
      updatePig();
      saveInputs();
    });
  });
  let audioCtx = null;
  let soundType = 'click';
  let muted = false;
  let toastDurationSeconds = DEFAULT_TOAST_SECONDS;

  async function ensureAudioCtx() {
    if (!audioCtx || audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio API is unavailable');
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return audioCtx;
  }

  function closeAudioCtx() {
    if (!audioCtx) return;
    const context = audioCtx;
    audioCtx = null;
    context.close().catch(() => {});
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) closeAudioCtx();
  });
  window.addEventListener('pagehide', closeAudioCtx);

  function tone(context, frequency, startTime, duration, type, peakGain) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(peakGain * SOUND_GAIN, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  async function playClickSound() {
    if (muted) return;
    try {
      const context = await ensureAudioCtx();
      const now = context.currentTime;
      if (soundType === 'pop') {
        tone(context, 220, now, 0.07, 'square', 0.12);
      } else if (soundType === 'chime') {
        tone(context, 1046, now, 0.06, 'sine', 0.13);
        tone(context, 1568, now + 0.05, 0.09, 'sine', 0.11);
      } else if (soundType === 'tick') {
        tone(context, 1800, now, 0.035, 'square', 0.1);
      } else if (soundType === 'coin') {
        tone(context, 988, now, 0.07, 'square', 0.1);
        tone(context, 1319, now + 0.06, 0.11, 'sine', 0.12);
      } else if (soundType === 'drop') {
        tone(context, 740, now, 0.08, 'sine', 0.12);
        tone(context, 440, now + 0.06, 0.12, 'sine', 0.1);
      } else if (soundType === 'beep') {
        tone(context, 660, now, 0.12, 'triangle', 0.14);
      } else if (soundType === 'sparkle') {
        tone(context, 1319, now, 0.06, 'sine', 0.09);
        tone(context, 1760, now + 0.04, 0.08, 'sine', 0.1);
        tone(context, 2093, now + 0.08, 0.12, 'sine', 0.1);
      } else {
        tone(context, 880, now, 0.08, 'sine', 0.15);
      }
    } catch (error) {
      // 音が鳴らせない環境でも計算機能は継続する。
    }
  }

  const muteBtn = byId('mute-toggle');
  const soundButtons = document.querySelectorAll('.sound-btn');

  function applySettingsUI() {
    soundButtons.forEach((button) => {
      const selected = button.dataset.sound === soundType;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    muteBtn.textContent = muted ? '🔇 OFF' : '🔊 ON';
    muteBtn.classList.toggle('muted', muted);
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? '効果音をオンにする' : '効果音をオフにする');
    toastDurationInput.value = String(toastDurationSeconds);
    toastDurationInput.setAttribute('aria-invalid', 'false');
  }

  function saveSettings() {
    writeStoredJSON(SETTINGS_KEY, { soundType, muted, toastDurationSeconds });
  }

  function loadSettings() {
    const stored = readStoredJSON(SETTINGS_KEY, LEGACY_SETTINGS_KEY);
    if (stored && stored.value && typeof stored.value === 'object') {
      if (VALID_SOUNDS.has(stored.value.soundType)) soundType = stored.value.soundType;
      if (typeof stored.value.muted === 'boolean') muted = stored.value.muted;
      if (Number.isSafeInteger(stored.value.toastDurationSeconds)
        && stored.value.toastDurationSeconds >= MIN_TOAST_SECONDS
        && stored.value.toastDurationSeconds <= MAX_TOAST_SECONDS) {
        toastDurationSeconds = stored.value.toastDurationSeconds;
      }
      if (stored.legacy) saveSettings();
    }
    applySettingsUI();
  }

  soundButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const selectedSound = button.dataset.sound;
      if (!VALID_SOUNDS.has(selectedSound)) return;
      soundType = selectedSound;
      applySettingsUI();
      saveSettings();
      playClickSound();
    });
  });

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    applySettingsUI();
    saveSettings();
    if (!muted) playClickSound();
  });

  toastDurationInput.addEventListener('change', () => {
    const nextValue = Number(toastDurationInput.value);
    if (!Number.isSafeInteger(nextValue) || nextValue < MIN_TOAST_SECONDS || nextValue > MAX_TOAST_SECONDS) {
      toastDurationInput.setAttribute('aria-invalid', 'true');
      announce('通知表示時間は1〜600秒の整数で入力してください。');
      toastDurationInput.value = String(toastDurationSeconds);
      return;
    }
    toastDurationSeconds = nextValue;
    toastDurationInput.setAttribute('aria-invalid', 'false');
    saveSettings();
    stepperSummaries.forEach((summary) => {
      if (summary.toast?.isConnected) scheduleStepperToastHide(summary);
    });
    announce(`操作メッセージの表示時間を${toastDurationSeconds}秒に変更しました。`);
  });

  document.querySelectorAll('.stepper-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.target || '';
      const operation = button.dataset.op;
      const result = adjustValue(target, operation);
      if (!result) return;
      playClickSound();
      if (result.changed) recordStepperAction(target, operation, result.amount);
    });
  });

  pRefundPlusBtn.addEventListener('click', () => {
    if (pRefundCount >= MAX_COUNT) return;
    pRefundCount += 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund', 'plus', 1);
  });

  pRefundMinusBtn.addEventListener('click', () => {
    if (pRefundCount <= 0) return;
    pRefundCount -= 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund', 'minus', 1);
  });

  pRefund4000PlusBtn.addEventListener('click', () => {
    if (pRefund4000Count >= MAX_COUNT) return;
    pRefund4000Count += 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund-4000', 'plus', 1);
  });

  pRefund4000MinusBtn.addEventListener('click', () => {
    if (pRefund4000Count <= 0) return;
    pRefund4000Count -= 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund-4000', 'minus', 1);
  });

  pRefund3000PlusBtn.addEventListener('click', () => {
    if (pRefund3000Count >= MAX_COUNT) return;
    pRefund3000Count += 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund-3000', 'plus', 1);
  });

  pRefund3000MinusBtn.addEventListener('click', () => {
    if (pRefund3000Count <= 0) return;
    pRefund3000Count -= 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund-3000', 'minus', 1);
  });

  pRefund3500PlusBtn.addEventListener('click', () => {
    if (pRefund3500Count >= MAX_COUNT) return;
    pRefund3500Count += 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund-3500', 'plus', 1);
  });

  pRefund3500MinusBtn.addEventListener('click', () => {
    if (pRefund3500Count <= 0) return;
    pRefund3500Count -= 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund-3500', 'minus', 1);
  });

  pRefund2500PlusBtn.addEventListener('click', () => {
    if (pRefund2500Count >= MAX_COUNT) return;
    pRefund2500Count += 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund-2500', 'plus', 1);
  });

  pRefund2500MinusBtn.addEventListener('click', () => {
    if (pRefund2500Count <= 0) return;
    pRefund2500Count -= 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund-2500', 'minus', 1);
  });

  pRefund2000PlusBtn.addEventListener('click', () => {
    if (pRefund2000Count >= MAX_COUNT) return;
    pRefund2000Count += 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund-2000', 'plus', 1);
  });

  pRefund2000MinusBtn.addEventListener('click', () => {
    if (pRefund2000Count <= 0) return;
    pRefund2000Count -= 1;
    renderRefundCount();
    updatePig();
    saveInputs();
    playClickSound();
    recordStepperAction('p-refund-2000', 'minus', 1);
  });

  document.querySelectorAll('.stepper-row input[type="number"]').forEach((input) => {
    input.addEventListener('input', () => {
      const parsed = parseCount(input.value);
      input.setAttribute('aria-invalid', String(!parsed.ok || parsed.value < 1));
    });
  });

  loadInputs();
  renderRefundCount();
  loadSettings();
  updateRoulette();
  updatePig(true);
  loadHistory();

  if ('serviceWorker' in navigator && ['http:', 'https:'].includes(window.location.protocol)) {
    window.addEventListener('load', async () => {
      try {
        await navigator.serviceWorker.register('./service-worker.js');
      } catch (error) {
        console.error('Service worker registration failed:', error);
        announce('オフライン機能を開始できませんでした。');
      }
    });
  }
})();
