/* PureInvest OS 1.9.22 — compact recent transactions + honest attachment affordance */
(() => {
  'use strict';

  const ROOT_ID = 'transactionsDashboard';
  const DEAD = new Set(['', '#', 'javascript:void(0)', 'javascript:void(0);', 'about:blank']);

  const normalized = (value) => String(value ?? '').trim();
  const cleanText = (value) => normalized(value).replace(/\s+/g, ' ');
  const isEdit = (el) => /^edytuj$/i.test(cleanText(el?.textContent));
  const isDelete = (el) => /^usuń$/i.test(cleanText(el?.textContent));
  const isAttachmentText = (el) => /^(?:📎\s*)?(?:załącznik|otwórz załącznik)$/i.test(cleanText(el?.textContent));

  function usableUrl(value) {
    const url = normalized(value);
    if (!url || DEAD.has(url.toLowerCase())) return '';
    if (/^javascript:/i.test(url)) return '';
    return url;
  }

  function inferAttachmentUrl(el) {
    if (!el) return '';
    const attrs = [
      el.getAttribute?.('href'),
      el.getAttribute?.('data-url'),
      el.getAttribute?.('data-href'),
      el.getAttribute?.('data-attachment-url'),
      el.dataset?.url,
      el.dataset?.href,
      el.dataset?.attachmentUrl
    ];
    return attrs.map(usableUrl).find(Boolean) || '';
  }

  function findActionGroup(row) {
    const buttons = [...row.querySelectorAll('button')];
    const edit = buttons.find(isEdit);
    const del = buttons.find(isDelete);
    if (!edit || !del) return null;

    let group = edit.parentElement;
    if (!group || !group.contains(del)) {
      const candidates = [edit.parentElement, edit.parentElement?.parentElement, row];
      group = candidates.find(node => node && node.contains(edit) && node.contains(del)) || null;
    }
    if (group && group !== row) group.classList.add('pi-transaction-actions');
    return group;
  }

  function findRowForButton(button, root) {
    const known = button.closest('.transaction, .transaction-item, [data-transaction-id], .pi-transaction');
    if (known && root.contains(known)) return known;

    let node = button.parentElement;
    for (let i = 0; node && node !== root && i < 6; i += 1, node = node.parentElement) {
      const text = cleanText(node.textContent);
      const hasEdit = [...node.querySelectorAll('button')].some(isEdit);
      const hasDelete = [...node.querySelectorAll('button')].some(isDelete);
      const hasAmount = /[+−-]?\s*\d[\d\s.,]*\s*zł/i.test(text);
      if (hasEdit && hasDelete && hasAmount) return node;
    }
    return null;
  }

  function markAmount(row) {
    const direct = row.querySelector('.plus, .minus, .transaction-amount, .pi-amount, [data-amount]');
    if (direct) {
      direct.classList.add('pi-transaction-amount');
      return;
    }
    const candidates = [...row.querySelectorAll('div,span,strong,b')];
    const amount = candidates.find(el => /^[+−-]?\s*\d[\d\s.,]*\s*zł$/i.test(cleanText(el.textContent)));
    amount?.classList.add('pi-transaction-amount');
  }

  function normalizeAttachment(node) {
    if (!isAttachmentText(node)) return;

    const url = inferAttachmentUrl(node);
    const name = normalized(node.getAttribute?.('data-attachment-name') || node.dataset?.attachmentName);
    const path = normalized(node.getAttribute?.('data-attachment-path') || node.dataset?.attachmentPath);
    const hasMetadata = !!(name || path);

    // Sam URL nie oznacza, że istnieje plik. Stare rekordy mogły zachować
    // pusty/techniczny URL bez nazwy i ścieżki — takiego wpisu nie pokazujemy.
    if (!url || !hasMetadata) {
      node.dataset.piDeadAttachment = 'true';
      node.setAttribute('aria-hidden', 'true');
      node.hidden = true;
      node.style.display = 'none';
      return;
    }

    if (node.tagName === 'A') {
      node.href = url;
      node.hidden = false;
      node.style.removeProperty('display');
      node.classList.add('pi-attachment-link');
      node.textContent = '📎 ' + (name || 'Otwórz załącznik');
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
      return;
    }

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = `${node.className || ''} pi-attachment-link`.trim();
    link.dataset.attachmentName = name;
    link.dataset.attachmentPath = path;
    link.textContent = '📎 ' + (name || 'Otwórz załącznik');
    node.replaceWith(link);
  }

  function processRow(row) {
    if (!row) return;
    row.classList.add('pi-transaction-compact');
    findActionGroup(row);
    markAmount(row);

    const attachmentCandidates = [...row.querySelectorAll('a,button,span,div')]
      .filter(isAttachmentText);
    attachmentCandidates.forEach(normalizeAttachment);
  }

  function apply(root) {
    if (!root) return;

    const knownRows = [...root.querySelectorAll('.transaction, .transaction-item, [data-transaction-id], .pi-transaction')];
    knownRows.forEach(processRow);

    [...root.querySelectorAll('button')]
      .filter(button => isEdit(button) || isDelete(button))
      .map(button => findRowForButton(button, root))
      .filter(Boolean)
      .forEach(processRow);

    // Also clean dead attachment labels even if the row uses an unknown wrapper.
    [...root.querySelectorAll('a,button,span,div')]
      .filter(isAttachmentText)
      .forEach(normalizeAttachment);
  }

  function start() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;

    apply(root);
    let queued = false;
    const observer = new MutationObserver((mutations) => {
      if (queued) return;
      const hasAddedElements = mutations.some(mutation =>
        Array.from(mutation.addedNodes || []).some(node => node && node.nodeType === 1)
      );
      if (!hasAddedElements) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        observer.disconnect();
        try { apply(root); } finally { observer.observe(root, { childList: true, subtree: true }); }
      }, 40);
    });
    observer.observe(root, { childList: true, subtree: true });
    return true;
  }

  if (!start()) {
    const wait = new MutationObserver(() => {
      if (start()) wait.disconnect();
    });
    wait.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
