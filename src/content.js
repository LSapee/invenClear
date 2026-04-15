(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const my = params.get('my');
  if (my !== 'post' && my !== 'opi') return;

  const pathMatch = location.pathname.match(/^\/board\/([^/]+)\/(\d+)/);
  if (!pathMatch) return;
  const boardSlug = pathMatch[1];
  const comeIdx = pathMatch[2];
  const page = params.get('p') || '1';

  function findListTable() {
    const tables = document.querySelectorAll('table');
    for (const t of tables) {
      if (
        t.querySelector('tbody tr td.num') &&
        t.querySelector('tbody tr td.tit a.subject-link')
      ) {
        return t;
      }
    }
    return null;
  }

  function getArticleId(tr) {
    const numSpan = tr.querySelector('td.num span');
    if (numSpan) return numSpan.textContent.trim();
    const link = tr.querySelector('td.tit a.subject-link');
    if (link) {
      const m = link.getAttribute('href').match(/\/board\/[^/]+\/\d+\/(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  const table = findListTable();
  if (!table) return;
  if (table.dataset.invenClear === 'true') return;
  table.dataset.invenClear = 'true';

  const theadRow = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');
  if (!theadRow || !tbody) return;

  const colgroup = table.querySelector('colgroup');
  if (colgroup) {
    const col = document.createElement('col');
    col.className = 'ic-col';
    colgroup.insertBefore(col, colgroup.firstChild);
  }

  if (my === 'post') runPostMode();
  else runOpiMode();

  // ─────────────────────────────────────────────
  //  my=post : 글 체크박스 + 벌크 삭제
  // ─────────────────────────────────────────────
  function runPostMode() {
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
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'ic-check-row';
        cb.dataset.postId = postId;
        td.appendChild(cb);
      }
      tr.insertBefore(td, tr.firstChild);
    });

    const bar = document.createElement('div');
    bar.className = 'ic-action-bar';
    bar.innerHTML = `
      <span class="ic-label">InvenClear</span>
      <span class="ic-status">선택 <b class="ic-count">0</b>개</span>
      <button type="button" class="ic-btn ic-btn-delete" disabled>선택 삭제</button>
      <span class="ic-progress" aria-live="polite"></span>
    `;
    table.parentNode.insertBefore(bar, table);

    const countEl = bar.querySelector('.ic-count');
    const btnDelete = bar.querySelector('.ic-btn-delete');
    const progressEl = bar.querySelector('.ic-progress');

    function getCheckedBoxes() {
      return [...tbody.querySelectorAll('.ic-check-row:checked')];
    }

    function updateState() {
      const checked = getCheckedBoxes();
      countEl.textContent = String(checked.length);
      btnDelete.disabled = checked.length === 0;
      const all = tbody.querySelectorAll('.ic-check-row');
      allCheckbox.checked = all.length > 0 && checked.length === all.length;
      allCheckbox.indeterminate = checked.length > 0 && checked.length < all.length;
    }

    allCheckbox.addEventListener('change', () => {
      tbody.querySelectorAll('.ic-check-row').forEach((cb) => {
        cb.checked = allCheckbox.checked;
      });
      updateState();
    });

    tbody.addEventListener('change', (e) => {
      if (e.target.classList && e.target.classList.contains('ic-check-row')) {
        updateState();
      }
    });

    async function deleteOnePost(postId) {
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

    btnDelete.addEventListener('click', async () => {
      const checked = getCheckedBoxes();
      if (checked.length === 0) return;
      const msg = `선택한 ${checked.length}개의 글을 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`;
      if (!confirm(msg)) return;

      btnDelete.disabled = true;
      allCheckbox.disabled = true;
      let done = 0;
      let failed = 0;

      for (let i = 0; i < checked.length; i++) {
        const cb = checked[i];
        const postId = cb.dataset.postId;
        progressEl.textContent = `${i + 1} / ${checked.length} 처리 중 (#${postId})`;
        try {
          const ok = await deleteOnePost(postId);
          const row = cb.closest('tr');
          if (ok) {
            done++;
            if (row) row.classList.add('ic-row-deleted');
            cb.disabled = true;
          } else {
            failed++;
            if (row) row.classList.add('ic-row-failed');
          }
        } catch (err) {
          failed++;
          const row = cb.closest('tr');
          if (row) row.classList.add('ic-row-failed');
          console.error('[InvenClear] 삭제 실패', postId, err);
        }
        await sleep(300);
      }

      progressEl.textContent = `완료 — 성공 ${done}건, 실패 ${failed}건. 잠시 후 새로고침합니다.`;
      setTimeout(() => location.reload(), 1500);
    });

    updateState();
  }

  // ─────────────────────────────────────────────
  //  my=opi : 내 댓글 보기 + 개별/벌크 삭제
  // ─────────────────────────────────────────────
  function runOpiMode() {
    const thBtn = document.createElement('th');
    thBtn.className = 'ic-col';
    thBtn.textContent = '내 댓글';
    theadRow.insertBefore(thBtn, theadRow.firstChild);

    tbody.querySelectorAll('tr').forEach((tr) => {
      const articleId = getArticleId(tr);
      const td = document.createElement('td');
      td.className = 'ic-col';
      if (articleId) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ic-btn ic-btn-view';
        btn.textContent = '댓글 보기';
        btn.dataset.articleId = articleId;
        btn.addEventListener('click', () => toggleExpand(tr, articleId, btn));
        td.appendChild(btn);
      }
      tr.insertBefore(td, tr.firstChild);
    });

    const bar = document.createElement('div');
    bar.className = 'ic-action-bar';
    bar.innerHTML = `
      <span class="ic-label">InvenClear — 내 댓글</span>
      <span class="ic-status">각 글의 <b>"댓글 보기"</b>를 눌러 삭제할 댓글을 선택하세요.</span>
    `;
    table.parentNode.insertBefore(bar, table);
  }

  async function toggleExpand(tr, articleId, btn) {
    const existing = tr.nextElementSibling;
    if (existing && existing.classList.contains('ic-opi-expand')) {
      existing.remove();
      btn.textContent = '댓글 보기';
      return;
    }

    btn.disabled = true;
    btn.textContent = '로딩 중...';

    const expandTr = document.createElement('tr');
    expandTr.className = 'ic-opi-expand';
    const expandTd = document.createElement('td');
    expandTd.colSpan = (tr.children.length || 7);
    expandTd.className = 'ic-opi-expand-cell';
    expandTd.textContent = '불러오는 중...';
    expandTr.appendChild(expandTd);
    tr.after(expandTr);

    try {
      const { token, comments } = await fetchMyComments(articleId);
      if (!token) throw new Error('토큰을 찾지 못했습니다.');
      renderCommentList(expandTd, articleId, token, comments);
      btn.textContent = '닫기';
    } catch (err) {
      console.error('[InvenClear] 댓글 로드 실패', err);
      expandTd.textContent = `댓글을 불러오지 못했습니다: ${err.message}`;
      btn.textContent = '다시 시도';
    } finally {
      btn.disabled = false;
    }
  }

  async function fetchMyComments(articleId) {
    const url = `/board/${boardSlug}/${comeIdx}/${articleId}?my=opi`;

    const htmlPromise = fetch(url, { credentials: 'include' }).then((r) => r.text());
    const commentsPromise = loadCommentsViaIframe(url);

    const [html, comments] = await Promise.all([htmlPromise, commentsPromise]);
    const tokenMatch = html.match(/cmtTokenKey\s*[:=]\s*['"]([a-f0-9]{32})['"]/);
    const token = tokenMatch ? tokenMatch[1] : null;
    return { token, comments };
  }

  function loadCommentsViaIframe(url) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText =
        'position:absolute;left:-9999px;top:0;width:800px;height:600px;border:0;visibility:hidden';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.src = url;

      let settled = false;
      const cleanup = () => iframe.parentNode && iframe.remove();
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('댓글 로딩 타임아웃 (15초)'));
      }, 15000);

      iframe.addEventListener('load', () => {
        let tries = 0;
        const maxTries = 30;
        const poll = setInterval(() => {
          tries++;
          let doc;
          try {
            doc = iframe.contentDocument;
          } catch (e) {
            clearInterval(poll);
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            cleanup();
            reject(new Error('iframe 접근 실패'));
            return;
          }
          if (!doc) return;
          const rows = [...doc.querySelectorAll('li.row[id^="cmt"]')];
          const cmtBody = doc.querySelector('#cmt, #powerbbsCmt2, .commentContainer');
          const ready = rows.length > 0 || (cmtBody && tries > 3);
          if (ready || tries >= maxTries) {
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
              const isReply = li.classList.contains('replyCmt');
              return { cmtidx, content, isReply };
            });
            cleanup();
            resolve(comments);
          }
        }, 300);
      });

      document.body.appendChild(iframe);
    });
  }

  function renderCommentList(container, articleId, token, comments) {
    container.textContent = '';

    if (comments.length === 0) {
      container.textContent = '삭제 가능한 내 댓글이 없습니다.';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'ic-opi-wrap';

    const header = document.createElement('div');
    header.className = 'ic-opi-header';
    const allCb = document.createElement('input');
    allCb.type = 'checkbox';
    allCb.className = 'ic-check-all';
    const headerLabel = document.createElement('label');
    headerLabel.className = 'ic-opi-header-label';
    headerLabel.appendChild(allCb);
    headerLabel.appendChild(document.createTextNode(' 전체 선택'));

    const countEl = document.createElement('span');
    countEl.className = 'ic-opi-count';
    countEl.innerHTML = `선택 <b>0</b> / ${comments.length}`;

    const btnBulk = document.createElement('button');
    btnBulk.type = 'button';
    btnBulk.className = 'ic-btn ic-btn-delete';
    btnBulk.textContent = '선택 삭제';
    btnBulk.disabled = true;

    const progressEl = document.createElement('span');
    progressEl.className = 'ic-progress';

    header.appendChild(headerLabel);
    header.appendChild(countEl);
    header.appendChild(btnBulk);
    header.appendChild(progressEl);
    wrap.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'ic-opi-list';

    comments.forEach((c) => {
      const li = document.createElement('li');
      li.className = 'ic-opi-item';
      li.dataset.cmtidx = c.cmtidx;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ic-check-row';
      cb.dataset.cmtidx = c.cmtidx;

      const body = document.createElement('div');
      body.className = 'ic-opi-body';
      if (c.isReply) {
        const tag = document.createElement('span');
        tag.className = 'ic-opi-tag';
        tag.textContent = '답글';
        body.appendChild(tag);
      }
      const text = document.createElement('span');
      text.className = 'ic-opi-text';
      text.textContent = truncate(c.content, 120) || '(내용 없음)';
      text.title = c.content;
      body.appendChild(text);

      const btnOne = document.createElement('button');
      btnOne.type = 'button';
      btnOne.className = 'ic-btn ic-btn-del-one';
      btnOne.textContent = '삭제';

      btnOne.addEventListener('click', async () => {
        if (!confirm('이 댓글을 삭제할까요?')) return;
        btnOne.disabled = true;
        cb.disabled = true;
        try {
          const ok = await deleteOneComment(articleId, c.cmtidx, token);
          if (ok) {
            li.classList.add('ic-row-deleted');
          } else {
            li.classList.add('ic-row-failed');
            btnOne.disabled = false;
            cb.disabled = false;
          }
        } catch (err) {
          console.error('[InvenClear] 댓글 삭제 실패', err);
          li.classList.add('ic-row-failed');
          btnOne.disabled = false;
          cb.disabled = false;
        }
        updateState();
      });

      li.appendChild(cb);
      li.appendChild(body);
      li.appendChild(btnOne);
      list.appendChild(li);
    });

    wrap.appendChild(list);
    container.appendChild(wrap);

    function getCheckedItems() {
      return [...list.querySelectorAll('.ic-check-row:checked')].filter(
        (cb) => !cb.closest('li.ic-row-deleted')
      );
    }

    function updateState() {
      const checked = getCheckedItems();
      countEl.innerHTML = `선택 <b>${checked.length}</b> / ${comments.length}`;
      btnBulk.disabled = checked.length === 0;
      const all = [...list.querySelectorAll('.ic-check-row')].filter(
        (cb) => !cb.disabled
      );
      allCb.checked = all.length > 0 && checked.length === all.length;
      allCb.indeterminate = checked.length > 0 && checked.length < all.length;
    }

    allCb.addEventListener('change', () => {
      list.querySelectorAll('.ic-check-row').forEach((cb) => {
        if (!cb.disabled) cb.checked = allCb.checked;
      });
      updateState();
    });

    list.addEventListener('change', (e) => {
      if (e.target.classList && e.target.classList.contains('ic-check-row')) {
        updateState();
      }
    });

    btnBulk.addEventListener('click', async () => {
      const checked = getCheckedItems();
      if (checked.length === 0) return;
      if (!confirm(`선택한 ${checked.length}개 댓글을 삭제합니다. 계속할까요?`)) return;

      btnBulk.disabled = true;
      allCb.disabled = true;
      let done = 0;
      let failed = 0;

      for (let i = 0; i < checked.length; i++) {
        const cb = checked[i];
        const cmtidx = cb.dataset.cmtidx;
        const li = cb.closest('li');
        progressEl.textContent = `${i + 1} / ${checked.length} 처리 중 (#${cmtidx})`;
        try {
          const ok = await deleteOneComment(articleId, cmtidx, token);
          if (ok) {
            done++;
            li.classList.add('ic-row-deleted');
            cb.disabled = true;
          } else {
            failed++;
            li.classList.add('ic-row-failed');
          }
        } catch (err) {
          failed++;
          li.classList.add('ic-row-failed');
          console.error('[InvenClear] 삭제 실패', cmtidx, err);
        }
        await sleep(300);
      }

      progressEl.textContent = `완료 — 성공 ${done}건, 실패 ${failed}건`;
      allCb.disabled = false;
      updateState();
    });

    updateState();
  }

  async function deleteOneComment(articleId, cmtidx, token) {
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

  function truncate(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
