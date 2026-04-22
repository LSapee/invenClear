(function () {
  'use strict';

  const STORAGE_KEYS = globalThis.InvenClear.config.storageKeys;

  const masterToggle = document.getElementById('hideNoBadgeEnabled');
  const postToggle = document.getElementById('hideNoBadgePosts');
  const commentToggle = document.getElementById('hideNoBadgeComments');
  const excludeRecommendedToggle = document.getElementById('excludeRecommendedNoBadgePosts');
  const statusText = document.getElementById('statusText');
  const diceFinderToggle = document.getElementById('diceFinderEnabled');
  const dicePanel = document.getElementById('dicePanel');
  const diceDeadlineToggle = document.getElementById('diceDeadlineEnabled');
  const diceTimeRow = document.getElementById('diceTimeRow');
  const diceHourSelect = document.getElementById('diceHourSelect');
  const diceMinuteSelect = document.getElementById('diceMinuteSelect');
  const diceModeGrid = document.getElementById('diceModeGrid');
  const diceWorkspace = document.getElementById('diceWorkspace');
  const diceBackButton = document.getElementById('diceBackButton');
  const diceNumberInputRow = document.getElementById('diceNumberInputRow');
  const diceRankInputRow = document.getElementById('diceRankInputRow');
  const diceNumberInput = document.getElementById('diceNumberInput');
  const diceRankInput = document.getElementById('diceRankInput');
  const diceConfirmButton = document.getElementById('diceConfirmButton');
  const diceResult = document.getElementById('diceResult');
  let selectedDiceMode = null;
  let lastDiceTabId = null;

  function syncSubToggleState(masterEnabled) {
    postToggle.disabled = !masterEnabled;
    commentToggle.disabled = !masterEnabled;
    excludeRecommendedToggle.disabled = !masterEnabled;
  }

  function setStatus(masterEnabled, postsEnabled, commentsEnabled, excludeRecommendedEnabled) {
    syncSubToggleState(masterEnabled);

    if (!masterEnabled) {
      statusText.textContent = 'No인장 가리기가 꺼져 있습니다.';
      return;
    }

    if (postsEnabled && commentsEnabled) {
      statusText.textContent = excludeRecommendedEnabled
        ? '인증 아이콘 없는 게시글과 댓글을 숨기고, 10추글은 표시합니다.'
        : '인증 아이콘 없는 게시글과 댓글을 숨기고 있습니다.';
      return;
    }

    if (postsEnabled) {
      statusText.textContent = excludeRecommendedEnabled
        ? '인증 아이콘 없는 게시글만 숨기고, 10추글은 표시합니다.'
        : '인증 아이콘 없는 게시글만 숨기고 있습니다.';
      return;
    }

    if (commentsEnabled) {
      statusText.textContent = '인증 아이콘 없는 댓글만 숨기고 있습니다.';
      return;
    }

    statusText.textContent = '인증 아이콘 없는 항목도 그대로 보여줍니다.';
  }

  function persistSettings() {
    const masterEnabled = masterToggle.checked;
    const postsEnabled = postToggle.checked;
    const commentsEnabled = commentToggle.checked;
    const excludeRecommendedEnabled = excludeRecommendedToggle.checked;

    chrome.storage.sync.set(
      {
        [STORAGE_KEYS.hideNoBadgeEnabled]: masterEnabled,
        [STORAGE_KEYS.hideNoBadgePosts]: postsEnabled,
        [STORAGE_KEYS.hideNoBadgeComments]: commentsEnabled,
        [STORAGE_KEYS.excludeRecommendedNoBadgePosts]: excludeRecommendedEnabled,
      },
      () => {
        setStatus(masterEnabled, postsEnabled, commentsEnabled, excludeRecommendedEnabled);
      }
    );
  }

  function fillSelect(select, max, step = 1) {
    for (let value = 0; value <= max; value += step) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = String(value).padStart(2, '0');
      select.appendChild(option);
    }
  }

  function initDiceTimeSelects() {
    fillSelect(diceHourSelect, 23);
    fillSelect(diceMinuteSelect, 59);

    const now = new Date();
    diceHourSelect.value = String(now.getHours());
    diceMinuteSelect.value = String(now.getMinutes());
  }

  function resetDiceMode() {
    selectedDiceMode = null;
    diceModeGrid.hidden = false;
    diceWorkspace.hidden = true;
    diceNumberInputRow.hidden = true;
    diceRankInputRow.hidden = true;
    diceResult.textContent = '';
  }

  function selectDiceMode(mode) {
    selectedDiceMode = mode;
    diceModeGrid.hidden = true;
    diceWorkspace.hidden = false;
    diceNumberInputRow.hidden = mode !== 'number';
    diceRankInputRow.hidden = mode !== 'nthMax';
    diceResult.textContent = '';

    if (mode === 'number') diceNumberInput.focus();
    if (mode === 'nthMax') diceRankInput.focus();
  }

  function getDiceDeadline() {
    if (!diceDeadlineToggle.checked) return null;

    const hour = Number(diceHourSelect.value);
    const minute = Number(diceMinuteSelect.value);
    return { minutes: hour * 60 + minute };
  }

  function getDiceValue() {
    if (selectedDiceMode === 'number') return Number(diceNumberInput.value);
    if (selectedDiceMode === 'nthMax') return Number(diceRankInput.value);
    return null;
  }

  function validateDiceInput() {
    if (selectedDiceMode === 'number') {
      const value = Number(diceNumberInput.value);
      return Number.isInteger(value) && value >= 1 && value <= 100;
    }

    if (selectedDiceMode === 'nthMax') {
      const value = Number(diceRankInput.value);
      return Number.isInteger(value) && value >= 1;
    }

    return !!selectedDiceMode;
  }

  function renderDiceResult(response) {
    diceResult.textContent = '';

    if (!response) {
      diceResult.textContent = '결과를 가져오지 못했습니다.';
      return;
    }

    const items = (response.matches || []).slice(0, 10);

    const title = document.createElement('div');
    title.className = 'dice-result-title';
    title.textContent = response.message;
    diceResult.appendChild(title);

    const total = document.createElement('div');
    total.textContent = `검색 대상 주사위 댓글: ${response.total || 0}개`;
    diceResult.appendChild(total);

    if (items.length === 0) return;

    const list = document.createElement('ol');
    list.className = 'dice-result-list';

    items.forEach((item) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dice-result-link';
      button.dataset.commentId = item.id;
      const name = item.nickname ? `${item.nickname} ` : '';
      const date = item.date ? `(${item.date}) ` : '';
      button.textContent = `${item.number} - ${name}${date}#${item.id}`;
      li.appendChild(button);
      list.appendChild(li);
    });

    diceResult.appendChild(list);
  }

  function runDiceFinder() {
    if (!validateDiceInput()) {
      diceResult.textContent = '입력값을 확인해 주세요.';
      return;
    }

    diceConfirmButton.disabled = true;
    diceResult.textContent = '현재 글에서 주사위 댓글을 찾는 중입니다.';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) {
        diceConfirmButton.disabled = false;
        diceResult.textContent = '현재 탭을 찾지 못했습니다.';
        return;
      }
      lastDiceTabId = tab.id;

      chrome.tabs.sendMessage(
        tab.id,
        {
          type: 'INVEN_CLEAR_FIND_DICE',
          mode: selectedDiceMode,
          value: getDiceValue(),
          deadline: getDiceDeadline(),
          excludeHidden: masterToggle.checked && commentToggle.checked,
        },
        (response) => {
          diceConfirmButton.disabled = false;

          if (chrome.runtime.lastError) {
            diceResult.textContent = '인벤 글 페이지에서만 사용할 수 있습니다.';
            return;
          }

          renderDiceResult(response);
        }
      );
    });
  }

  function scrollToDiceResult(commentId) {
    if (!lastDiceTabId || !commentId) return;

    chrome.tabs.sendMessage(
      lastDiceTabId,
      {
        type: 'INVEN_CLEAR_SCROLL_TO_DICE',
        commentId,
      },
      () => {}
    );
  }

  chrome.storage.sync.get(
    {
      [STORAGE_KEYS.hideNoBadgeEnabled]: false,
      [STORAGE_KEYS.hideNoBadgePosts]: true,
      [STORAGE_KEYS.hideNoBadgeComments]: true,
      [STORAGE_KEYS.excludeRecommendedNoBadgePosts]: false,
    },
    (items) => {
      const masterEnabled = items[STORAGE_KEYS.hideNoBadgeEnabled] === true;
      const postsEnabled = items[STORAGE_KEYS.hideNoBadgePosts] === true;
      const commentsEnabled = items[STORAGE_KEYS.hideNoBadgeComments] === true;
      const excludeRecommendedEnabled = items[STORAGE_KEYS.excludeRecommendedNoBadgePosts] === true;

      masterToggle.checked = masterEnabled;
      postToggle.checked = postsEnabled;
      commentToggle.checked = commentsEnabled;
      excludeRecommendedToggle.checked = excludeRecommendedEnabled;
      setStatus(masterEnabled, postsEnabled, commentsEnabled, excludeRecommendedEnabled);
    }
  );

  masterToggle.addEventListener('change', () => {
    if (masterToggle.checked) {
      if (!postToggle.checked && !commentToggle.checked) {
        postToggle.checked = true;
        commentToggle.checked = true;
      }
    }
    persistSettings();
  });

  postToggle.addEventListener('change', persistSettings);
  commentToggle.addEventListener('change', persistSettings);
  excludeRecommendedToggle.addEventListener('change', persistSettings);
  initDiceTimeSelects();
  diceFinderToggle.addEventListener('change', () => {
    dicePanel.hidden = !diceFinderToggle.checked;
    if (!diceFinderToggle.checked) resetDiceMode();
  });
  diceDeadlineToggle.addEventListener('change', () => {
    diceTimeRow.hidden = !diceDeadlineToggle.checked;
  });
  diceModeGrid.addEventListener('click', (event) => {
    const button = event.target.closest('.dice-mode-button');
    if (!button) return;
    selectDiceMode(button.dataset.mode);
  });
  diceBackButton.addEventListener('click', resetDiceMode);
  diceConfirmButton.addEventListener('click', runDiceFinder);
  diceResult.addEventListener('click', (event) => {
    const button = event.target.closest('.dice-result-link');
    if (!button) return;
    scrollToDiceResult(button.dataset.commentId);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    let masterEnabled = masterToggle.checked;
    let postsEnabled = postToggle.checked;
    let commentsEnabled = commentToggle.checked;
    let excludeRecommendedEnabled = excludeRecommendedToggle.checked;
    let changed = false;

    if (changes[STORAGE_KEYS.hideNoBadgeEnabled]) {
      masterEnabled = changes[STORAGE_KEYS.hideNoBadgeEnabled].newValue === true;
      masterToggle.checked = masterEnabled;
      changed = true;
    }

    if (changes[STORAGE_KEYS.hideNoBadgePosts]) {
      postsEnabled = changes[STORAGE_KEYS.hideNoBadgePosts].newValue === true;
      postToggle.checked = postsEnabled;
      changed = true;
    }

    if (changes[STORAGE_KEYS.hideNoBadgeComments]) {
      commentsEnabled = changes[STORAGE_KEYS.hideNoBadgeComments].newValue === true;
      commentToggle.checked = commentsEnabled;
      changed = true;
    }

    if (changes[STORAGE_KEYS.excludeRecommendedNoBadgePosts]) {
      excludeRecommendedEnabled =
        changes[STORAGE_KEYS.excludeRecommendedNoBadgePosts].newValue === true;
      excludeRecommendedToggle.checked = excludeRecommendedEnabled;
      changed = true;
    }

    if (changed) {
      setStatus(masterEnabled, postsEnabled, commentsEnabled, excludeRecommendedEnabled);
    }
  });
})();
