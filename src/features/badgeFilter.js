(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});
  const STORAGE_KEY = 'hideMapleBadgeRows';
  const ALLOWED_BOARDS = new Set(['maple', 'lostark', 'aion2']);

  let enabled = false;
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

  function applyBadgeFilter(nextEnabled) {
    enabled = nextEnabled === true;

    if (!isSupportedBoard()) return;

    const table = getListTable();
    if (!table) return;

    table.querySelectorAll('tbody tr').forEach((row) => {
      if (row.classList.contains('notice')) {
        row.classList.remove('ic-badge-hidden');
        return;
      }

      row.classList.toggle('ic-badge-hidden', enabled && !hasMapleBadge(row));
    });
  }

  function queueApply() {
    if (queued) return;
    queued = true;

    requestAnimationFrame(() => {
      queued = false;
      applyBadgeFilter(enabled);
    });
  }

  function ensureObserver() {
    if (observer || !document.body) return;

    observer = new MutationObserver(() => {
      if (!enabled) return;
      queueApply();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function initBadgeFilter() {
    if (!isSupportedBoard()) return;
    if (!global.chrome || !chrome.storage || !chrome.storage.sync) return;

    chrome.storage.sync.get({ [STORAGE_KEY]: false }, (items) => {
      applyBadgeFilter(items[STORAGE_KEY] === true);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync' || !changes[STORAGE_KEY]) return;
      applyBadgeFilter(changes[STORAGE_KEY].newValue === true);
    });

    ensureObserver();
  }

  invenClear.features = invenClear.features || {};
  invenClear.features.badgeFilter = {
    initBadgeFilter,
  };
})(globalThis);
