(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});
  const ENDPOINT = 'https://www.inven.co.kr/board/bbs/include/view_commend.json.php';
  const DISLIKE_CLASS = 'ic-dislike-count';
  const RECOMMEND_CLASS = 'ic-recommend-count';
  const FETCH_CONCURRENCY = 4;

  let activeFetches = 0;
  const fetchQueue = [];
  const dislikeCache = new Map();

  function getListTable() {
    return invenClear.table && typeof invenClear.table.findListTable === 'function'
      ? invenClear.table.findListTable()
      : null;
  }

  function getArticleInfo(row) {
    const link = row.querySelector('td.tit a.subject-link');
    if (!link) return null;

    try {
      const url = new URL(link.getAttribute('href') || '', location.href);
      const match = url.pathname.match(/^\/board\/[^/]+\/(\d+)\/(\d+)/);
      if (!match) return null;

      return {
        comeidx: match[1],
        uid: match[2],
      };
    } catch {
      return null;
    }
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

  async function fetchDislikeCount(comeidx, uid) {
    const cacheKey = `${comeidx}:${uid}`;
    if (dislikeCache.has(cacheKey)) return dislikeCache.get(cacheKey);

    const promise = enqueueFetch(async () => {
      const body = new URLSearchParams({
        comeidx,
        uid,
        act: 'bbs',
        type: 'article',
        site: 'inven',
      });

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        credentials: 'include',
      });

      if (!response.ok) return null;

      let data;
      try {
        data = await response.json();
      } catch {
        return null;
      }

      if (!Array.isArray(data.bad)) return 0;
      return data.bad.length;
    });

    dislikeCache.set(cacheKey, promise);
    return promise;
  }

  function renderDislikeCount(recoCell, count) {
    const recommendationText = (recoCell.textContent || '').replace(/[^\d-]/g, '').trim() || '0';
    let element = recoCell.querySelector(`.${DISLIKE_CLASS}`);
    if (!element) {
      recoCell.textContent = '';
      element = document.createElement('span');
      element.className = DISLIKE_CLASS;
      recoCell.classList.add('ic-reco-with-dislike');

      const recommendElement = document.createElement('span');
      recommendElement.className = RECOMMEND_CLASS;
      recommendElement.textContent = recommendationText;

      const separator = document.createTextNode(' / ');
      recoCell.appendChild(recommendElement);
      recoCell.appendChild(separator);
      recoCell.appendChild(element);
    }

    element.textContent = String(count);
  }

  async function applyDislikeCountToRow(row) {
    if (row.dataset.icDislikeLoading === 'true' || row.dataset.icDislikeLoaded === 'true') return;

    const recoCell = row.querySelector('td.reco');
    const articleInfo = getArticleInfo(row);
    if (!recoCell || !articleInfo) return;

    row.dataset.icDislikeLoading = 'true';

    try {
      const count = await fetchDislikeCount(articleInfo.comeidx, articleInfo.uid);
      if (Number.isFinite(count)) {
        renderDislikeCount(recoCell, count);
        row.dataset.icDislikeLoaded = 'true';
      }
    } catch (error) {
      console.error('[InvenClear] 비추천 수 조회 실패', articleInfo, error);
    } finally {
      delete row.dataset.icDislikeLoading;
    }
  }

  function initDislikeCount() {
    const table = getListTable();
    if (!table) return;

    table.querySelectorAll('tbody tr').forEach((row) => {
      applyDislikeCountToRow(row);
    });
  }

  invenClear.features = invenClear.features || {};
  invenClear.features.dislikeCount = {
    initDislikeCount,
  };
})(globalThis);
