(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});
  const { sleep } = invenClear.util;
  const { getArticleId } = invenClear.table;

  async function deleteOnePost(comeIdx, page, postId) {
    const body = new URLSearchParams({
      come_idx: comeIdx,
      p: page,
      l: postId,
      my: 'post',
    }).toString();

    const res = await fetch(
      'https://www.inven.co.kr/board/bbs/include/multi_delete.php',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        credentials: 'include',
      }
    );

    return res.ok;
  }

  function parseCommentCount(value) {
    const text = String(value || '')
      .replace(/[\s\u00a0]/g, '')
      .trim();
    if (!text) return 0;

    const match = text.match(/-?\d+/);
    if (!match) return null;

    const count = Number(match[0]);
    return Number.isFinite(count) ? count : null;
  }

  function getCommentCount(row) {
    const commentElement = row.querySelector('.con-comment');
    if (!commentElement) return null;

    const dataCount = parseCommentCount(commentElement.getAttribute('data-opinion-bbs-opi'));
    if (dataCount !== null) return dataCount;

    return parseCommentCount(commentElement.textContent);
  }

  function isNoticeRow(row) {
    return row.classList.contains('notice') || !!row.querySelector('td.num .notice-icon');
  }

  function isVisibleRow(row) {
    return (
      !row.hidden &&
      row.style.display !== 'none' &&
      !row.classList.contains('ic-badge-hidden') &&
      !row.classList.contains('ic-combat-power-filter-hidden')
    );
  }

  function isDeletablePostRow(row, postId) {
    return !!(postId && /^\d+$/.test(postId) && !isNoticeRow(row));
  }

  function initPosts(context) {
    const { comeIdx, page, table, theadRow, tbody } = context;

    const thCheck = document.createElement('th');
    thCheck.className = 'ic-col';

    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.className = 'ic-check-all';
    allCheckbox.title = '전체 선택';
    thCheck.appendChild(allCheckbox);
    theadRow.insertBefore(thCheck, theadRow.firstChild);

    tbody.querySelectorAll('tr').forEach((tr) => {
      const postId = getArticleId(tr);
      const td = document.createElement('td');
      td.className = 'ic-col';

      if (isDeletablePostRow(tr, postId)) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'ic-check-row';
        checkbox.dataset.postId = postId;
        td.appendChild(checkbox);
      }

      tr.insertBefore(td, tr.firstChild);
    });

    const bar = document.createElement('div');
    bar.className = 'ic-action-bar';

    const label = document.createElement('span');
    label.className = 'ic-label';
    label.textContent = 'InvenClear';
    bar.appendChild(label);

    const status = document.createElement('span');
    status.className = 'ic-status';
    status.appendChild(document.createTextNode('선택 '));
    const count = document.createElement('b');
    count.className = 'ic-count';
    count.textContent = '0';
    status.appendChild(count);
    status.appendChild(document.createTextNode('개'));
    bar.appendChild(status);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'ic-btn ic-btn-delete';
    deleteButton.disabled = true;
    deleteButton.textContent = '선택 삭제';
    bar.appendChild(deleteButton);

    const deleteNoCommentButton = document.createElement('button');
    deleteNoCommentButton.type = 'button';
    deleteNoCommentButton.className = 'ic-btn ic-btn-delete ic-btn-delete-no-comment';
    deleteNoCommentButton.disabled = true;
    deleteNoCommentButton.textContent = '댓글 없는 글 삭제';
    deleteNoCommentButton.title = '현재 목록에서 댓글이 0개인 글을 삭제합니다.';
    bar.appendChild(deleteNoCommentButton);

    const progress = document.createElement('span');
    progress.className = 'ic-progress';
    progress.setAttribute('aria-live', 'polite');
    bar.appendChild(progress);
    table.parentNode.insertBefore(bar, table);

    const countEl = bar.querySelector('.ic-count');
    const btnDelete = deleteButton;
    const btnDeleteNoComment = deleteNoCommentButton;
    const progressEl = bar.querySelector('.ic-progress');
    let isDeleting = false;

    function getCheckedBoxes() {
      return Array.from(tbody.querySelectorAll('.ic-check-row:checked'));
    }

    function getNoCommentPostTargets() {
      return Array.from(tbody.querySelectorAll('tr'))
        .map((row) => {
          const postId = getArticleId(row);
          return { row, postId, commentCount: getCommentCount(row) };
        })
        .filter(
          ({ row, postId, commentCount }) =>
            isVisibleRow(row) && isDeletablePostRow(row, postId) && commentCount === 0
        );
    }

    function getSelectedPostTargets() {
      return getCheckedBoxes()
        .map((checkbox) => ({
          checkbox,
          postId: checkbox.dataset.postId,
          row: checkbox.closest('tr'),
        }))
        .filter(({ postId, row }) => postId && row);
    }

    function updateState() {
      const checked = getCheckedBoxes();
      const all = tbody.querySelectorAll('.ic-check-row');
      const noCommentCount = getNoCommentPostTargets().length;
      countEl.textContent = String(checked.length);
      btnDelete.disabled = isDeleting || checked.length === 0;
      btnDeleteNoComment.disabled = isDeleting || noCommentCount === 0;
      btnDeleteNoComment.textContent =
        noCommentCount > 0 ? `댓글 없는 글 삭제 (${noCommentCount})` : '댓글 없는 글 삭제';
      allCheckbox.disabled = isDeleting || all.length === 0;
      allCheckbox.checked = all.length > 0 && checked.length === all.length;
      allCheckbox.indeterminate = checked.length > 0 && checked.length < all.length;
    }

    allCheckbox.addEventListener('change', () => {
      tbody.querySelectorAll('.ic-check-row').forEach((checkbox) => {
        checkbox.checked = allCheckbox.checked;
      });
      updateState();
    });

    tbody.addEventListener('change', (event) => {
      if (event.target.classList && event.target.classList.contains('ic-check-row')) {
        updateState();
      }
    });

    const rowStateObserver = new MutationObserver(updateState);
    rowStateObserver.observe(tbody, {
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
      childList: true,
      subtree: true,
    });

    async function deletePostTargets(targets, message) {
      if (targets.length === 0) return;
      if (!confirm(message)) return;

      isDeleting = true;
      updateState();
      let done = 0;
      let failed = 0;
      let processed = 0;
      let cursor = 0;
      const concurrency = 1 + Math.floor(Math.random() * 5);
      const workerCount = Math.min(concurrency, targets.length);

      progressEl.textContent = `삭제 중 0 / ${targets.length} (동시 ${workerCount}개)`;

      const workers = Array.from(
        { length: workerCount },
        async () => {
          while (true) {
            const current = cursor++;
            if (current >= targets.length) return;

            const { checkbox, postId, row } = targets[current];

            try {
              const ok = await deleteOnePost(comeIdx, page, postId);
              if (ok) {
                done++;
                if (row) row.classList.add('ic-row-deleted');
                if (checkbox) {
                  checkbox.checked = false;
                  checkbox.disabled = true;
                }
              } else {
                failed++;
                if (row) row.classList.add('ic-row-failed');
              }
            } catch (error) {
              failed++;
              if (row) row.classList.add('ic-row-failed');
              console.error('[InvenClear] 삭제 실패', postId, error);
            }

            processed++;
            progressEl.textContent = `삭제 중 ${processed} / ${targets.length} (동시 ${workerCount}개)`;
            await sleep(100 + Math.random() * 200);
          }
        }
      );

      await Promise.all(workers);

      progressEl.textContent = `완료 — 성공 ${done}건, 실패 ${failed}건. 잠시 후 새로고침합니다.`;
      setTimeout(() => location.reload(), 1000);
    }

    btnDelete.addEventListener('click', async () => {
      const targets = getSelectedPostTargets();
      if (targets.length === 0) return;

      await deletePostTargets(
        targets,
        `선택한 ${targets.length}개의 글을 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`
      );
    });

    btnDeleteNoComment.addEventListener('click', async () => {
      const targets = getNoCommentPostTargets();
      if (targets.length === 0) {
        progressEl.textContent = '현재 목록에 댓글 없는 글이 없습니다.';
        updateState();
        return;
      }

      await deletePostTargets(
        targets,
        `현재 목록에서 댓글 없는 글 ${targets.length}개를 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`
      );
    });

    updateState();
  }

  invenClear.features = invenClear.features || {};
  invenClear.features.posts = { initPosts };
})(globalThis);
