(function (global) {
  'use strict';

  const MESSAGE_SOURCE = 'InvenClearCombatPowerInventory';
  const ACHIEVEMENT_ICON_URL =
    'https://static.inven.co.kr/image_2011/maple/inventory/achievement_icon.png';
  const POLL_INTERVAL_MS = 250;
  const TIMEOUT_MS = 12000;

  function getRequestId() {
    try {
      return new URL(location.href).searchParams.get('icCombatPowerRequestId');
    } catch {
      return null;
    }
  }

  const requestId = getRequestId();
  if (!requestId || global.parent === global) return;

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

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function parseCombatPowerFromText(root) {
    const text = normalizeText(root.body?.textContent || root.textContent || '');
    if (!text) return null;

    const match = text.match(
      /전투력\s*[:：]?\s*([+-]?\s*\d+(?:\.\d+)?\s*(?:억|천만|만)(?:\s*\d+(?:\.\d+)?\s*(?:천만|만))?)/
    );
    return match ? normalizePowerLabel(match[1]) : null;
  }

  function parseCombatPowerFromRoot(root) {
    const powerElement = root.querySelector(
      '.info-power .power, .char-info .power, .game-profile .power'
    );
    return powerElement
      ? normalizePowerLabel(powerElement.textContent)
      : parseCombatPowerFromText(root);
  }

  function isInvalidInventoryAccess(root) {
    const text = normalizeText(root.body?.textContent || root.textContent || '');
    return text.includes('잘못된 접근입니다') || text.includes('잘못된 접근');
  }

  function parseUpdatedAtFromRoot(root) {
    const warningElement =
      root.querySelector('.char-info .warning') ||
      Array.from(root.querySelectorAll('.warning')).find((element) =>
        (element.textContent || '').includes('갱신일')
      );
    const warningText = normalizeText(warningElement?.textContent);
    const text = warningText || normalizeText(root.body?.textContent || root.textContent || '');
    if (!text) return null;

    const match = text.match(/(?:최근\s*)?갱신일\s*[:：]\s*([0-9]{2,4}[./-][0-9]{1,2}[./-][0-9]{1,2})/);
    if (match) return `최근 갱신일 : ${match[1].trim()}`;
    return warningText || null;
  }

  function parseAchievementFromRoot(root) {
    const signatureBlocks = Array.from(root.querySelectorAll('.info-signature'));
    const achievementBlock = signatureBlocks.find((block) =>
      normalizeText(block.querySelector('.info-title')?.textContent).includes('시그니쳐 업적')
    );

    if (!achievementBlock) return null;

    const title =
      normalizeText(achievementBlock.querySelector('.signature-tooltip h5')?.textContent) ||
      normalizeText(achievementBlock.querySelector('.img-text p')?.textContent);
    const description = normalizeText(
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

  function clickGameProfileTab() {
    const button =
      document.querySelector('button[data-id="game_profile"]') ||
      Array.from(document.querySelectorAll('button')).find((candidate) =>
        (candidate.textContent || '').includes('메이플 프로필')
      );
    if (!button || button.classList.contains('active')) return;

    const clickElement = global.InvenClear?.util?.clickElement;
    if (typeof clickElement === 'function') {
      clickElement(button, global);
      return;
    }

    button.click();
  }

  function sendProfile(profile) {
    global.parent.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: 'INVEN_CLEAR_COMBAT_POWER_PROFILE',
        requestId,
        profile,
      },
      '*'
    );
  }

  let clickedProfileTab = false;
  let powerFoundAt = 0;
  const startedAt = Date.now();

  const poll = setInterval(() => {
    if (isInvalidInventoryAccess(document)) {
      clearInterval(poll);
      sendProfile(null);
      return;
    }

    const profile = {
      label: parseCombatPowerFromRoot(document),
      updatedAt: parseUpdatedAtFromRoot(document),
      achievement: parseAchievementFromRoot(document),
    };

    if (profile.label && !powerFoundAt) {
      powerFoundAt = Date.now();
    }

    if (profile.label && (profile.updatedAt || Date.now() - powerFoundAt >= 3000)) {
      clearInterval(poll);
      sendProfile(profile);
      return;
    }

    if (!clickedProfileTab) {
      clickGameProfileTab();
      clickedProfileTab = true;
    }

    if (Date.now() - startedAt >= TIMEOUT_MS) {
      clearInterval(poll);
      sendProfile(null);
    }
  }, POLL_INTERVAL_MS);
})(globalThis);
