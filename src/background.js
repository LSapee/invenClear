(function (global) {
  'use strict';

  const GAME_PROFILE_ENDPOINT = 'https://www.inven.co.kr/common/gameprofile/index.php';

  function getMobileInventoryUrl(nickname) {
    return `https://www.inven.co.kr/member/inventory/view_inventory.php?nick=${encodeURIComponent(nickname)}&isMobile=true&site=maple`;
  }

  function parseMobileMemId(html) {
    const patterns = [
      /&quot;uniqueMemberCode&quot;\s*:\s*&quot;([^&]+)&quot;/i,
      /"uniqueMemberCode"\s*:\s*"([^"]+)"/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) return match[1].trim();
    }

    return null;
  }

  async function fetchMobileMemId(nickname) {
    const response = await fetch(getMobileInventoryUrl(nickname), {
      credentials: 'include',
    });
    if (!response.ok) return null;

    return parseMobileMemId(await response.text());
  }

  function formatUpdatedAt(value) {
    const text = (value || '').trim();
    return text ? `최근 갱신일 : ${text}` : null;
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

  async function fetchMobileCombatPower(nickname) {
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

    const data = await response.json().catch(() => null);
    const profileData = data && data.profileData;
    const label = normalizePowerLabel(profileData && profileData.total_power);
    if (!label) return null;

    return {
      label,
      updatedAt: formatUpdatedAt(profileData.update_date),
      achievement: null,
    };
  }

  if (!global.chrome || !chrome.runtime || !chrome.runtime.onMessage) return;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || request.type !== 'INVEN_CLEAR_FETCH_MOBILE_COMBAT_POWER') return false;

    fetchMobileCombatPower(request.nickname || '')
      .then((profile) => sendResponse({ ok: true, profile }))
      .catch((error) => {
        console.error('[InvenClear] 모바일 전투력 background 조회 실패', error);
        sendResponse({ ok: false, profile: null });
      });

    return true;
  });
})(globalThis);
