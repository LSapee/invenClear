(function (global) {
  'use strict';

  const invenClear = global.InvenClear;
  if (!invenClear || !invenClear.table || !invenClear.features) return;

  const context = invenClear.table.getPageContext();
  if (!context) return;
  if (context.table.dataset.invenClear === 'true') return;
  context.table.dataset.invenClear = 'true';

  const colgroup = context.table.querySelector('colgroup');
  if (colgroup) {
    const col = document.createElement('col');
    col.className = 'ic-col';
    colgroup.insertBefore(col, colgroup.firstChild);
  }

  if (context.my === 'post') {
    invenClear.features.posts.initPosts(context);
    return;
  }

  invenClear.features.comments.initComments(context);
})(globalThis);
