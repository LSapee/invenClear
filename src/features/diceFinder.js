(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});
  const { clickElement, getCollapsedCommentHeaders, isCommentLoading, sleep } = invenClear.util;
  const COMMENT_SELECTOR = 'li[id^="cmt"]';
  const EXPAND_SETTLE_MS = 1800;
  const MAX_EXPAND_STEPS = 12;
  const EXPAND_WAIT_LIMIT_MS = 6000;

  function parseDiceNumber(text) {
    const normalized = (text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return null;

    const dicePatterns = [
      /주사위(?:가|는)?\s*(\d{1,3})\s*(?:나왔|입니다|이네요|!|\.)/,
      /(\d{1,3})\s*(?:나왔습니다|입니다|입니다!|입니다\.|나왔습니다!)/,
    ];

    for (const pattern of dicePatterns) {
      const match = normalized.match(pattern);
      if (!match) continue;

      const value = Number(match[1]);
      if (Number.isInteger(value) && value >= 1 && value <= 100) return value;
    }

    return null;
  }

  function parseCommentTime(item) {
    const dateEl = item.querySelector('.date');
    const text = dateEl ? dateEl.textContent || '' : '';
    const match = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (!match) return null;

    return Number(match[1]) * 60 + Number(match[2]);
  }

  function getCommentContent(item) {
    const contentEl =
      item.querySelector('.content.cmtContentOne') ||
      item.querySelector('.content') ||
      item.querySelector('.cmtContentOne') ||
      item.querySelector('.comment');
    return contentEl ? contentEl.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function getCommentNickname(item) {
    const nickname = item.querySelector('.nickname');
    if (!nickname) return '';

    const textNode = Array.from(nickname.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    return textNode ? textNode.textContent.trim() : nickname.textContent.trim();
  }

  function collectDiceComments(deadlineMinutes, excludeHidden) {
    return Array.from(document.querySelectorAll(COMMENT_SELECTOR))
      .map((item) => {
        if (excludeHidden && item.classList.contains('ic-badge-hidden')) return null;

        const content = getCommentContent(item);
        const number = parseDiceNumber(content);
        if (number === null) return null;

        const commentMinutes = parseCommentTime(item);
        if (deadlineMinutes !== null && commentMinutes !== null && commentMinutes > deadlineMinutes) {
          return null;
        }

        return {
          id: item.id.replace(/^cmt/, ''),
          number,
          nickname: getCommentNickname(item),
          date: (item.querySelector('.date')?.textContent || '').replace(/[()]/g, '').trim(),
          content,
        };
      })
      .filter(Boolean);
  }

  function compareByNumberDesc(a, b) {
    if (b.number !== a.number) return b.number - a.number;
    return Number(a.id) - Number(b.id);
  }

  function compareByNumberAsc(a, b) {
    if (a.number !== b.number) return a.number - b.number;
    return Number(a.id) - Number(b.id);
  }

  function getCollapsedHeaders() {
    return getCollapsedCommentHeaders(document);
  }

  function isAnyCommentLoading() {
    const roots = document.querySelectorAll('#cmt, #powerbbsCmt2, .commentContainer, [id^="pwbbsCmt_"]');
    return Array.from(roots).some((root) => isCommentLoading(root));
  }

  function highlightComment(item) {
    item.classList.add('ic-dice-scroll-target');
    setTimeout(() => {
      item.classList.remove('ic-dice-scroll-target');
    }, 2200);
  }

  function scrollToComment(commentId) {
    const item = document.getElementById(`cmt${commentId}`);
    if (!item) return false;

    item.classList.remove('ic-badge-hidden');
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightComment(item);
    return true;
  }

  function openNextCollapsedHeader() {
    const header = getCollapsedHeaders()[0];
    if (!header) return false;

    clickElement(header);
    return true;
  }

  function getCommentCount() {
    return document.querySelectorAll(COMMENT_SELECTOR).length;
  }

  async function openAllCollapsedHeaders() {
    let steps = 0;

    while (getCollapsedHeaders().length > 0 && steps < MAX_EXPAND_STEPS) {
      const beforeCount = getCommentCount();
      const beforeHeaderCount = getCollapsedHeaders().length;
      const opened = openNextCollapsedHeader();
      if (!opened) break;

      steps++;
      const startedAt = Date.now();
      while (Date.now() - startedAt < EXPAND_WAIT_LIMIT_MS) {
        await sleep(250);

        const countChanged = getCommentCount() > beforeCount;
        const headerCountChanged = getCollapsedHeaders().length < beforeHeaderCount;
        if (!isAnyCommentLoading() && Date.now() - startedAt >= EXPAND_SETTLE_MS) {
          if (countChanged || headerCountChanged) break;
        }
      }
    }
  }

  async function scrollToDiceComment(commentId, sendResponse) {
    if (scrollToComment(commentId)) {
      sendResponse({ ok: true });
      return;
    }

    await openAllCollapsedHeaders();

    if (scrollToComment(commentId)) {
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, message: '댓글 위치를 찾지 못했습니다.' });
  }

  function buildResult(mode, comments, value) {
    if (comments.length === 0) {
      return { ok: false, message: '주사위 댓글을 찾지 못했습니다.', matches: [] };
    }

    if (mode === 'number') {
      const target = Number(value);
      const matches = comments.filter((comment) => comment.number === target);
      return {
        ok: matches.length > 0,
        message:
          matches.length > 0
            ? `${target} 나온 댓글 ${matches.length}개를 찾았습니다.`
            : `${target} 나온 댓글이 없습니다.`,
        matches,
      };
    }

    if (mode === 'max') {
      const max = Math.max(...comments.map((comment) => comment.number));
      const matches = comments.filter((comment) => comment.number === max);
      return { ok: true, message: `가장 큰 수는 ${max}입니다.`, matches };
    }

    if (mode === 'min') {
      const min = Math.min(...comments.map((comment) => comment.number));
      const matches = comments.filter((comment) => comment.number === min);
      return { ok: true, message: `가장 작은 수는 ${min}입니다.`, matches };
    }

    if (mode === 'nthMax') {
      const rank = Number(value);
      const sortedNumbers = Array.from(new Set(comments.map((comment) => comment.number))).sort(
        (a, b) => b - a
      );
      const target = sortedNumbers[rank - 1];
      const matches = target ? comments.filter((comment) => comment.number === target) : [];
      return {
        ok: matches.length > 0,
        message:
          matches.length > 0
            ? `${rank}번째로 큰 수는 ${target}입니다.`
            : `${rank}번째로 큰 수를 찾지 못했습니다.`,
        matches,
      };
    }

    return { ok: false, message: '지원하지 않는 주사위 찾기 방식입니다.', matches: [] };
  }

  async function runDiceSearch(request, sendResponse) {
    await openAllCollapsedHeaders();

    const deadlineMinutes =
      request.deadline && Number.isInteger(request.deadline.minutes)
        ? request.deadline.minutes
        : null;
    const comments = collectDiceComments(deadlineMinutes, request.excludeHidden === true);
    const result = buildResult(request.mode, comments, request.value);

    sendResponse({
      ...result,
      total: comments.length,
      matches: result.matches.sort(
        request.mode === 'min' ? compareByNumberAsc : compareByNumberDesc
      ),
    });
  }

  function handleDiceFinderMessage(request, sendResponse) {
    if (!request) return false;

    if (request.type === 'INVEN_CLEAR_SCROLL_TO_DICE') {
      scrollToDiceComment(request.commentId, sendResponse);
      return true;
    }

    if (request.type !== 'INVEN_CLEAR_FIND_DICE') return false;

    runDiceSearch(request, sendResponse);
    return true;
  }

  function initDiceFinder() {
    if (!global.chrome || !chrome.runtime || !chrome.runtime.onMessage) return;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) =>
      handleDiceFinderMessage(request, sendResponse)
    );
  }

  invenClear.features = invenClear.features || {};
  invenClear.features.diceFinder = {
    initDiceFinder,
  };
})(globalThis);
