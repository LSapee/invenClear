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

      if (postId) {
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

    const progress = document.createElement('span');
    progress.className = 'ic-progress';
    progress.setAttribute('aria-live', 'polite');
    bar.appendChild(progress);
    table.parentNode.insertBefore(bar, table);

    const countEl = bar.querySelector('.ic-count');
    const btnDelete = bar.querySelector('.ic-btn-delete');
    const progressEl = bar.querySelector('.ic-progress');

    function getCheckedBoxes() {
      return Array.from(tbody.querySelectorAll('.ic-check-row:checked'));
    }

    function updateState() {
      const checked = getCheckedBoxes();
      const all = tbody.querySelectorAll('.ic-check-row');
      countEl.textContent = String(checked.length);
      btnDelete.disabled = checked.length === 0;
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

    btnDelete.addEventListener('click', async () => {
      const checked = getCheckedBoxes();
      if (checked.length === 0) return;

      const message = `선택한 ${checked.length}개의 글을 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`;
      if (!confirm(message)) return;

      btnDelete.disabled = true;
      allCheckbox.disabled = true;
      let done = 0;
      let failed = 0;

      for (let index = 0; index < checked.length; index++) {
        const checkbox = checked[index];
        const postId = checkbox.dataset.postId;
        const row = checkbox.closest('tr');
        progressEl.textContent = `${index + 1} / ${checked.length} 처리 중 (#${postId})`;

        try {
          const ok = await deleteOnePost(comeIdx, page, postId);
          if (ok) {
            done++;
            if (row) row.classList.add('ic-row-deleted');
            checkbox.disabled = true;
          } else {
            failed++;
            if (row) row.classList.add('ic-row-failed');
          }
        } catch (error) {
          failed++;
          if (row) row.classList.add('ic-row-failed');
          console.error('[InvenClear] 삭제 실패', postId, error);
        }

        await sleep(300 + Math.random() * 1300);
      }

      progressEl.textContent = `완료 — 성공 ${done}건, 실패 ${failed}건. 잠시 후 새로고침합니다.`;
      setTimeout(() => location.reload(), 1500);
    });

    updateState();
  }

  invenClear.features = invenClear.features || {};
  invenClear.features.posts = { initPosts };
})(globalThis);
