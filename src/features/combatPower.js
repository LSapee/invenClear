(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});
  const config = invenClear.config || {};
  const STORAGE_KEYS = config.storageKeys || {};
  const ALLOWED_BOARDS = new Set(config.allowedCombatPowerBoards || []);
  const COMMENT_ITEM_SELECTOR = 'li[id^="cmt"]';
  const COMBAT_POWER_CLASS = 'ic-combat-power';
  const FETCH_CONCURRENCY = 3;
  const INVENTORY_TIMEOUT_MS = 12000;

  let enabled = false;
  let observer = null;
  let queued = false;
  let activeFetches = 0;
  const powerCache = new Map();
  const fetchQueue = [];

  function getBoardSlug() {
    const match = location.pathname.match(/^\/board\/([^/]+)(?:\/|$)/);
    return match ? match[1] : null;
  }

  function isSupportedBoard() {
    const boardSlug = getBoardSlug();
    return !!(boardSlug && ALLOWED_BOARDS.has(boardSlug));
  }

  function getNicknameElement(item) {
    return item.querySelector('.nickname');
  }

  function getInventoryNickFromLink(nicknameElement) {
    const link = nicknameElement.querySelector('a[href*="view_inventory.php"]');
    if (!link) return '';

    try {
      const url = new URL(link.getAttribute('href') || '', location.href);
      return (url.searchParams.get('nick') || '').trim();
    } catch {
      return '';
    }
  }

  function getCommentNickname(item) {
    const nicknameElement = getNicknameElement(item);
    if (!nicknameElement) return '';

    const linkNick = getInventoryNickFromLink(nicknameElement);
    if (linkNick) return linkNick;

    const textNode = Array.from(nicknameElement.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
    return textNode ? textNode.textContent.trim() : nicknameElement.textContent.trim();
  }

  function getCommentBadge(item) {
    return item.querySelector('.nickname img.confirmIcon, .nickname img.maple, img.confirmIcon');
  }

  function removeCombatPower(item) {
    item.querySelectorAll(`.${COMBAT_POWER_CLASS}`).forEach((element) => element.remove());
    delete item.dataset.icCombatPowerNick;
    delete item.dataset.icCombatPowerLoading;
  }

  function normalizePowerLabel(value) {
    const text = (value || '').replace(/\s+/g, '').trim();
    if (!text || text === '-') return null;

    if (text.endsWith('-')) return `-${text.slice(0, -1)}`;

    const withoutTrailingPlus = text.endsWith('+') ? text.slice(0, -1) : text;
    if (!withoutTrailingPlus) return null;
    if (withoutTrailingPlus.startsWith('-') || withoutTrailingPlus.startsWith('+')) {
      return withoutTrailingPlus;
    }
    return `+${withoutTrailingPlus}`;
  }

  function parseCombatPowerFromRoot(root) {
    const powerElement = root.querySelector('.info-power .power');
    return powerElement ? normalizePowerLabel(powerElement.textContent) : null;
  }

  function clickGameProfileTab(doc, win) {
    const button =
      doc.querySelector('button[data-id="game_profile"]') ||
      Array.from(doc.querySelectorAll('button')).find((candidate) =>
        (candidate.textContent || '').includes('메이플 프로필')
      );
    if (!button || button.classList.contains('active')) return;

    const clickElement = invenClear.util && invenClear.util.clickElement;
    if (typeof clickElement === 'function') {
      clickElement(button, win);
      return;
    }

    button.click();
  }

  function loadCombatPowerFromInventory(url) {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText =
        'position:absolute;left:-9999px;top:0;width:900px;height:700px;border:0;visibility:hidden';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.src = url;

      let settled = false;
      let poll = null;

      const cleanup = () => {
        if (poll) clearInterval(poll);
        if (iframe.parentNode) iframe.remove();
      };

      const finish = (label) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup();
        resolve(label);
      };

      const timeout = setTimeout(() => {
        finish(null);
      }, INVENTORY_TIMEOUT_MS);

      iframe.addEventListener('load', () => {
        let clickedProfileTab = false;

        poll = setInterval(() => {
          let doc;
          try {
            doc = iframe.contentDocument;
          } catch {
            finish(null);
            return;
          }

          if (!doc) return;

          const label = parseCombatPowerFromRoot(doc);
          if (label) {
            finish(label);
            return;
          }

          if (!clickedProfileTab) {
            clickGameProfileTab(doc, iframe.contentWindow);
            clickedProfileTab = true;
          }
        }, 250);
      });

      document.body.appendChild(iframe);
    });
  }

  function runNextFetch() {
    if (activeFetches >= FETCH_CONCURRENCY || fetchQueue.length === 0) return;

    const next = fetchQueue.shift();
    activeFetches++;
    next()
      .catch(() => {})
      .finally(() => {
        activeFetches--;
        runNextFetch();
      });
  }

  function enqueueFetch(task) {
    return new Promise((resolve) => {
      fetchQueue.push(() => task().then(resolve, () => resolve(null)));
      runNextFetch();
    });
  }

  function fetchCombatPower(nickname) {
    if (powerCache.has(nickname)) return powerCache.get(nickname);

    const url = `/member/inventory/view_inventory.php?nick=${encodeURIComponent(nickname)}&site=maple`;
    const promise = enqueueFetch(() =>
      loadCombatPowerFromInventory(url)
        .catch((error) => {
          console.error('[InvenClear] 전투력 조회 실패', nickname, error);
          return null;
        })
    );

    powerCache.set(nickname, promise);
    return promise;
  }

  function renderCombatPower(item, label) {
    if (!label) return;

    const nicknameElement = getNicknameElement(item);
    const badge = getCommentBadge(item);
    const target = badge && nicknameElement && nicknameElement.contains(badge)
      ? badge
      : nicknameElement;
    if (!target) return;

    let powerElement = item.querySelector(`.${COMBAT_POWER_CLASS}`);
    if (!powerElement) {
      powerElement = document.createElement('span');
      powerElement.className = COMBAT_POWER_CLASS;
    }

    powerElement.textContent = `전투력 : ${label}`;

    if (target === nicknameElement) {
      nicknameElement.appendChild(powerElement);
      return;
    }

    target.insertAdjacentElement('afterend', powerElement);
  }

  async function applyCombatPowerToComment(item) {
    if (!enabled) {
      removeCombatPower(item);
      return;
    }

    if (!getCommentBadge(item)) {
      removeCombatPower(item);
      return;
    }

    const nickname = getCommentNickname(item);
    if (!nickname) {
      removeCombatPower(item);
      return;
    }

    if (
      item.dataset.icCombatPowerNick === nickname ||
      item.dataset.icCombatPowerLoading === 'true'
    ) {
      return;
    }

    item.dataset.icCombatPowerLoading = 'true';
    const label = await fetchCombatPower(nickname);
    delete item.dataset.icCombatPowerLoading;

    if (!enabled || !getCommentBadge(item)) {
      removeCombatPower(item);
      return;
    }

    if (!label) return;

    item.dataset.icCombatPowerNick = nickname;
    renderCombatPower(item, label);
  }

  function applyCombatPower() {
    if (!isSupportedBoard()) return;

    document.querySelectorAll(COMMENT_ITEM_SELECTOR).forEach((item) => {
      applyCombatPowerToComment(item);
    });
  }

  function clearCombatPower() {
    document.querySelectorAll(COMMENT_ITEM_SELECTOR).forEach(removeCombatPower);
  }

  function queueApply() {
    if (queued) return;
    queued = true;

    requestAnimationFrame(() => {
      queued = false;
      applyCombatPower();
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

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    if (enabled) {
      applyCombatPower();
      ensureObserver();
      return;
    }

    clearCombatPower();
  }

  function initCombatPower() {
    if (!isSupportedBoard()) return;
    if (!global.chrome || !chrome.storage || !chrome.storage.sync) return;

    chrome.storage.sync.get(
      {
        [STORAGE_KEYS.showCombatPower]: false,
      },
      (items) => {
        setEnabled(items[STORAGE_KEYS.showCombatPower] === true);
      }
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      if (!changes[STORAGE_KEYS.showCombatPower]) return;

      setEnabled(changes[STORAGE_KEYS.showCombatPower].newValue === true);
    });
  }

  invenClear.features = invenClear.features || {};
  invenClear.features.combatPower = {
    initCombatPower,
  };
})(globalThis);
