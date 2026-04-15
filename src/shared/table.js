(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});

  function findListTable() {
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      if (
        table.querySelector('tbody tr td.num') &&
        table.querySelector('tbody tr td.tit a.subject-link')
      ) {
        return table;
      }
    }
    return null;
  }

  function getArticleId(tr) {
    const numSpan = tr.querySelector('td.num span');
    if (numSpan) return numSpan.textContent.trim();

    const link = tr.querySelector('td.tit a.subject-link');
    if (!link) return null;

    const href = link.getAttribute('href') || '';
    const match = href.match(/\/board\/[^/]+\/\d+\/(\d+)/);
    return match ? match[1] : null;
  }

  function getPageContext() {
    const params = new URLSearchParams(location.search);
    const my = params.get('my');
    if (my !== 'post' && my !== 'opi') return null;

    const pathMatch = location.pathname.match(/^\/board\/([^/]+)\/(\d+)/);
    if (!pathMatch) return null;

    const table = findListTable();
    if (!table) return null;

    const theadRow = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');
    if (!theadRow || !tbody) return null;

    return {
      boardSlug: pathMatch[1],
      comeIdx: pathMatch[2],
      my,
      page: params.get('p') || '1',
      table,
      theadRow,
      tbody,
    };
  }

  invenClear.table = {
    findListTable,
    getArticleId,
    getPageContext,
  };
})(globalThis);
