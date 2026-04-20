(function () {
  'use strict';

  const STORAGE_KEYS = {
    enabled: 'hideNoBadgeEnabled',
    posts: 'hideNoBadgePosts',
    comments: 'hideNoBadgeComments',
  };

  const masterToggle = document.getElementById('hideNoBadgeEnabled');
  const postToggle = document.getElementById('hideNoBadgePosts');
  const commentToggle = document.getElementById('hideNoBadgeComments');
  const statusText = document.getElementById('statusText');

  function syncSubToggleState(masterEnabled) {
    postToggle.disabled = !masterEnabled;
    commentToggle.disabled = !masterEnabled;
  }

  function setStatus(masterEnabled, postsEnabled, commentsEnabled) {
    syncSubToggleState(masterEnabled);

    if (!masterEnabled) {
      statusText.textContent = 'No인장 가리기가 꺼져 있습니다.';
      return;
    }

    if (postsEnabled && commentsEnabled) {
      statusText.textContent = '인증 아이콘 없는 게시글과 댓글을 숨기고 있습니다.';
      return;
    }

    if (postsEnabled) {
      statusText.textContent = '인증 아이콘 없는 게시글만 숨기고 있습니다.';
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

    chrome.storage.sync.set(
      {
        [STORAGE_KEYS.enabled]: masterEnabled,
        [STORAGE_KEYS.posts]: postsEnabled,
        [STORAGE_KEYS.comments]: commentsEnabled,
      },
      () => {
        setStatus(masterEnabled, postsEnabled, commentsEnabled);
      }
    );
  }

  chrome.storage.sync.get(
    {
      [STORAGE_KEYS.enabled]: false,
      [STORAGE_KEYS.posts]: true,
      [STORAGE_KEYS.comments]: true,
    },
    (items) => {
      const masterEnabled = items[STORAGE_KEYS.enabled] === true;
      const postsEnabled = items[STORAGE_KEYS.posts] === true;
      const commentsEnabled = items[STORAGE_KEYS.comments] === true;

      masterToggle.checked = masterEnabled;
      postToggle.checked = postsEnabled;
      commentToggle.checked = commentsEnabled;
      setStatus(masterEnabled, postsEnabled, commentsEnabled);
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

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    let masterEnabled = masterToggle.checked;
    let postsEnabled = postToggle.checked;
    let commentsEnabled = commentToggle.checked;
    let changed = false;

    if (changes[STORAGE_KEYS.enabled]) {
      masterEnabled = changes[STORAGE_KEYS.enabled].newValue === true;
      masterToggle.checked = masterEnabled;
      changed = true;
    }

    if (changes[STORAGE_KEYS.posts]) {
      postsEnabled = changes[STORAGE_KEYS.posts].newValue === true;
      postToggle.checked = postsEnabled;
      changed = true;
    }

    if (changes[STORAGE_KEYS.comments]) {
      commentsEnabled = changes[STORAGE_KEYS.comments].newValue === true;
      commentToggle.checked = commentsEnabled;
      changed = true;
    }

    if (changed) setStatus(masterEnabled, postsEnabled, commentsEnabled);
  });
})();
