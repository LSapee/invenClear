(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});
  const STORAGE_KEYS = {
    enabled: 'hideNoBadgeEnabled',
    posts: 'hideNoBadgePosts',
    comments: 'hideNoBadgeComments',
  };
  const ALLOWED_BOARDS = new Set(['maple', 'lostark', 'aion2']);
  const COMMENT_ITEM_SELECTOR = 'li[id^="cmt"]';

  let masterEnabled = false;
  let postFilterEnabled = false;
  let commentFilterEnabled = false;
  let observer = null;
  let queued = false;

  function getBoardSlug() {
    const match = location.pathname.match(/^\/board\/([^/]+)(?:\/|$)/);
    return match ? match[1] : null;
  }

  function isSupportedBoard() {
    const boardSlug = getBoardSlug();
    return !!(boardSlug && ALLOWED_BOARDS.has(boardSlug));
  }

  function getListTable() {
    return invenClear.table && typeof invenClear.table.findListTable === 'function'
      ? invenClear.table.findListTable()
      : null;
  }

  function hasMapleBadge(row) {
    const userCell = row.querySelector('td.user');
    return !!(userCell && userCell.querySelector('img.maple'));
  }

  function applyPostFilter() {
    const table = getListTable();
    if (!table) return;

    table.querySelectorAll('tbody tr').forEach((row) => {
      if (row.classList.contains('notice')) {
        row.classList.remove('ic-badge-hidden');
        return;
      }

      row.classList.toggle(
        'ic-badge-hidden',
        masterEnabled && postFilterEnabled && !hasMapleBadge(row)
      );
    });
  }

  function hasCommentBadge(item) {
    return !!item.querySelector('.nickname img.confirmIcon, .nickname img.maple, img.confirmIcon');
  }

  function applyCommentFilter() {
    document.querySelectorAll(COMMENT_ITEM_SELECTOR).forEach((item) => {
      item.classList.toggle(
        'ic-badge-hidden',
        masterEnabled && commentFilterEnabled && !hasCommentBadge(item)
      );
    });
  }

  function applyBadgeFilter(settings = {}) {
    if (typeof settings.enabled === 'boolean') masterEnabled = settings.enabled;
    if (typeof settings.posts === 'boolean') postFilterEnabled = settings.posts;
    if (typeof settings.comments === 'boolean') commentFilterEnabled = settings.comments;

    if (!isSupportedBoard()) return;

    applyPostFilter();
    applyCommentFilter();
  }

  function queueApply() {
    if (queued) return;
    queued = true;

    requestAnimationFrame(() => {
      queued = false;
      applyBadgeFilter();
    });
  }

  function ensureObserver() {
    if (observer || !document.body) return;

    observer = new MutationObserver(() => {
      if (!masterEnabled || (!postFilterEnabled && !commentFilterEnabled)) return;
      queueApply();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function initBadgeFilter() {
    if (!isSupportedBoard()) return;
    if (!global.chrome || !chrome.storage || !chrome.storage.sync) return;

    chrome.storage.sync.get(
      {
        [STORAGE_KEYS.enabled]: false,
        [STORAGE_KEYS.posts]: true,
        [STORAGE_KEYS.comments]: true,
      },
      (items) => {
        applyBadgeFilter({
          enabled: items[STORAGE_KEYS.enabled] === true,
          posts: items[STORAGE_KEYS.posts] === true,
          comments: items[STORAGE_KEYS.comments] === true,
        });
      }
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;

      const nextSettings = {};
      let hasRelevantChange = false;

      if (changes[STORAGE_KEYS.enabled]) {
        nextSettings.enabled = changes[STORAGE_KEYS.enabled].newValue === true;
        hasRelevantChange = true;
      }

      if (changes[STORAGE_KEYS.posts]) {
        nextSettings.posts = changes[STORAGE_KEYS.posts].newValue === true;
        hasRelevantChange = true;
      }

      if (changes[STORAGE_KEYS.comments]) {
        nextSettings.comments = changes[STORAGE_KEYS.comments].newValue === true;
        hasRelevantChange = true;
      }

      if (!hasRelevantChange) return;
      applyBadgeFilter(nextSettings);
    });

    ensureObserver();
  }

  invenClear.features = invenClear.features || {};
  invenClear.features.badgeFilter = {
    initBadgeFilter,
  };
})(globalThis);
