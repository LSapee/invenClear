(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});
  const config = invenClear.config || {};
  const STORAGE_KEYS = config.storageKeys || {};
  const ALLOWED_BOARDS = new Set(config.allowedCombatPowerBoards || []);
  const COMMENT_ITEM_SELECTOR = 'li[id^="cmt"]';
  const COMBAT_POWER_CLASS = 'ic-combat-power';
  const COMBAT_POWER_TOOLTIP_CLASS = 'ic-combat-power-floating-tooltip';
  const ACHIEVEMENT_CLASS = 'ic-combat-achievement';
  const BADGE_HIDDEN_CLASS = 'ic-badge-hidden';
  const COMBAT_POWER_FILTER_HIDDEN_CLASS = 'ic-combat-power-filter-hidden';
  const ACHIEVEMENT_ICON_URL =
    'https://static.inven.co.kr/image_2011/maple/inventory/achievement_icon.png';
  const GAME_PROFILE_ENDPOINT = 'https://www.inven.co.kr/common/gameprofile/index.php';
  const FETCH_CONCURRENCY = 3;
  const INVENTORY_TIMEOUT_MS = 12000;
  const DEFAULT_HIDE_BELOW_THRESHOLD = 50000000;
  const INVENTORY_MESSAGE_SOURCE = 'InvenClearCombatPowerInventory';

  let enabled = false;
  let hideBelowEnabled = false;
  let hideBelowThreshold = DEFAULT_HIDE_BELOW_THRESHOLD;
  let observer = null;
  let queued = false;
  let tooltipElement = null;
  let tooltipListenersReady = false;
  let activeFetches = 0;
  const powerCache = new Map();
  const mobileMemIdCache = new Map();
  const fetchQueue = [];

  function getBoardSlug() {
    const match = location.pathname.match(/^\/board\/([^/]+)(?:\/|$)/);
    return match ? match[1] : null;
  }

  function isSupportedBoard() {
    const boardSlug = getBoardSlug();
    if (boardSlug && ALLOWED_BOARDS.has(boardSlug)) return true;
    if (location.hostname === 'maple.inven.co.kr') return true;
    return document.title.includes('메이플스토리 인벤');
  }

  function isMobileInven() {
    return location.hostname === 'm.inven.co.kr';
  }

  function getNicknameElement(item) {
    return item.querySelector('.nickname');
  }

  function getMobilePostRows() {
    if (!isMobileInven()) return [];

    return Array.from(document.querySelectorAll('li.list')).filter((row) => {
      const link = row.querySelector('a.contentLink[href*="/board/"]');
      return !!(link && row.querySelector('.user_info .nick'));
    });
  }

  function getMobilePostNicknameElement(row) {
    return row.querySelector('.user_info .nick');
  }

  function getMobilePostNicknameContainer(row) {
    return row.querySelector('.user_info .nick .layerNickName') || getMobilePostNicknameElement(row);
  }

  function getMobilePostBadge(row) {
    return row.querySelector('.user_info .nick img.maple');
  }

  function getMobilePostNickname(row) {
    const nicknameElement = getMobilePostNicknameElement(row);
    if (!nicknameElement) return '';

    const onclick = nicknameElement.getAttribute('onclick') || '';
    const onclickMatch = onclick.match(/layerNickName\('([^']+)'/);
    if (onclickMatch) return onclickMatch[1].trim();

    const container = getMobilePostNicknameContainer(row);
    const textNode = Array.from(container.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
    return textNode ? textNode.textContent.trim() : container.textContent.trim();
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
    item
      .querySelectorAll(`.${COMBAT_POWER_CLASS}, .${ACHIEVEMENT_CLASS}`)
      .forEach((element) => element.remove());
    setCombatPowerHidden(item, false);
    delete item.dataset.icCombatPowerNick;
    delete item.dataset.icCombatPowerLoading;
    delete item.dataset.icCombatPowerValue;
  }

  function normalizePowerLabel(value) {
    const text = (value || '').replace(/\s+/g, '').trim();
    if (!text || text === '-') return null;

    if (text.endsWith('-') || text.endsWith('+')) {
      const amount = text.slice(0, -1);
      return amount ? `${text.slice(-1)}${amount}` : null;
    }

    return text;
  }

  function getPowerValue(label) {
    if (!label) return 0;

    const isNegative = label.trim().startsWith('-');
    const normalized = label.replace(/^[+-]/, '');
    const billionMatch = normalized.match(/(\d+(?:\.\d+)?)억/);
    const tenMillionMatch = normalized.match(/(\d+(?:\.\d+)?)천만/);
    const manMatch = normalized.match(/(\d+(?:\.\d+)?)만/);

    const billion = billionMatch ? Number(billionMatch[1]) * 100000000 : 0;
    const tenMillion = tenMillionMatch ? Number(tenMillionMatch[1]) * 10000000 : 0;
    const man = manMatch && !tenMillionMatch ? Number(manMatch[1]) * 10000 : 0;

    if (billion || tenMillion || man) {
      const value = billion + tenMillion + man;
      return isNegative ? -value : value;
    }

    const numeric = Number(normalized.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(numeric)) return 0;
    return isNegative ? -numeric : numeric;
  }

  function getPowerTier(label) {
    const power = getPowerValue(label);

    if (power >= 500000000) return '5';
    if (power >= 400000000) return '4';
    if (power >= 300000000) return '3';
    if (power >= 200000000) return '2';
    if (power >= 100000000) return '1';
    return '0';
  }

  function parseCombatPowerFromRoot(root) {
    const powerElement = root.querySelector('.info-power .power');
    return powerElement
      ? normalizePowerLabel(powerElement.textContent)
      : parseCombatPowerFromText(root.body?.textContent || root.textContent || '');
  }

  function parseCombatPowerFromText(value) {
    const text = (value || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const match = text.match(
      /전투력\s*[:：]?\s*([+-]?\s*\d+(?:\.\d+)?\s*(?:억|천만|만)(?:\s*\d+(?:\.\d+)?\s*(?:천만|만))?\s*[+-]?|[+-]?\s*\d+\s*[+-]?)/
    );
    return match ? normalizePowerLabel(match[1]) : null;
  }

  function isInvalidInventoryAccess(root) {
    const text = (root.body?.textContent || root.textContent || '').replace(/\s+/g, ' ').trim();
    return text.includes('잘못된 접근입니다') || text.includes('잘못된 접근');
  }

  function parseUpdatedAtFromRoot(root) {
    const warningElement =
      root.querySelector('.char-info .warning') ||
      Array.from(root.querySelectorAll('.warning')).find((element) =>
        (element.textContent || '').includes('갱신일')
      );
    const warningText = (warningElement?.textContent || '').replace(/\s+/g, ' ').trim();
    const text =
      warningText || (root.body?.textContent || root.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const match = text.match(/(?:최근\s*)?갱신일\s*[:：]\s*([0-9]{2,4}[./-][0-9]{1,2}[./-][0-9]{1,2})/);
    if (match) return `최근 갱신일 : ${match[1].trim()}`;
    return warningText || null;
  }

  function normalizeAchievementText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function parseAchievementFromRoot(root) {
    const signatureBlocks = Array.from(root.querySelectorAll('.info-signature'));
    const achievementBlock = signatureBlocks.find((block) =>
      normalizeAchievementText(block.querySelector('.info-title')?.textContent).includes(
        '시그니쳐 업적'
      )
    );

    if (!achievementBlock) return null;

    const title =
      normalizeAchievementText(achievementBlock.querySelector('.signature-tooltip h5')?.textContent) ||
      normalizeAchievementText(achievementBlock.querySelector('.img-text p')?.textContent);
    const description = normalizeAchievementText(
      achievementBlock.querySelector('.signature-tooltip p')?.textContent
    );
    const iconElement = achievementBlock.querySelector('.img-text img, img.signature-icon');
    const icon = iconElement?.src || ACHIEVEMENT_ICON_URL;

    if (!title || title === '-') return null;

    return {
      title,
      description,
      icon,
    };
  }

  function applyCombatPowerFilter(item) {
    const rawValue = item.dataset.icCombatPowerValue;
    const value = Number(rawValue);
    const shouldHide =
      enabled &&
      hideBelowEnabled &&
      rawValue !== undefined &&
      Number.isFinite(value) &&
      value < hideBelowThreshold;

    setCombatPowerHidden(item, shouldHide);
  }

  function setCombatPowerHidden(item, hidden) {
    item.classList.toggle(COMBAT_POWER_FILTER_HIDDEN_CLASS, hidden);
    item.hidden =
      item.classList.contains(BADGE_HIDDEN_CLASS) ||
      item.classList.contains(COMBAT_POWER_FILTER_HIDDEN_CLASS);
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
      const requestId = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const inventoryUrl = new URL(url);
      inventoryUrl.searchParams.set('icCombatPowerRequestId', requestId);

      iframe.style.cssText =
        'position:absolute;left:-9999px;top:0;width:900px;height:700px;border:0;visibility:hidden';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms');
      iframe.src = inventoryUrl.toString();

      let settled = false;
      let poll = null;

      const cleanup = () => {
        if (poll) clearInterval(poll);
        window.removeEventListener('message', handleInventoryMessage);
        if (iframe.parentNode) iframe.remove();
      };

      const finish = (profile) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup();
        resolve(profile);
      };

      const timeout = setTimeout(() => {
        finish(null);
      }, INVENTORY_TIMEOUT_MS);

      function handleInventoryMessage(event) {
        const message = event.data;
        if (
          !message ||
          event.source !== iframe.contentWindow ||
          message.source !== INVENTORY_MESSAGE_SOURCE ||
          message.requestId !== requestId
        ) {
          return;
        }

        finish(message.profile || null);
      }

      window.addEventListener('message', handleInventoryMessage);

      iframe.addEventListener('load', () => {
        let clickedProfileTab = false;
        let powerFoundAt = 0;

        poll = setInterval(() => {
          let doc;
          try {
            doc = iframe.contentDocument;
          } catch {
            // Cross-origin mobile pages rely on the inventory frame helper postMessage path.
            return;
          }

          if (!doc) return;

          if (isInvalidInventoryAccess(doc)) {
            finish(null);
            return;
          }

          const profile = {
            label: parseCombatPowerFromRoot(doc),
            updatedAt: parseUpdatedAtFromRoot(doc),
            achievement: parseAchievementFromRoot(doc),
          };

          if (profile.label && !powerFoundAt) {
            powerFoundAt = Date.now();
          }

          if (profile.label && (profile.updatedAt || Date.now() - powerFoundAt >= 3000)) {
            finish(profile);
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

  function getMobileInventoryUrl(nickname) {
    return `https://www.inven.co.kr/member/inventory/view_inventory.php?nick=${encodeURIComponent(nickname)}&isMobile=true&site=maple`;
  }

  function parseMobileMemId(html) {
    const patterns = [
      /&quot;uniqueMemberCode&quot;\s*:\s*&quot;([^&]+)&quot;/i,
      /"uniqueMemberCode"\s*:\s*"([^"]+)"/i,
      /name=["']memid["'][^>]*value=["']([^"']+)["']/i,
      /["']memid["']\s*:\s*["']([^"']+)["']/i,
      /memid\s*[:=]\s*["']([^"']+)["']/i,
      /append\(\s*["']memid["']\s*,\s*["']([^"']+)["']\s*\)/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) return match[1].trim();
    }

    return null;
  }

  async function fetchMobileMemId(nickname) {
    if (mobileMemIdCache.has(nickname)) return mobileMemIdCache.get(nickname);

    const promise = fetch(getMobileInventoryUrl(nickname), {
      credentials: 'include',
    })
      .then((response) => (response.ok ? response.text() : ''))
      .then(parseMobileMemId)
      .catch(() => null);

    mobileMemIdCache.set(nickname, promise);
    return promise;
  }

  function findValueByKeys(value, keys, depth = 0) {
    if (!value || depth > 8) return null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findValueByKeys(item, keys, depth + 1);
        if (found !== null) return found;
      }
      return null;
    }

    if (typeof value !== 'object') return null;

    for (const [key, item] of Object.entries(value)) {
      if (keys.includes(key) && (typeof item === 'string' || typeof item === 'number')) {
        return String(item);
      }
    }

    for (const item of Object.values(value)) {
      const found = findValueByKeys(item, keys, depth + 1);
      if (found !== null) return found;
    }

    return null;
  }

  function parseProfileFromHtml(html) {
    if (!html) return null;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const profile = {
      label: parseCombatPowerFromRoot(doc),
      updatedAt: parseUpdatedAtFromRoot(doc),
      achievement: parseAchievementFromRoot(doc),
    };

    return profile.label ? profile : null;
  }

  function parseMobileProfileResponse(data) {
    if (!data) return null;

    if (typeof data === 'string') {
      try {
        return parseMobileProfileResponse(JSON.parse(data));
      } catch {
        return parseProfileFromHtml(data);
      }
    }

    const html = findValueByKeys(data, ['html', 'contents', 'content', 'view', 'profile']);
    const htmlProfile = html ? parseProfileFromHtml(html) : null;
    if (htmlProfile) return htmlProfile;

    const powerText =
      findValueByKeys(data, [
        'power',
        'combatPower',
        'combat_power',
        'combatpower',
        'statPower',
        'stat_power',
        'total_power',
        'totalPower',
      ]) || parseCombatPowerFromText(JSON.stringify(data));
    const label = normalizePowerLabel(powerText);

    if (!label) return null;

    return {
      label,
      updatedAt: formatUpdatedAt(
        findValueByKeys(data, ['updatedAt', 'updated_at', 'updateDate', 'update_date'])
      ),
      achievement: null,
    };
  }

  function formatUpdatedAt(value) {
    const text = (value || '').trim();
    return text ? `최근 갱신일 : ${text}` : null;
  }

  async function fetchCombatPowerViaMobileProfile(nickname) {
    const backgroundProfile = await fetchCombatPowerViaBackground(nickname);
    if (backgroundProfile) return backgroundProfile;

    const memid = await fetchMobileMemId(nickname);
    if (!memid) return null;

    const body = new FormData();
    body.append('mode', 'view');
    body.append('game', 'maple');
    body.append('memid', memid);
    body.append('memnick', nickname);

    const response = await fetch(GAME_PROFILE_ENDPOINT, {
      method: 'POST',
      body,
      credentials: 'include',
    });
    if (!response.ok) return null;

    const text = await response.text();
    try {
      return parseMobileProfileResponse(JSON.parse(text));
    } catch {
      return parseMobileProfileResponse(text);
    }
  }

  function fetchCombatPowerViaBackground(nickname) {
    return new Promise((resolve) => {
      if (!global.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve(null);
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: 'INVEN_CLEAR_FETCH_MOBILE_COMBAT_POWER',
          nickname,
        },
        (response) => {
          if (chrome.runtime.lastError || !response || response.ok !== true) {
            resolve(null);
            return;
          }

          resolve(response.profile || null);
        }
      );
    });
  }

  function fetchCombatPower(nickname) {
    if (powerCache.has(nickname)) return powerCache.get(nickname);

    const promise = enqueueFetch(() => {
      if (isMobileInven()) {
        return fetchCombatPowerViaMobileProfile(nickname).catch((error) => {
          console.error('[InvenClear] 모바일 전투력 조회 실패', nickname, error);
          return null;
        });
      }

      const url = `https://www.inven.co.kr/member/inventory/view_inventory.php?nick=${encodeURIComponent(nickname)}&site=maple`;
      return loadCombatPowerFromInventory(url).catch((error) => {
        console.error('[InvenClear] 전투력 조회 실패', nickname, error);
        return null;
      });
    });

    powerCache.set(nickname, promise);
    return promise;
  }

  function getCombatPowerTooltip() {
    if (tooltipElement) return tooltipElement;

    tooltipElement = document.createElement('span');
    tooltipElement.className = COMBAT_POWER_TOOLTIP_CLASS;
    document.body.appendChild(tooltipElement);
    return tooltipElement;
  }

  function showCombatPowerTooltip(target) {
    const updatedAt = target.dataset.updatedAt;
    if (!updatedAt) return;

    const tooltip = getCombatPowerTooltip();
    tooltip.textContent = updatedAt;
    tooltip.hidden = false;

    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - tooltipRect.width / 2, margin),
      window.innerWidth - tooltipRect.width - margin
    );
    const top = Math.max(rect.top - tooltipRect.height - 8, margin);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideCombatPowerTooltip() {
    if (tooltipElement) tooltipElement.hidden = true;
  }

  function getCombatPowerTarget(element) {
    return element && element.closest ? element.closest(`.${COMBAT_POWER_CLASS}`) : null;
  }

  function ensureTooltipListeners() {
    if (tooltipListenersReady) return;
    tooltipListenersReady = true;

    document.addEventListener('mouseover', (event) => {
      const target = getCombatPowerTarget(event.target);
      if (target) showCombatPowerTooltip(target);
    });
    document.addEventListener('mouseout', (event) => {
      const target = getCombatPowerTarget(event.target);
      if (target && !target.contains(event.relatedTarget)) hideCombatPowerTooltip();
    });
    document.addEventListener('focusin', (event) => {
      const target = getCombatPowerTarget(event.target);
      if (target) showCombatPowerTooltip(target);
    });
    document.addEventListener('focusout', (event) => {
      const target = getCombatPowerTarget(event.target);
      if (target) hideCombatPowerTooltip();
    });
    window.addEventListener('scroll', hideCombatPowerTooltip, true);
    window.addEventListener('resize', hideCombatPowerTooltip);
  }

  function renderAchievement(item, target, achievement) {
    item.querySelectorAll(`.${ACHIEVEMENT_CLASS}`).forEach((element) => element.remove());
    if (!achievement || !achievement.title) return;

    const wrapper = document.createElement('span');
    wrapper.className = ACHIEVEMENT_CLASS;
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'img');
    wrapper.setAttribute('aria-label', achievement.title);

    const icon = document.createElement('img');
    icon.className = `${ACHIEVEMENT_CLASS}-icon`;
    icon.src = achievement.icon || ACHIEVEMENT_ICON_URL;
    icon.alt = '업적';

    const tooltip = document.createElement('span');
    tooltip.className = `${ACHIEVEMENT_CLASS}-tooltip`;

    const title = document.createElement('strong');
    title.textContent = achievement.title;
    tooltip.appendChild(title);

    if (achievement.description) {
      const description = document.createElement('span');
      description.textContent = achievement.description;
      tooltip.appendChild(description);
    }

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);
    target.insertAdjacentElement('afterend', wrapper);
  }

  function getOrCreateCombatPowerElement(item) {
    let powerElement = item.querySelector(`.${COMBAT_POWER_CLASS}`);
    if (!powerElement) {
      powerElement = document.createElement('span');
      powerElement.className = COMBAT_POWER_CLASS;
    }
    return powerElement;
  }

  function renderCombatPowerLoadingAtTarget(item, target, options = {}) {
    const { appendToTarget = false } = options;
    if (!target) return;

    const powerElement = getOrCreateCombatPowerElement(item);
    powerElement.textContent = '전투력 : 조회중';
    powerElement.dataset.powerTier = '0';
    powerElement.removeAttribute('tabindex');
    delete powerElement.dataset.updatedAt;
    powerElement.removeAttribute('aria-label');
    delete item.dataset.icCombatPowerValue;

    if (appendToTarget) {
      target.appendChild(powerElement);
      return;
    }

    target.insertAdjacentElement('afterend', powerElement);
  }

  function renderCombatPowerAtTarget(item, target, profile, options = {}) {
    const { appendToTarget = false, showAchievement = true } = options;
    const label = normalizePowerLabel(profile && profile.label);
    if (!label) return;
    if (!target) return;

    const powerElement = getOrCreateCombatPowerElement(item);

    powerElement.textContent = `전투력 : ${label}`;
    if (profile.updatedAt) {
      powerElement.tabIndex = 0;
      powerElement.dataset.updatedAt = profile.updatedAt;
      powerElement.setAttribute('aria-label', `전투력 : ${label}, ${profile.updatedAt}`);
    } else {
      powerElement.removeAttribute('tabindex');
      delete powerElement.dataset.updatedAt;
      powerElement.removeAttribute('aria-label');
    }
    powerElement.dataset.powerTier = getPowerTier(label);
    item.dataset.icCombatPowerValue = String(getPowerValue(label));

    if (appendToTarget) {
      target.appendChild(powerElement);
      if (showAchievement) renderAchievement(item, powerElement, profile.achievement);
      applyCombatPowerFilter(item);
      return;
    }

    target.insertAdjacentElement('afterend', powerElement);
    if (showAchievement) renderAchievement(item, powerElement, profile.achievement);
    applyCombatPowerFilter(item);
  }

  function renderCombatPower(item, profile) {
    const nicknameElement = getNicknameElement(item);
    if (isMobileInven()) {
      renderCombatPowerAtTarget(item, nicknameElement, profile, {
        appendToTarget: false,
        showAchievement: false,
      });
      return;
    }

    const badge = getCommentBadge(item);
    const target = badge && nicknameElement && nicknameElement.contains(badge)
      ? badge
      : nicknameElement;
    renderCombatPowerAtTarget(item, target, profile, {
      appendToTarget: target === nicknameElement,
      showAchievement: !isMobileInven(),
    });
  }

  function renderMobileCommentCombatPowerLoading(item) {
    renderCombatPowerLoadingAtTarget(item, getNicknameElement(item), {
      appendToTarget: false,
    });
  }

  function getZeroCombatPowerProfile() {
    return {
      label: '0',
      updatedAt: null,
      achievement: null,
    };
  }

  function renderMobilePostCombatPower(row, profile) {
    const badge = getMobilePostBadge(row);
    const nicknameContainer = getMobilePostNicknameContainer(row);
    const target = badge || nicknameContainer;

    renderCombatPowerAtTarget(row, target, profile, {
      appendToTarget: target === nicknameContainer,
      showAchievement: false,
    });
  }

  function renderMobilePostCombatPowerLoading(row) {
    const badge = getMobilePostBadge(row);
    const nicknameContainer = getMobilePostNicknameContainer(row);
    const target = badge || nicknameContainer;

    renderCombatPowerLoadingAtTarget(row, target, {
      appendToTarget: target === nicknameContainer,
    });
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
      applyCombatPowerFilter(item);
      return;
    }

    if (isMobileInven()) renderMobileCommentCombatPowerLoading(item);

    item.dataset.icCombatPowerLoading = 'true';
    const profile = await fetchCombatPower(nickname);
    delete item.dataset.icCombatPowerLoading;

    if (!enabled || !getCommentBadge(item)) {
      removeCombatPower(item);
      return;
    }

    if (!profile || !profile.label) {
      if (!isMobileInven()) return;

      item.dataset.icCombatPowerNick = nickname;
      renderCombatPower(item, getZeroCombatPowerProfile());
      return;
    }

    item.dataset.icCombatPowerNick = nickname;
    renderCombatPower(item, profile);
  }

  async function applyCombatPowerToMobilePost(row) {
    if (!enabled) {
      removeCombatPower(row);
      return;
    }

    if (!getMobilePostBadge(row)) {
      removeCombatPower(row);
      return;
    }

    const nickname = getMobilePostNickname(row);
    if (!nickname) {
      removeCombatPower(row);
      return;
    }

    if (
      row.dataset.icCombatPowerNick === nickname ||
      row.dataset.icCombatPowerLoading === 'true'
    ) {
      applyCombatPowerFilter(row);
      return;
    }

    renderMobilePostCombatPowerLoading(row);

    row.dataset.icCombatPowerLoading = 'true';
    const profile = await fetchCombatPower(nickname);
    delete row.dataset.icCombatPowerLoading;

    if (!enabled || !getMobilePostBadge(row)) {
      removeCombatPower(row);
      return;
    }

    if (!profile || !profile.label) {
      row.dataset.icCombatPowerNick = nickname;
      renderMobilePostCombatPower(row, getZeroCombatPowerProfile());
      return;
    }

    row.dataset.icCombatPowerNick = nickname;
    renderMobilePostCombatPower(row, profile);
  }

  function applyCombatPower() {
    if (!isSupportedBoard()) return;

    document.querySelectorAll(COMMENT_ITEM_SELECTOR).forEach((item) => {
      applyCombatPowerToComment(item);
    });

    getMobilePostRows().forEach((row) => {
      applyCombatPowerToMobilePost(row);
    });
  }

  function clearCombatPower() {
    document.querySelectorAll(COMMENT_ITEM_SELECTOR).forEach(removeCombatPower);
    getMobilePostRows().forEach(removeCombatPower);
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

  function applySettings(settings = {}) {
    if (typeof settings.enabled === 'boolean') enabled = settings.enabled;
    if (typeof settings.hideBelowEnabled === 'boolean') {
      hideBelowEnabled = settings.hideBelowEnabled;
    }
    if (Number.isFinite(settings.hideBelowThreshold)) {
      hideBelowThreshold = settings.hideBelowThreshold;
    }

    if (enabled) {
      applyCombatPower();
      ensureObserver();
      return;
    }

    clearCombatPower();
  }

  function initCombatPower() {
    if (!isSupportedBoard()) return;
    const storageArea =
      config && typeof config.getStorageArea === 'function' ? config.getStorageArea() : null;
    const storageAreaName =
      config && typeof config.getStorageAreaName === 'function'
        ? config.getStorageAreaName()
        : 'sync';
    if (!storageArea) return;
    ensureTooltipListeners();

    storageArea.get(
      {
        [STORAGE_KEYS.showCombatPower]: false,
        [STORAGE_KEYS.hideBelowCombatPowerEnabled]: false,
        [STORAGE_KEYS.hideBelowCombatPowerThreshold]: DEFAULT_HIDE_BELOW_THRESHOLD,
      },
      (items) => {
        applySettings({
          enabled: items[STORAGE_KEYS.showCombatPower] === true,
          hideBelowEnabled: items[STORAGE_KEYS.hideBelowCombatPowerEnabled] === true,
          hideBelowThreshold:
            Number(items[STORAGE_KEYS.hideBelowCombatPowerThreshold]) ||
            DEFAULT_HIDE_BELOW_THRESHOLD,
        });
      }
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== storageAreaName) return;

      const nextSettings = {};
      let hasRelevantChange = false;

      if (changes[STORAGE_KEYS.showCombatPower]) {
        nextSettings.enabled = changes[STORAGE_KEYS.showCombatPower].newValue === true;
        hasRelevantChange = true;
      }

      if (changes[STORAGE_KEYS.hideBelowCombatPowerEnabled]) {
        nextSettings.hideBelowEnabled =
          changes[STORAGE_KEYS.hideBelowCombatPowerEnabled].newValue === true;
        hasRelevantChange = true;
      }

      if (changes[STORAGE_KEYS.hideBelowCombatPowerThreshold]) {
        nextSettings.hideBelowThreshold =
          Number(changes[STORAGE_KEYS.hideBelowCombatPowerThreshold].newValue) ||
          DEFAULT_HIDE_BELOW_THRESHOLD;
        hasRelevantChange = true;
      }

      if (!hasRelevantChange) return;
      applySettings(nextSettings);
    });
  }

  invenClear.features = invenClear.features || {};
  invenClear.features.combatPower = {
    initCombatPower,
  };
})(globalThis);
