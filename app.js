'use strict';

(() => {
  const byId = (id) => document.getElementById(id);
  const MAX_COUNT = Number.MAX_SAFE_INTEGER;
  const DIGITS_ONLY = /^\d+$/;
  const VALID_MODES = new Set(['pool', 'either', 'both', 'avg']);
  const VALID_SOUNDS = new Set(['click', 'pop', 'chime', 'theme']);

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
  const rSaveBtn = byId('r-save');

  const pSuccess = byId('p-success');
  const pTotal = byId('p-total');
  const pError = byId('p-error');
  const pResult = byId('p-result');
  const pCopyText = byId('p-copy-text');
  const pCopyBtn = byId('p-copy-btn');
  const pSaveBtn = byId('p-save');

  const comboResult = byId('combo-result');
  const comboLabel = byId('combo-label');
  const comboNote = byId('combo-note');
  const comboBreakdown = byId('combo-breakdown');
  const comboSuccessEl = byId('combo-success');
  const comboTotalEl = byId('combo-total');
  const cCopyText = byId('c-copy-text');
  const cCopyBtn = byId('c-copy-btn');
  const cSaveBtn = byId('c-save');
  const twoCopyText = byId('two-copy-text');
  const twoCopyBtn = byId('two-copy-btn');
  const allCopyText = byId('all-copy-text');
  const allCopyBtn = byId('all-copy-btn');

  const historyToggle = byId('history-toggle');
  const historyPanel = byId('history-panel');
  const historyList = byId('history-list');
  const historyClear = byId('history-clear');
  const resetToggle = byId('reset-toggle');
  const resetConfirm = byId('reset-confirm');
  const resetCancel = byId('reset-cancel');
  const resetExecute = byId('reset-execute');
  const statusMessage = byId('status-message');

  const modeButtons = {
    pool: byId('mode-pool'),
    either: byId('mode-either'),
    both: byId('mode-both'),
    avg: byId('mode-avg'),
  };

  let mode = 'pool';
  let rData = null;
  let pData = null;
  let rRate = null;
  let pRate = null;
  let comboValue = null;
  let comboCounts = null;
  let comboDetail = '';
  let historyData = [];
  let statusTimer = null;
  let resetConfirmTimer = null;
  let stepperBatchTimer = null;
  let stepperBatch = null;
  let nonCriticalStorageWarningShown = false;
  const feedbackTimers = new WeakMap();

  function announce(message) {
    window.clearTimeout(statusTimer);
    statusMessage.textContent = message;
    statusMessage.classList.add('show');
    statusTimer = window.setTimeout(() => {
      statusMessage.classList.remove('show');
    }, 2600);
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
    return `豚${pData.total}回中${pData.success}回⭕️${fmt(pRate)}`;
  }

  function buildComboText() {
    if (comboValue === null) return null;
    if (mode === 'pool' && comboCounts) {
      return `${comboCounts.total}回中${comboCounts.success}回⭕️${fmt(comboValue)}`;
    }
    return fmt(comboValue);
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
      const combined = `${rText}\n${pText}`;
      twoCopyText.value = combined;
      twoCopyText.dataset.text = combined;
      twoCopyBtn.disabled = false;
    } else {
      twoCopyText.value = '—';
      twoCopyText.dataset.text = '';
      twoCopyBtn.disabled = true;
    }

    if (rText && pText && cText) {
      const combined = `${rText}\n${pText}\n合算：${cText}`;
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
    setButtonAvailable(rSaveBtn, rRate !== null);
    setCopyOutput(rCopyText, rCopyBtn, buildRouletteText());
    updateCombo();
  }

  function updatePig() {
    pData = validatePair(pSuccess, pTotal, pError);
    pRate = pData ? pData.success / pData.total : null;
    pResult.textContent = fmt(pRate);
    setButtonAvailable(pSaveBtn, pRate !== null);
    setCopyOutput(pCopyText, pCopyBtn, buildPigText());
    updateCombo();
  }

  function clearCombo(note) {
    comboResult.textContent = '—';
    comboNote.textContent = note;
    comboValue = null;
    comboCounts = null;
    comboDetail = '';
    comboBreakdown.style.display = 'none';
    setButtonAvailable(cSaveBtn, false);
    setCopyOutput(cCopyText, cCopyBtn, null);
    updateAllCopyText();
  }

  function updateCombo() {
    comboBreakdown.style.display = 'none';
    comboCounts = null;

    if (mode === 'pool') {
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
    } else {
      const modeInfo = {
        either: {
          label: '少なくとも一方が成功する確率',
          note: '独立事象と仮定: 1 − (1−ルーレット)×(1−豚)',
        },
        both: {
          label: '両方とも成功する確率',
          note: '独立事象と仮定: ルーレット × 豚',
        },
        avg: {
          label: '単純平均成功率',
          note: '(ルーレット + 豚) ÷ 2（試行回数による重み付けなし）',
        },
      }[mode];

      comboLabel.textContent = modeInfo.label;
      if (rRate === null || pRate === null) {
        clearCombo(`ルーレットと豚の有効な成功率を両方入力してください。${modeInfo.note}`);
        return;
      }

      if (mode === 'either') {
        comboValue = 1 - (1 - rRate) * (1 - pRate);
      } else if (mode === 'both') {
        comboValue = rRate * pRate;
      } else {
        comboValue = (rRate + pRate) / 2;
      }
      comboDetail = `ルーレット${fmt(rRate)} / 豚${fmt(pRate)}`;
      comboResult.textContent = fmt(comboValue);
      comboNote.textContent = modeInfo.note;
    }

    setButtonAvailable(cSaveBtn, true);
    setCopyOutput(cCopyText, cCopyBtn, buildComboText());
    updateAllCopyText();
  }

  function applyModeUI() {
    Object.entries(modeButtons).forEach(([key, button]) => {
      const selected = key === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function setMode(newMode, persist = true) {
    if (!VALID_MODES.has(newMode)) return;
    mode = newMode;
    applyModeUI();
    updateCombo();
    if (persist) saveInputs();
  }

  function normalizeStoredCount(value) {
    if (value === '' || value === null || value === undefined) return '';
    const parsed = parseCount(String(value));
    return parsed.ok ? String(parsed.value) : '';
  }

  function saveInputs() {
    writeStoredJSON(INPUTS_KEY, {
      rSuccess: rSuccess.value,
      rTotal: rTotal.value,
      pSuccess: pSuccess.value,
      pTotal: pTotal.value,
      mode,
    });
  }

  function loadInputs() {
    const stored = readStoredJSON(INPUTS_KEY, LEGACY_INPUTS_KEY);
    if (!stored || !stored.value || typeof stored.value !== 'object') return;
    const data = stored.value;
    rSuccess.value = normalizeStoredCount(data.rSuccess);
    rTotal.value = normalizeStoredCount(data.rTotal);
    pSuccess.value = normalizeStoredCount(data.pSuccess);
    pTotal.value = normalizeStoredCount(data.pTotal);
    mode = VALID_MODES.has(data.mode) ? data.mode : 'pool';
    if (stored.legacy) saveInputs();
  }

  function normalizeHistory(raw) {
    if (!Array.isArray(raw)) return [];
    const allowedTypes = new Set(['roulette', 'pig', 'combo']);
    const normalized = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      if (!allowedTypes.has(item.type)) continue;
      if (!Number.isFinite(item.value) || item.value < 0 || item.value > 1) continue;
      if (typeof item.id !== 'string' || typeof item.label !== 'string') continue;
      normalized.push({
        id: item.id.slice(0, 80),
        type: item.type,
        label: item.label.slice(0, 100),
        value: item.value,
        detail: typeof item.detail === 'string' ? item.detail.slice(0, 300) : '',
        ts: typeof item.ts === 'string' ? item.ts.slice(0, 40) : '',
      });
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
      top.textContent = `${item.label} — ${fmt(item.value)}`;
      const bottom = document.createElement('div');
      bottom.className = 'bottom';
      bottom.textContent = `${item.detail} ・ ${item.ts}`;
      info.append(top, bottom);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'del';
      deleteButton.dataset.id = item.id;
      deleteButton.textContent = '✕';
      deleteButton.setAttribute('aria-label', `${item.label}の履歴を削除`);
      deleteButton.addEventListener('click', () => deleteRecord(item.id));

      row.append(dot, info, deleteButton);
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

  function addRecord(type, label, value, detail) {
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      label,
      value,
      detail,
      ts: nowStr(),
    };
    const nextHistory = [record, ...historyData].slice(0, HISTORY_LIMIT);
    if (!persistHistory(nextHistory)) return null;
    historyData = nextHistory;
    renderHistory();
    return record.id;
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
      const button = [...historyList.querySelectorAll('.del')]
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
  };

  function flushStepperBatch() {
    window.clearTimeout(stepperBatchTimer);
    stepperBatchTimer = null;
    if (!stepperBatch) return;

    const { targetId, operation, presses, amount } = stepperBatch;
    const sign = operation === 'plus' ? '＋' : '－';
    announce(`${STEPPER_LABELS[targetId] || '数値'}：${sign}を${presses}回（合計${sign}${amount}）`);
    stepperBatch = null;
  }

  function recordStepperAction(targetId, operation, amount) {
    if (amount <= 0) return;

    if (stepperBatch && (stepperBatch.targetId !== targetId || stepperBatch.operation !== operation)) {
      flushStepperBatch();
    }

    if (!stepperBatch) {
      stepperBatch = { targetId, operation, presses: 0, amount: 0 };
    }
    stepperBatch.presses += 1;
    stepperBatch.amount += amount;
    window.clearTimeout(stepperBatchTimer);
    stepperBatchTimer = window.setTimeout(flushStepperBatch, 700);
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

  resetExecute.addEventListener('click', () => {
    const inputs = [rSuccess, rTotal, pSuccess, pTotal];
    const hasInput = inputs.some((input) => input.value !== '');
    setResetConfirmation(false, true);
    if (!hasInput) {
      announce('リセットする数値はありません。');
      return;
    }

    inputs.forEach((input) => { input.value = ''; });
    updateRoulette();
    updatePig();
    saveInputs();
    announce('4つの入力数値をリセットしました。履歴は残っています。');
  });

  resetConfirm.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    setResetConfirmation(false, true);
  });

  rSaveBtn.addEventListener('click', () => {
    if (!rData || rRate === null) return;
    const id = addRecord('roulette', '🎯 ルーレット成功率', rRate, `成功${rData.success} / 試行${rData.total}`);
    if (!id) return;
    flashSaved(rSaveBtn);
    openHistoryAndHighlight(id);
  });

  pSaveBtn.addEventListener('click', () => {
    if (!pData || pRate === null) return;
    const id = addRecord('pig', '🐷 豚成功率', pRate, `成功${pData.success} / 試行${pData.total}`);
    if (!id) return;
    flashSaved(pSaveBtn);
    openHistoryAndHighlight(id);
  });

  cSaveBtn.addEventListener('click', () => {
    if (comboValue === null) return;
    const id = addRecord('combo', `➕ ${comboLabel.textContent}`, comboValue, comboDetail);
    if (!id) return;
    flashSaved(cSaveBtn);
    openHistoryAndHighlight(id);
  });

  rCopyBtn.addEventListener('click', () => handleCopy(rCopyText, rCopyBtn));
  pCopyBtn.addEventListener('click', () => handleCopy(pCopyText, pCopyBtn));
  cCopyBtn.addEventListener('click', () => handleCopy(cCopyText, cCopyBtn));
  twoCopyBtn.addEventListener('click', () => handleCopy(twoCopyText, twoCopyBtn));
  allCopyBtn.addEventListener('click', () => handleCopy(allCopyText, allCopyBtn));

  Object.entries(modeButtons).forEach(([key, button]) => {
    button.addEventListener('click', () => setMode(key));
  });

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
  let volume = 0.7;

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
    gain.gain.setValueAtTime(peakGain * volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  function playDartHit(context) {
    const now = context.currentTime;
    const bufferSize = Math.floor(context.sampleRate * 0.05);
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index += 1) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / bufferSize, 2);
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    noise.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 2800;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.4 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    noise.start(now);
    tone(context, 140, now, 0.06, 'sine', 0.16);
  }

  function playPigOink(context) {
    const now = context.currentTime;
    const duration = 0.32;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const tremolo = context.createOscillator();
    const tremoloDepth = context.createGain();
    const tremoloGain = context.createGain();
    const envelope = context.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(240, now);
    oscillator.frequency.linearRampToValueAtTime(110, now + 0.09);
    oscillator.frequency.linearRampToValueAtTime(190, now + 0.17);
    oscillator.frequency.linearRampToValueAtTime(85, now + duration);
    filter.type = 'bandpass';
    filter.frequency.value = 550;
    filter.Q.value = 1.1;
    tremolo.frequency.value = 38;
    tremoloDepth.gain.value = 0.5;
    tremoloGain.gain.value = 0.5;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(0.28 * volume, now + 0.025);
    envelope.gain.setValueAtTime(0.24 * volume, now + 0.15);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(filter);
    filter.connect(tremoloGain);
    tremoloGain.connect(envelope);
    envelope.connect(context.destination);
    tremolo.connect(tremoloDepth);
    tremoloDepth.connect(tremoloGain.gain);
    oscillator.start(now);
    oscillator.stop(now + duration);
    tremolo.start(now);
    tremolo.stop(now + duration);
  }

  async function playClickSound(cardType = null) {
    if (muted || volume <= 0) return;
    try {
      const context = await ensureAudioCtx();
      const now = context.currentTime;
      if (soundType === 'theme') {
        if (cardType === 'roulette') playDartHit(context);
        else if (cardType === 'pig') playPigOink(context);
        else tone(context, 880, now, 0.08, 'sine', 0.15);
      } else if (soundType === 'pop') {
        tone(context, 220, now, 0.07, 'square', 0.12);
      } else if (soundType === 'chime') {
        tone(context, 1046, now, 0.06, 'sine', 0.13);
        tone(context, 1568, now + 0.05, 0.09, 'sine', 0.11);
      } else {
        tone(context, 880, now, 0.08, 'sine', 0.15);
      }
    } catch (error) {
      // 音が鳴らせない環境でも計算機能は継続する。
    }
  }

  const muteBtn = byId('mute-toggle');
  const volumeControl = byId('volume-control');
  const volumeSummary = byId('volume-summary');
  const volumeSlider = byId('volume-slider');
  const volumeOutput = byId('volume-output');
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
    const volumePercent = Math.round(volume * 100);
    volumeSlider.value = String(volumePercent);
    volumeOutput.textContent = `${volumePercent}%`;
    volumeSummary.textContent = `${volumePercent === 0 ? '🔇' : '🎚'} ${volumePercent}%`;
    volumeSummary.setAttribute('aria-label', `音量を調節する。現在${volumePercent}パーセント`);
  }

  function saveSettings() {
    writeStoredJSON(SETTINGS_KEY, { soundType, muted, volume });
  }

  function loadSettings() {
    const stored = readStoredJSON(SETTINGS_KEY, LEGACY_SETTINGS_KEY);
    if (stored && stored.value && typeof stored.value === 'object') {
      if (VALID_SOUNDS.has(stored.value.soundType)) soundType = stored.value.soundType;
      if (typeof stored.value.muted === 'boolean') muted = stored.value.muted;
      if (Number.isFinite(stored.value.volume)) {
        volume = Math.min(1, Math.max(0, stored.value.volume));
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
      if (soundType === 'theme') {
        playClickSound('roulette');
        window.setTimeout(() => {
          if (soundType === 'theme' && !muted) playClickSound('pig');
        }, 350);
      } else {
        playClickSound();
      }
    });
  });

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    applySettingsUI();
    saveSettings();
    if (!muted) playClickSound();
  });

  volumeSlider.addEventListener('input', () => {
    const nextVolume = Number(volumeSlider.value) / 100;
    volume = Number.isFinite(nextVolume) ? Math.min(1, Math.max(0, nextVolume)) : 0.7;
    applySettingsUI();
    saveSettings();
  });

  volumeSlider.addEventListener('change', () => {
    if (!muted && volume > 0) playClickSound();
    volumeControl.open = false;
  });

  volumeControl.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    volumeControl.open = false;
    volumeSummary.focus();
  });

  document.querySelectorAll('.stepper-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.target || '';
      const cardType = target.startsWith('r-') ? 'roulette' : target.startsWith('p-') ? 'pig' : null;
      const operation = button.dataset.op;
      const result = adjustValue(target, operation);
      if (!result) return;
      playClickSound(cardType);
      if (result.changed) recordStepperAction(target, operation, result.amount);
    });
  });

  document.querySelectorAll('.stepper-row input[type="number"]').forEach((input) => {
    input.addEventListener('input', () => {
      const parsed = parseCount(input.value);
      input.setAttribute('aria-invalid', String(!parsed.ok || parsed.value < 1));
    });
  });

  loadInputs();
  applyModeUI();
  loadSettings();
  updateRoulette();
  updatePig();
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
