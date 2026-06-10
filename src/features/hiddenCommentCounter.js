(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});
  const config = invenClear.config || {};
  const STORAGE_KEYS = config.storageKeys || {};
  const COMMENT_ITEM_SELECTOR = 'li[id^="cmt"]';
  const COUNTER_CLASS = 'ic-hidden-comment-counter';
  const NO_BADGE_HIDDEN_CLASS = 'ic-badge-hidden';
  const COMBAT_POWER_HIDDEN_CLASS = 'ic-combat-power-filter-hidden';

  let noBadgeCounterEnabled = false;
  let combatPowerCounterEnabled = false;
  let observer = null;
  let queued = false;

  function isArticlePage() {
    return /^\/board\/[^/]+\/\d+\/\d+/.test(location.pathname);
  }

  function getCounterHost() {
    return (
      document.querySelector('.cmtMainTail') ||
      document.querySelector('#cmt .cmtMainTail') ||
      document.querySelector('#powerbbsCmt2 .cmtMainTail')
    );
  }

  function getOrCreateCounter() {
    const host = getCounterHost();
    if (!host) return null;

    const existing = host.querySelector(`.${COUNTER_CLASS}`);
    if (existing) return existing;

    const counter = document.createElement('div');
    counter.className = COUNTER_CLASS;

    const title = document.createElement('div');
    title.className = 'ic-hidden-comment-counter-title';
    title.appendChild(document.createTextNode('가려진 댓글 갯수 : '));
    const total = document.createElement('strong');
    total.textContent = '0';
    title.appendChild(total);

    const detail = document.createElement('div');
    detail.className = 'ic-hidden-comment-counter-detail';

    const noBadgeRow = document.createElement('span');
    noBadgeRow.dataset.rowType = 'noBadge';
    noBadgeRow.appendChild(document.createTextNode('No인장 '));
    const noBadgeCount = document.createElement('strong');
    noBadgeCount.dataset.type = 'noBadge';
    noBadgeCount.textContent = '0';
    noBadgeRow.appendChild(noBadgeCount);
    noBadgeRow.appendChild(document.createTextNode('개'));

    const combatPowerRow = document.createElement('span');
    combatPowerRow.dataset.rowType = 'combatPower';
    combatPowerRow.appendChild(document.createTextNode('전투력 미만 '));
    const combatPowerCount = document.createElement('strong');
    combatPowerCount.dataset.type = 'combatPower';
    combatPowerCount.textContent = '0';
    combatPowerRow.appendChild(combatPowerCount);
    combatPowerRow.appendChild(document.createTextNode('개'));

    detail.appendChild(noBadgeRow);
    detail.appendChild(combatPowerRow);
    counter.appendChild(title);
    counter.appendChild(detail);
    host.insertBefore(counter, host.firstChild);
    return counter;
  }

  function getExistingCounter() {
    return document.querySelector(`.${COUNTER_CLASS}`);
  }

  function removeCounter() {
    const counter = getExistingCounter();
    if (counter) counter.remove();
  }

  function shouldShowCounter() {
    return noBadgeCounterEnabled || combatPowerCounterEnabled;
  }

  function getHiddenCounts() {
    const hiddenItems = new Set();
    let noBadge = 0;
    let combatPower = 0;

    document.querySelectorAll(COMMENT_ITEM_SELECTOR).forEach((item) => {
      if (item.classList.contains(NO_BADGE_HIDDEN_CLASS)) {
        noBadge++;
        hiddenItems.add(item);
      }

      if (item.classList.contains(COMBAT_POWER_HIDDEN_CLASS)) {
        combatPower++;
        hiddenItems.add(item);
      }
    });

    return {
      total: hiddenItems.size,
      noBadge,
      combatPower,
    };
  }

  function renderCounter() {
    if (!shouldShowCounter()) {
      removeCounter();
      return;
    }

    const counter = getOrCreateCounter();
    if (!counter) return;

    const counts = getHiddenCounts();
    counter.querySelector('.ic-hidden-comment-counter-title strong').textContent = String(
      counts.total
    );
    counter.querySelector('[data-type="noBadge"]').textContent = String(counts.noBadge);
    counter.querySelector('[data-type="combatPower"]').textContent = String(counts.combatPower);

    const noBadgeRow = counter.querySelector('[data-row-type="noBadge"]');
    const combatPowerRow = counter.querySelector('[data-row-type="combatPower"]');
    if (noBadgeRow) noBadgeRow.hidden = !noBadgeCounterEnabled;
    if (combatPowerRow) combatPowerRow.hidden = !combatPowerCounterEnabled;
  }

  function queueRender() {
    if (queued) return;
    queued = true;

    requestAnimationFrame(() => {
      queued = false;
      renderCounter();
    });
  }

  function applySettings(settings = {}) {
    if (typeof settings.noBadgeCounterEnabled === 'boolean') {
      noBadgeCounterEnabled = settings.noBadgeCounterEnabled;
    }

    if (typeof settings.combatPowerCounterEnabled === 'boolean') {
      combatPowerCounterEnabled = settings.combatPowerCounterEnabled;
    }

    renderCounter();
  }

  function initHiddenCommentCounter() {
    if (!isArticlePage()) return;
    if (!global.chrome || !chrome.storage) return;
    const storageArea =
      config && typeof config.getStorageArea === 'function' ? config.getStorageArea() : null;
    const storageAreaName =
      config && typeof config.getStorageAreaName === 'function'
        ? config.getStorageAreaName()
        : 'sync';
    if (!storageArea) return;

    storageArea.get(
      {
        [STORAGE_KEYS.hideNoBadgeEnabled]: false,
        [STORAGE_KEYS.hideNoBadgeComments]: true,
        [STORAGE_KEYS.showCombatPower]: false,
        [STORAGE_KEYS.hideBelowCombatPowerEnabled]: false,
      },
      (items) => {
        applySettings({
          noBadgeCounterEnabled:
            items[STORAGE_KEYS.hideNoBadgeEnabled] === true &&
            items[STORAGE_KEYS.hideNoBadgeComments] === true,
          combatPowerCounterEnabled:
            items[STORAGE_KEYS.showCombatPower] === true &&
            items[STORAGE_KEYS.hideBelowCombatPowerEnabled] === true,
        });
      }
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== storageAreaName) return;

      const hasNoBadgeChange =
        changes[STORAGE_KEYS.hideNoBadgeEnabled] ||
        changes[STORAGE_KEYS.hideNoBadgeComments];
      const hasCombatPowerChange =
        changes[STORAGE_KEYS.showCombatPower] ||
        changes[STORAGE_KEYS.hideBelowCombatPowerEnabled];

      if (!hasNoBadgeChange && !hasCombatPowerChange) return;

      storageArea.get(
        {
          [STORAGE_KEYS.hideNoBadgeEnabled]: false,
          [STORAGE_KEYS.hideNoBadgeComments]: true,
          [STORAGE_KEYS.showCombatPower]: false,
          [STORAGE_KEYS.hideBelowCombatPowerEnabled]: false,
        },
        (items) => {
          applySettings({
            noBadgeCounterEnabled:
              items[STORAGE_KEYS.hideNoBadgeEnabled] === true &&
              items[STORAGE_KEYS.hideNoBadgeComments] === true,
            combatPowerCounterEnabled:
              items[STORAGE_KEYS.showCombatPower] === true &&
              items[STORAGE_KEYS.hideBelowCombatPowerEnabled] === true,
          });
        }
      );
    });

    if (observer || !document.body) return;
    observer = new MutationObserver(queueRender);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });
  }

  invenClear.features = invenClear.features || {};
  invenClear.features.hiddenCommentCounter = {
    initHiddenCommentCounter,
  };
})(globalThis);
