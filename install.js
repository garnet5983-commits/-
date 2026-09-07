'use strict';

(() => {
  const byId = (id) => document.getElementById(id);
  const launchButton = byId('install-launch');
  const launchLabel = byId('install-launch-label');
  const dialog = byId('install-dialog');
  const closeButton = byId('install-close');
  const iosButton = byId('install-ios');
  const androidButton = byId('install-android');
  const iosGuide = byId('install-ios-guide');
  const androidGuide = byId('install-android-guide');
  const errorMessage = byId('install-error');
  const urlInput = byId('install-url');
  const copyButton = byId('install-copy-url');
  const copyFeedback = byId('install-copy-feedback');
  const standaloneMode = window.matchMedia('(display-mode: standalone)');
  let deferredPrompt = null;
  let promptIsOpen = false;
  let installedThisSession = false;
  let previousFocus = null;

  const userAgent = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = !isIOS && /Android/i.test(userAgent);
  const hasWebURL = /^https?:$/.test(window.location.protocol);

  function isInstalledWindow() {
    return installedThisSession || standaloneMode.matches || navigator.standalone === true;
  }

  function selectPlatform(platform) {
    const ios = platform === 'ios';
    iosGuide.hidden = !ios;
    androidGuide.hidden = ios;
    iosButton.setAttribute('aria-pressed', String(ios));
    androidButton.setAttribute('aria-pressed', String(!ios));
  }

  function closeGuide() {
    if (!dialog.open) return;
    if (typeof dialog.close === 'function') dialog.close();
    else {
      dialog.removeAttribute('open');
      restoreFocus();
    }
  }

  function restoreFocus() {
    if (previousFocus && !previousFocus.hidden && !previousFocus.disabled) {
      previousFocus.focus();
    }
    previousFocus = null;
  }

  function refreshButton() {
    const installed = isInstalledWindow();
    launchButton.hidden = installed;
    launchButton.disabled = promptIsOpen;
    launchButton.setAttribute('aria-busy', String(promptIsOpen));
    launchLabel.textContent = promptIsOpen ? '確認画面を開いています…' : 'ホーム画面に追加';
    if (installed) {
      deferredPrompt = null;
      closeGuide();
    }
  }

  function showGuide(message = '') {
    if (isInstalledWindow()) return;
    errorMessage.textContent = message;
    errorMessage.hidden = !message;
    copyFeedback.textContent = '';
    if (!dialog.open) {
      previousFocus = document.activeElement;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      closeButton.focus();
    }
  }

  // The browser supplies a fresh, single-use event when installation is available.
  window.addEventListener('beforeinstallprompt', (event) => {
    if (isInstalledWindow() || typeof event.prompt !== 'function') return;
    event.preventDefault();
    deferredPrompt = event;
    refreshButton();
  });

  launchButton.addEventListener('click', async () => {
    if (promptIsOpen || isInstalledWindow()) return;
    if (!deferredPrompt) {
      showGuide();
      return;
    }
    const installEvent = deferredPrompt;
    deferredPrompt = null;
    promptIsOpen = true;
    refreshButton();
    try {
      // Keep the call within the user's tap; never open the prompt automatically.
      await installEvent.prompt();
      if (installEvent.userChoice) await installEvent.userChoice;
      // Acceptance alone is not proof of completed installation.
      // Hide the button only on appinstalled or an installed-window signal.
    } catch (error) {
      showGuide('追加画面を開けませんでした。下の手順で、ブラウザのメニューから追加してください。');
    } finally {
      promptIsOpen = false;
      refreshButton();
    }
  });

  window.addEventListener('appinstalled', () => {
    installedThisSession = true;
    refreshButton();
  });
  window.addEventListener('pageshow', refreshButton);
  if (typeof standaloneMode.addEventListener === 'function') {
    standaloneMode.addEventListener('change', refreshButton);
  } else if (typeof standaloneMode.addListener === 'function') {
    standaloneMode.addListener(refreshButton);
  }

  iosButton.addEventListener('click', () => selectPlatform('ios'));
  androidButton.addEventListener('click', () => selectPlatform('android'));
  closeButton.addEventListener('click', closeGuide);
  dialog.addEventListener('close', restoreFocus);
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeGuide();
    }
  });

  copyButton.addEventListener('click', async () => {
    if (!hasWebURL) return;
    copyButton.disabled = true;
    copyFeedback.textContent = '';
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(urlInput.value);
      copyFeedback.textContent = 'URLをコピーしました。';
    } catch (error) {
      urlInput.focus();
      urlInput.select();
      copyFeedback.textContent = '自動コピーできませんでした。URL欄を長押ししてコピーしてください。';
    } finally {
      copyButton.disabled = false;
    }
  });

  selectPlatform(isAndroid ? 'android' : 'ios');
  urlInput.value = hasWebURL ? window.location.href : '';
  byId('install-url-area').hidden = !hasWebURL;
  byId('install-file-note').hidden = hasWebURL;
  refreshButton();
})();
