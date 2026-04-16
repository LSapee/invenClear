(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});
  const { getArticleId } = invenClear.table;
  const { sleep, truncate } = invenClear.util;

  async function fetchMyComments(boardSlug, comeIdx, articleId, opts = {}) {
    const url = `/board/${boardSlug}/${comeIdx}/${articleId}?my=opi`;

    const htmlPromise = fetch(url, { credentials: 'include' }).then((res) => res.text());
    const commentsPromise = loadCommentsViaIframe(url, opts);

    const [html, comments] = await Promise.all([htmlPromise, commentsPromise]);
    const tokenMatch = html.match(/cmtTokenKey\s*[:=]\s*['"]([a-f0-9]{32})['"]/);
    const token = tokenMatch ? tokenMatch[1] : null;

    return { token, comments };
  }

  function loadCommentsViaIframe(url, opts = {}) {
    const { timeoutMs = 45000, maxTries = 120 } = opts;

    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText =
        'position:absolute;left:-9999px;top:0;width:800px;height:600px;border:0;visibility:hidden';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.src = url;

      let settled = false;

      const cleanup = () => {
        if (iframe.parentNode) iframe.remove();
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`댓글 로딩 타임아웃 (${Math.round(timeoutMs / 1000)}초)`));
      }, timeoutMs);

      iframe.addEventListener('load', () => {
        let tries = 0;
        let lastRowCount = 0;
        let stableTicks = 0;

        const poll = setInterval(() => {
          tries++;

          let doc;
          try {
            doc = iframe.contentDocument;
          } catch (error) {
            clearInterval(poll);
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            cleanup();
            reject(new Error('iframe 접근 실패'));
            return;
          }

          if (!doc) return;

          const rows = Array.from(doc.querySelectorAll('li.row[id^="cmt"]'));
          const cmtBody = doc.querySelector('#cmt, #powerbbsCmt2, .commentContainer');

          if (rows.length === lastRowCount) {
            stableTicks++;
          } else {
            lastRowCount = rows.length;
            stableTicks = 0;
          }

          const hasAny = rows.length > 0;
          const stable = hasAny && stableTicks >= 5;
          const emptyStable = !hasAny && cmtBody && tries > 8;

          if (stable || emptyStable || tries >= maxTries) {
            clearInterval(poll);
            if (settled) return;
            settled = true;
            clearTimeout(timeout);

            const myRows = rows.filter((li) => li.querySelector('a.delete'));
            const comments = myRows.map((li) => {
              const cmtidx = li.id.replace(/^cmt/, '');
              const contentEl =
                li.querySelector('.content.cmtContentOne') ||
                li.querySelector('.content') ||
                li.querySelector('.cmtContentOne');
              let content = contentEl ? contentEl.textContent.trim() : '';
              content = content.replace(/\s+/g, ' ');

              return {
                cmtidx,
                content,
                isReply: li.classList.contains('replyCmt'),
                hasSticker: !!(contentEl && contentEl.querySelector('img')),
              };
            });

            cleanup();
            resolve(comments);
          }
        }, 300);
      });

      document.body.appendChild(iframe);
    });
  }

  async function deleteOneComment(comeIdx, articleId, cmtidx, token) {
    const body = new URLSearchParams({
      comeidx: comeIdx,
      articlecode: articleId,
      sortorder: 'date',
      act: 'del',
      out: 'json',
      chkcode: token,
      cmtcodes: cmtidx,
      replynick: '',
      replyidx: '0',
      uploadurl: '',
      imageposition: '',
    }).toString();

    const url = `https://www.inven.co.kr/common/board/comment.json.php?dummy=${Date.now()}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body,
      credentials: 'include',
    });

    if (!res.ok) return false;

    try {
      const json = await res.json();
      return json && (json.message === 1 || json.message === '1' || json.result === 1);
    } catch {
      return true;
    }
  }

  function initComments(context) {
    const { boardSlug, comeIdx, table, theadRow, tbody } = context;

    const thCheck = document.createElement('th');
    thCheck.className = 'ic-col';

    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.className = 'ic-check-all';
    allCheckbox.title = '전체 선택';
    allCheckbox.disabled = true;
    thCheck.appendChild(allCheckbox);
    theadRow.insertBefore(thCheck, theadRow.firstChild);

    const BATCH_SIZES = [10];
    const articleRows = [];

    tbody.querySelectorAll('tr').forEach((tr) => {
      const td = document.createElement('td');
      td.className = 'ic-col';
      tr.insertBefore(td, tr.firstChild);

      const articleId = getArticleId(tr);
      if (!articleId) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ic-btn ic-btn-view ic-row-view';
      button.textContent = '보기';
      button.dataset.articleId = articleId;
      button.addEventListener('click', () => loadArticleComments(tr, articleId, button));
      td.appendChild(button);
      articleRows.push({ tr, articleId, btn: button });
    });

    const bar = document.createElement('div');
    bar.className = 'ic-action-bar';
    bar.innerHTML = `
      <span class="ic-label">InvenClear — 내 댓글</span>
      ${BATCH_SIZES.map((size) => `<button type="button" class="ic-btn ic-btn-view ic-btn-batch" data-batch-size="${size}">상단 ${size}개 조회</button>`).join('\n      ')}
      <span class="ic-status">선택 <b class="ic-count">0</b>개</span>
      <button type="button" class="ic-btn ic-btn-delete" disabled>선택 삭제</button>
      <span class="ic-progress" aria-live="polite"></span>
    `;
    table.parentNode.insertBefore(bar, table);

    const countEl = bar.querySelector('.ic-count');
    const btnDelete = bar.querySelector('.ic-btn-delete');
    const batchButtons = Array.from(bar.querySelectorAll('.ic-btn-batch'));
    const progressEl = bar.querySelector('.ic-progress');
    const articleMap = new Map();

    function getActiveCheckboxes() {
      return Array.from(tbody.querySelectorAll('.ic-check-row')).filter((cb) => !cb.disabled);
    }

    function getCheckedBoxes() {
      return Array.from(tbody.querySelectorAll('.ic-check-row:checked')).filter(
        (cb) => !cb.disabled
      );
    }

    function updateState() {
      const checked = getCheckedBoxes();
      const active = getActiveCheckboxes();
      countEl.textContent = String(checked.length);
      btnDelete.disabled = checked.length === 0;
      allCheckbox.checked = active.length > 0 && checked.length === active.length;
      allCheckbox.indeterminate = checked.length > 0 && checked.length < active.length;
      if (active.length > 0) allCheckbox.disabled = false;
    }

    function insertCommentRows(articleTr, articleId, comments) {
      const expandTr = document.createElement('tr');
      expandTr.className = 'ic-opi-expand';

      const expandTd = document.createElement('td');
      expandTd.colSpan = articleTr.children.length || 7;
      expandTd.className = 'ic-opi-expand-cell';

      const list = document.createElement('ul');
      list.className = 'ic-opi-list';

      comments.forEach((comment) => {
        const li = document.createElement('li');
        li.className = 'ic-opi-item';
        li.dataset.cmtidx = comment.cmtidx;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'ic-check-row';
        checkbox.dataset.cmtidx = comment.cmtidx;
        checkbox.dataset.articleId = articleId;

        const body = document.createElement('div');
        body.className = 'ic-opi-body';

        if (comment.isReply) {
          const tag = document.createElement('span');
          tag.className = 'ic-opi-tag';
          tag.textContent = '답글';
          body.appendChild(tag);
        }

        const text = document.createElement('span');
        text.className = 'ic-opi-text';
        const fallback = comment.hasSticker ? '[스티커]' : '(내용 없음)';
        text.textContent = truncate(comment.content, 200) || fallback;
        text.title = comment.content || fallback;
        body.appendChild(text);

        li.appendChild(checkbox);
        li.appendChild(body);
        list.appendChild(li);
      });

      expandTd.appendChild(list);
      expandTr.appendChild(expandTd);
      articleTr.after(expandTr);
    }

    async function loadArticleComments(tr, articleId, btn) {
      if (btn.disabled || btn.dataset.loaded === 'true') return;

      btn.disabled = true;
      btn.textContent = '...';

      try {
        const { token, comments } = await fetchMyComments(boardSlug, comeIdx, articleId);
        if (token) articleMap.set(articleId, { token });
        btn.dataset.loaded = 'true';

        if (comments.length === 0) {
          btn.textContent = '없음';
          return;
        }

        insertCommentRows(tr, articleId, comments);
        btn.textContent = `${comments.length}개`;
        updateState();
      } catch (error) {
        console.error('[InvenClear] 댓글 로드 실패', articleId, error);
        btn.disabled = false;
        btn.textContent = '재시도';
      }
    }

    allCheckbox.addEventListener('change', () => {
      getActiveCheckboxes().forEach((checkbox) => {
        checkbox.checked = allCheckbox.checked;
      });
      updateState();
    });

    tbody.addEventListener('change', (event) => {
      if (event.target.classList && event.target.classList.contains('ic-check-row')) {
        updateState();
      }
    });

    batchButtons.forEach((batchBtn) => {
      batchBtn.addEventListener('click', async () => {
        const batchSize = Number(batchBtn.dataset.batchSize);
        const targets = articleRows
          .slice(0, batchSize)
          .filter(({ btn }) => btn.dataset.loaded !== 'true' && !btn.disabled);
        if (targets.length === 0) return;

        batchButtons.forEach((b) => (b.disabled = true));
        let done = 0;
        progressEl.textContent = `조회 중 ${done} / ${targets.length}`;

        for (const { tr, articleId, btn } of targets) {
          await loadArticleComments(tr, articleId, btn);
          done++;
          progressEl.textContent = `조회 중 ${done} / ${targets.length}`;
        }

        progressEl.textContent = `조회 완료 — ${done}건`;
        batchButtons.forEach((b) => (b.disabled = false));
      });
    });

    btnDelete.addEventListener('click', async () => {
      const checked = getCheckedBoxes();
      if (checked.length === 0) return;

      const message = `선택한 ${checked.length}개 댓글을 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`;
      if (!confirm(message)) return;

      btnDelete.disabled = true;
      allCheckbox.disabled = true;
      let done = 0;
      let failed = 0;

      for (let index = 0; index < checked.length; index++) {
        const checkbox = checked[index];
        const cmtidx = checkbox.dataset.cmtidx;
        const articleId = checkbox.dataset.articleId;
        const li = checkbox.closest('li');
        const article = articleMap.get(articleId);
        progressEl.textContent = `${index + 1} / ${checked.length} 삭제 중 (#${cmtidx})`;

        try {
          if (!article) throw new Error('토큰 없음');

          const ok = await deleteOneComment(comeIdx, articleId, cmtidx, article.token);
          if (ok) {
            done++;
            if (li) li.classList.add('ic-row-deleted');
            checkbox.checked = false;
            checkbox.disabled = true;
          } else {
            failed++;
            if (li) li.classList.add('ic-row-failed');
          }
        } catch (error) {
          failed++;
          if (li) li.classList.add('ic-row-failed');
          console.error('[InvenClear] 삭제 실패', cmtidx, error);
        }
        await sleep(1000 + Math.random() * 3000);
      }
      progressEl.textContent = `완료 — 성공 ${done}건, 실패 ${failed}건. 잠시 후 새로고침합니다.`;
      setTimeout(() => location.reload(), 1500);
    });

    updateState();
  }

  invenClear.features = invenClear.features || {};
  invenClear.features.comments = { initComments };
})(globalThis);
