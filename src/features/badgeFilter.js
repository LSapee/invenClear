(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});
  const config = invenClear.config || {};
  const STORAGE_KEYS = config.storageKeys || {};
  const ALLOWED_BOARDS = new Set(config.allowedBadgeFilterBoards || []);
  const COMMENT_ITEM_SELECTOR = 'li[id^="cmt"]';
  const RECOMMENDED_ARTICLE_IDS_KEY = 'invenClearRecommendedArticleIds';

  let masterEnabled = false;
  let postFilterEnabled = false;
  let commentFilterEnabled = false;
  let excludeRecommendedEnabled = false;
  let observer = null;
  let queued = false;

  function getBoardSlug() {
    const match = location.pathname.match(/^\/board\/([^/]+)(?:\/|$)/);
    return match ? match[1] : null;
  }

  function getCurrentArticleId() {
    const match = location.pathname.match(/^\/board\/[^/]+\/\d+\/(\d+)/);
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

  function getRecommendationCount(row) {
    const recoCell = row.querySelector('td.reco');
    if (!recoCell) return 0;

    const value = (recoCell.textContent || '').replace(/[^\d-]/g, '');
    const count = Number(value);
    return Number.isFinite(count) ? count : 0;
  }

  function getArticleIdFromRow(row) {
    const link = row.querySelector('td.tit a.subject-link');
    const href = link ? link.getAttribute('href') || '' : '';
    const match = href.match(/\/board\/[^/]+\/\d+\/(\d+)/);
    return match ? match[1] : null;
  }

  function getRememberedRecommendedArticleIds() {
    try {
      const value = sessionStorage.getItem(RECOMMENDED_ARTICLE_IDS_KEY);
      const ids = value ? JSON.parse(value) : [];
      return new Set(Array.isArray(ids) ? ids.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function rememberRecommendedArticleId(articleId) {
    if (!articleId) return;

    const ids = getRememberedRecommendedArticleIds();
    ids.add(String(articleId));

    try {
      sessionStorage.setItem(RECOMMENDED_ARTICLE_IDS_KEY, JSON.stringify(Array.from(ids)));
    } catch {}
  }

  function shouldKeepRecommendedPost(row) {
    return excludeRecommendedEnabled && getRecommendationCount(row) >= 10;
  }

  function parseCount(text) {
    const value = (text || '').replace(/[^\d-]/g, '');
    const count = Number(value);
    return Number.isFinite(count) ? count : null;
  }

  function getCountFromElement(selector) {
    const element = document.querySelector(selector);
    if (!element) return null;

    return parseCount(element.textContent || element.getAttribute('value') || '');
  }

  function getArticleRecommendationCountFromExplicitSelectors() {
    const selectors = [
      '#articleRecommend',
      '#articleRecommendCount',
      '#recommendCount',
      '#recommenderCount',
      '#likeCount',
      '.articleRecommendCount',
      '.articleRecommend',
      '.article-recommend',
      '.recommenderCount',
      '.recommendCount',
      '.likeCount',
      '.board-view .reco',
      '.article-view .reco',
      '.view .reco',
    ];

    for (const selector of selectors) {
      const count = getCountFromElement(selector);
      if (count !== null) return count;
    }

    return null;
  }

  function getArticleRecommendationCountFromText() {
    const candidates = Array.from(
      document.querySelectorAll('[class*="recommend"], [id*="Recommend"], [id*="recommend"]')
    );

    for (const element of candidates) {
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || !text.includes('추천')) continue;

      const matches = text.match(/-?\d[\d,]*/g);
      if (!matches) continue;

      const count = Number(matches[matches.length - 1].replace(/,/g, ''));
      if (Number.isFinite(count)) return count;
    }

    return null;
  }

  function getArticleRecommendationCount() {
    const explicitCount = getArticleRecommendationCountFromExplicitSelectors();
    if (explicitCount !== null) return explicitCount;

    const textCount = getArticleRecommendationCountFromText();
    if (textCount !== null) return textCount;

    return 0;
  }

  function shouldShowAllCommentsForRecommendedArticle() {
    if (!excludeRecommendedEnabled) return false;

    const articleId = getCurrentArticleId();
    if (!articleId) return false;

    if (getRememberedRecommendedArticleIds().has(articleId)) return true;
    return getArticleRecommendationCount() >= 10;
  }

  function applyPostFilter() {
    const table = getListTable();
    if (!table) return;

    table.querySelectorAll('tbody tr').forEach((row) => {
      if (row.classList.contains('notice')) {
        row.classList.remove('ic-badge-hidden');
        return;
      }

      if (row.classList.contains('ic-opi-expand')) return;
      if (!row.querySelector('td.tit')) return;

      const keepRecommendedPost = shouldKeepRecommendedPost(row);
      if (keepRecommendedPost) rememberRecommendedArticleId(getArticleIdFromRow(row));

      row.classList.toggle(
        'ic-badge-hidden',
        masterEnabled &&
          postFilterEnabled &&
          !hasMapleBadge(row) &&
          !keepRecommendedPost
      );
    });
  }

  function hasCommentBadge(item) {
    return !!item.querySelector('.nickname img.confirmIcon, .nickname img.maple, img.confirmIcon');
  }

  function applyCommentFilter() {
    const showAllComments = masterEnabled && shouldShowAllCommentsForRecommendedArticle();

    document.querySelectorAll(COMMENT_ITEM_SELECTOR).forEach((item) => {
      item.classList.toggle(
        'ic-badge-hidden',
        masterEnabled && commentFilterEnabled && !showAllComments && !hasCommentBadge(item)
      );
    });
  }

  function applyBadgeFilter(settings = {}) {
    if (typeof settings.enabled === 'boolean') masterEnabled = settings.enabled;
    if (typeof settings.posts === 'boolean') postFilterEnabled = settings.posts;
    if (typeof settings.comments === 'boolean') commentFilterEnabled = settings.comments;
    if (typeof settings.excludeRecommended === 'boolean') {
      excludeRecommendedEnabled = settings.excludeRecommended;
    }

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
        [STORAGE_KEYS.hideNoBadgeEnabled]: false,
        [STORAGE_KEYS.hideNoBadgePosts]: true,
        [STORAGE_KEYS.hideNoBadgeComments]: true,
        [STORAGE_KEYS.excludeRecommendedNoBadgePosts]: false,
      },
      (items) => {
        applyBadgeFilter({
          enabled: items[STORAGE_KEYS.hideNoBadgeEnabled] === true,
          posts: items[STORAGE_KEYS.hideNoBadgePosts] === true,
          comments: items[STORAGE_KEYS.hideNoBadgeComments] === true,
          excludeRecommended: items[STORAGE_KEYS.excludeRecommendedNoBadgePosts] === true,
        });
      }
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;

      const nextSettings = {};
      let hasRelevantChange = false;

      if (changes[STORAGE_KEYS.hideNoBadgeEnabled]) {
        nextSettings.enabled = changes[STORAGE_KEYS.hideNoBadgeEnabled].newValue === true;
        hasRelevantChange = true;
      }

      if (changes[STORAGE_KEYS.hideNoBadgePosts]) {
        nextSettings.posts = changes[STORAGE_KEYS.hideNoBadgePosts].newValue === true;
        hasRelevantChange = true;
      }

      if (changes[STORAGE_KEYS.hideNoBadgeComments]) {
        nextSettings.comments = changes[STORAGE_KEYS.hideNoBadgeComments].newValue === true;
        hasRelevantChange = true;
      }

      if (changes[STORAGE_KEYS.excludeRecommendedNoBadgePosts]) {
        nextSettings.excludeRecommended =
          changes[STORAGE_KEYS.excludeRecommendedNoBadgePosts].newValue === true;
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
