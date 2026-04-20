(function () {
  'use strict';

  const STORAGE_KEY = 'hideMapleBadgeRows';

  const toggle = document.getElementById('hideBadgeToggle');
  const statusText = document.getElementById('statusText');

  function setStatus(enabled) {
    statusText.textContent = enabled
      ? '인증 아이콘이 없는 글을 숨기고 있습니다.'
      : '인증 아이콘이 없는 글도 그대로 보여줍니다.';
  }

  chrome.storage.sync.get({ [STORAGE_KEY]: false }, (items) => {
    const enabled = items[STORAGE_KEY] === true;
    toggle.checked = enabled;
    setStatus(enabled);
  });

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.sync.set({ [STORAGE_KEY]: enabled }, () => {
      setStatus(enabled);
    });
  });
})();
