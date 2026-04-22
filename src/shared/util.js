(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});

  invenClear.util = {
    getCollapsedCommentHeaders(root = document, opts = {}) {
      const { shouldSkip } = opts;

      return Array.from(root.querySelectorAll('h3.title678SL1.pointer')).filter((header) => {
        if (header.classList.contains('cmtListOpen')) return false;

        const titleNum = Number(header.getAttribute('data-titlenum') || '0');
        if (!Number.isFinite(titleNum) || titleNum < 100) return false;

        const text = (header.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text.includes('보기')) return false;
        if (typeof shouldSkip === 'function' && shouldSkip(header, titleNum)) return false;

        return true;
      });
    },

    isCommentLoading(root) {
      if (!root) return false;

      const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
      return (
        text.includes('코멘트 로딩중입니다') ||
        text.includes('코멘트 로딩 중입니다') ||
        text.includes('댓글 로딩중입니다') ||
        text.includes('댓글 로딩 중입니다')
      );
    },

    clickElement(element, win = global) {
      const jq = win && (win.jQuery || win.$);
      if (jq && typeof jq === 'function') {
        jq(element).trigger('click');
        return;
      }

      if (typeof element.click === 'function') {
        element.click();
        return;
      }

      element.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: win || global })
      );
    },

    truncate(value, maxLength) {
      if (!value) return '';
      return value.length > maxLength ? value.slice(0, maxLength) + '…' : value;
    },

    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
})(globalThis);
