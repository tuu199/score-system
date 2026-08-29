/* ============================================================
 * modules/docs.js - 【文档中心】模块（学生查看 + 管理员发布）
 *   发布学习资料、通知文档、规章制度等
 *   管理员发布的文档可置顶显示
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'docs';
  const MOD_NAME = '文档中心';
  const MOD_ICON = '📑';

  const CATEGORIES = ['学习资料', '通知公告', '规章制度', '其他'];

  function mount(view) {
    // 顶部说明
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['📑 文档中心']),
      Utils.el('p', { style: { color: 'var(--text-soft)', fontSize: '14px', margin: '8px 0' } }, [
        '查看学习资料、通知公告、规章制度等文档。管理员发布的文档可置顶显示。',
      ]),
    ]));

    // 管理员发布区（仅管理员可见）
    if (ScoreApp.isAdmin) {
      const formCard = Utils.el('div', { class: 'card', style: { borderLeft: '4px solid #3b82f6' } });
      formCard.appendChild(Utils.el('div', { class: 'card-title' }, ['📝 发布文档（管理员）']));

      const titleInput = Utils.el('input', {
        class: 'form-input', type: 'text', placeholder: '文档标题（如：本周学习计划）', id: 'doc-title',
      });
      formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
        Utils.el('label', {}, ['标题']), titleInput,
      ]));

      const categorySelect = Utils.el('select', { class: 'form-input', id: 'doc-category' });
      CATEGORIES.forEach(c => {
        categorySelect.appendChild(Utils.el('option', { value: c }, [c]));
      });
      formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
        Utils.el('label', {}, ['分类']), categorySelect,
      ]));

      const contentInput = Utils.el('textarea', {
        class: 'form-input', placeholder: '文档描述（可选，简要说明文档内容）',
        id: 'doc-content', rows: 3, style: { width: '100%', resize: 'vertical' },
      });
      formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
        Utils.el('label', {}, ['描述']), contentInput,
      ]));

      const linkInput = Utils.el('input', {
        class: 'form-input', type: 'text', placeholder: '文档链接（网盘/文档网址，或上传文件后自动填充）', id: 'doc-link',
      });
      formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
        Utils.el('label', {}, ['链接']), linkInput,
      ]));

      // 文件上传（Word/PDF/Excel/PPT 等）
      let uploadedFileName = '';
      const fileInput = Utils.el('input', {
        type: 'file', id: 'doc-file',
        accept: '.pdf,.doc,.docx,.docm,.dot,.dotx,.dotm,.xls,.xlsx,.xlsm,.xlsb,.xlt,.xltx,.csv,.ppt,.pptx,.pptm,.pot,.potx,.pps,.ppsx,.rtf,.txt,.jpg,.jpeg,.png,.gif,.webp,.svg,.zip,.rar,.7z,.msg',
        style: { display: 'none' },
      });
      const fileBtn = Utils.el('button', {
        class: 'btn btn-ghost btn-sm',
        type: 'button',
        style: { marginTop: '4px' },
      }, ['📎 上传文件']);
      const fileNameLabel = Utils.el('span', { id: 'doc-file-name', style: { fontSize: '13px', color: 'var(--text-soft)', marginLeft: '8px' } }, []);
      fileBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
          Utils.toast('文件不能超过50MB', 'error');
          fileInput.value = '';
          return;
        }
        fileBtn.textContent = '⏳ 上传中…';
        fileBtn.disabled = true;
        try {
          const publicUrl = await DB.uploadFile(file);
          if (!publicUrl) throw new Error('未返回公开链接');
          linkInput.value = publicUrl;
          uploadedFileName = file.name;
          fileNameLabel.textContent = '✅ ' + file.name;
          if (!titleInput.value.trim()) {
            const baseName = file.name.replace(/\.[^.]+$/, '');
            titleInput.value = baseName;
          }
          Utils.toast('文件上传成功', 'success');
        } catch (err) {
          Utils.toast('上传失败：' + (err.message || String(err)), 'error');
        }
        fileBtn.textContent = '📎 上传文件';
        fileBtn.disabled = false;
        fileInput.value = '';
      });
      formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
        Utils.el('label', {}, ['文件']), fileBtn, fileInput, fileNameLabel,
      ]));

      const pinCheckbox = Utils.el('input', { type: 'checkbox', id: 'doc-pin', style: { marginRight: '6px' } });
      const pinLabel = Utils.el('label', { style: { display: 'flex', alignItems: 'center', cursor: 'pointer' } }, [pinCheckbox, Utils.el('span', {}, ['📌 置顶显示'])]);
      formCard.appendChild(Utils.el('div', { class: 'form-row' }, [pinLabel]));

      const submitBtn = Utils.el('button', {
        class: 'btn btn-primary',
        style: { marginTop: '10px', width: '100%' },
      }, ['📝 发布文档']);
      let _submitting = false;
      submitBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        const link = linkInput.value.trim();
        if (!title) { Utils.toast('请填写文档标题', 'error'); return; }
        if (!link) { Utils.toast('请填写文档链接', 'error'); return; }
        if (_submitting) return;
        _submitting = true; submitBtn.disabled = true;
        const orig = submitBtn.textContent;
        submitBtn.textContent = '保存中…';
        try {
          await DB.addDoc({
            title, content: contentInput.value.trim(), link,
            category: categorySelect.value, is_pinned: pinCheckbox.checked,
          });
          Utils.toast('文档已发布', 'success');
          titleInput.value = ''; contentInput.value = ''; linkInput.value = ''; pinCheckbox.checked = false;
          renderList();
        } catch (e) {
          Utils.toast('发布失败：' + e.message, 'error');
          _submitting = false; submitBtn.disabled = false; submitBtn.textContent = orig;
        }
      });
      formCard.appendChild(submitBtn);
      view.appendChild(formCard);
    }

    // 分类筛选
    const filterRow = Utils.el('div', { class: 'filter-row', style: { display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' } });
    const categoryFilter = Utils.el('select', { class: 'form-input', style: { width: 'auto' } });
    categoryFilter.appendChild(Utils.el('option', { value: '', selected: true }, ['全部分类']));
    CATEGORIES.forEach(c => {
      categoryFilter.appendChild(Utils.el('option', { value: c }, [c]));
    });
    filterRow.appendChild(Utils.el('span', { style: { fontSize: '14px', color: 'var(--text-soft)' } }, ['分类：']));
    filterRow.appendChild(categoryFilter);
    view.appendChild(filterRow);

    // 文档列表
    const listContainer = Utils.el('div', { id: 'docs-list' });
    view.appendChild(listContainer);

    function renderList() {
      const filterCategory = categoryFilter.value;
      let list = DB.listDocs(filterCategory ? { category: filterCategory } : {});

      // 置顶优先 + 时间倒序（listDocs 已排序，筛选后仍保持）
      listContainer.innerHTML = '';

      if (list.length === 0) {
        listContainer.appendChild(Utils.el('div', { class: 'card', style: { textAlign: 'center', color: 'var(--text-soft)', padding: '40px' } }, [
          '📭 暂无文档',
        ]));
        return;
      }

      list.forEach(d => {
        const isPinned = d.is_pinned === 1;
        const card = Utils.el('div', {
          class: 'doc-card',
          style: isPinned
            ? { borderLeft: '4px solid #3b82f6', background: '#eff6ff', marginBottom: '12px', padding: '12px', borderRadius: '8px' }
            : { marginBottom: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' },
        });

        // 头部：分类标签 + 时间（textContent 防 XSS）
        const catSpan = Utils.el('span', { style: { background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' } });
        catSpan.textContent = (isPinned ? '📌 ' : '') + (d.category || '其他');
        const timeSpan = Utils.el('span', { style: { color: 'var(--text-soft)', fontSize: '12px' } });
        timeSpan.textContent = d.created_at ? d.created_at.slice(0, 16).replace('T', ' ') : '';
        card.appendChild(Utils.el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px' } }, [catSpan, timeSpan]));

        // 标题
        const titleEl = Utils.el('div', { style: { fontWeight: '700', fontSize: '16px', marginBottom: '6px' } });
        titleEl.textContent = d.title || '无标题';
        card.appendChild(titleEl);

        // 描述
        if (d.content) {
          const descEl = Utils.el('div', { style: { color: 'var(--text-soft)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.6', marginBottom: '8px', fontSize: '14px' } });
          descEl.textContent = d.content;
          card.appendChild(descEl);
        }

        // 链接 / 预览：H-3 白名单协议
        if (d.link) {
          const safeLink = Utils.sanitizeUrl(d.link, { allowImageData: true });
          const ext = safeLink ? ((safeLink.match(/\.(pdf|doc|docx|docm|dot|dotx|dotm|xls|xlsx|xlsm|xlsb|xlt|xltx|csv|ppt|pptx|pptm|pot|potx|pps|ppsx|rtf|txt|jpg|jpeg|png|gif|webp|svg|zip|rar|7z|msg)(\?|#|$)/i) || [])[1] || '') : '';
          if (safeLink && /^https?:\/\//i.test(safeLink)) {
            // PDF 内嵌预览
            if (ext === 'pdf') {
              card.appendChild(Utils.el('div', { style: { marginTop: '10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' } }, [
                Utils.el('iframe', {
                  src: safeLink,
                  style: { width: '100%', height: '400px', border: 'none' },
                  referrerpolicy: 'no-referrer', sandbox: 'allow-same-origin allow-scripts allow-popups',
                }),
              ]));
            } else if (/^(doc|docx|docm|dot|dotx|dotm|xls|xlsx|xlsm|xlsb|xlt|xltx|csv|ppt|pptx|pptm|pot|potx|pps|ppsx|rtf|msg)$/i.test(ext)) {
              // Word / Excel / PPT / RTF / Outlook MSG 走微软 Office Online 预览
              const officeWrap = Utils.el('div', { style: { marginTop: '10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', background: '#f8fafc' } });
              const openHint = Utils.el('div', { style: { padding: '8px 10px', fontSize: '12px', color: 'var(--text-soft)', background: '#f1f5f9', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } });
              const leftHint = Utils.el('span');
              leftHint.textContent = '💡 Office 在线预览 · 若预览空白，点击右侧「新窗口打开」或下载后查看';
              const openNewBtn = Utils.el('a', {
                href: 'https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(safeLink),
                target: '_blank', rel: 'noopener noreferrer',
                class: 'btn btn-ghost btn-sm',
                style: { textDecoration: 'none', padding: '2px 8px', fontSize: '12px' },
              });
              openNewBtn.textContent = '🔗 新窗口打开';
              openHint.appendChild(leftHint);
              openHint.appendChild(openNewBtn);
              officeWrap.appendChild(openHint);
              officeWrap.appendChild(Utils.el('iframe', {
                src: 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(safeLink),
                title: (d.title || 'Office 文档') + ' 在线预览',
                style: { width: '100%', height: '440px', border: 'none' },
                referrerpolicy: 'no-referrer',
                sandbox: 'allow-same-origin allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation',
                loading: 'lazy',
              }));
              card.appendChild(officeWrap);
            } else if (/^(jpg|jpeg|png|gif|webp|svg)$/i.test(ext)) {
              const im = Utils.el('img', {
                style: { maxWidth: '100%', borderRadius: '8px', marginTop: '10px', display: 'block' },
                loading: 'lazy', referrerpolicy: 'no-referrer',
              });
              im.src = safeLink;
              im.alt = d.title || '文档图片';
              card.appendChild(im);
            }

            const btnRow = Utils.el('div', { style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } });
            const downloadBtn = Utils.el('a', {
              href: safeLink, target: '_blank', rel: 'noopener noreferrer', download: '',
              class: 'btn btn-primary btn-sm',
              style: { textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' },
            });
            downloadBtn.textContent = '📥 下载文件' + (ext ? '（' + ext.toUpperCase() + '）' : '');
            btnRow.appendChild(downloadBtn);

            if (ext === 'pdf') {
              const printBtn = Utils.el('button', { class: 'btn btn-ghost btn-sm' });
              printBtn.textContent = '🖨️ 打印';
              printBtn.addEventListener('click', () => window.open(safeLink, '_blank', 'noopener,noreferrer'));
              btnRow.appendChild(printBtn);
            }
            if (/^(doc|docx|docm|dot|dotx|dotm|xls|xlsx|xlsm|xlsb|xlt|xltx|csv|ppt|pptx|pptm|pot|potx|pps|ppsx|rtf|msg)$/i.test(ext)) {
              const tip = Utils.el('span', { style: { fontSize: '12px', color: 'var(--text-soft)', alignSelf: 'center' } });
              tip.textContent = '（下载后可打印，Word/Excel 预览空白可点「新窗口打开」）';
              btnRow.appendChild(tip);
            }
            card.appendChild(btnRow);
          } else if (safeLink) {
            const plain = Utils.el('span', { style: { display: 'inline-block', marginTop: '8px', color: 'var(--text-soft)', wordBreak: 'break-all', fontSize: '14px' } });
            plain.textContent = '🔗 ' + d.link;
            card.appendChild(plain);
          } else if (!safeLink) {
            const plain = Utils.el('span', { style: { display: 'inline-block', marginTop: '8px', color: 'var(--text-soft)', wordBreak: 'break-all', fontSize: '14px' } });
            plain.textContent = '🔗 ' + d.link;
            card.appendChild(plain);
          }
        }

        // 删除按钮（管理员，async + 锁）
        if (ScoreApp.isAdmin) {
          const delBtn = Utils.el('button', {
            class: 'btn btn-danger btn-sm',
            style: { marginTop: '8px', padding: '2px 10px', fontSize: '12px' },
          });
          delBtn.textContent = '🗑 删除';
          delBtn.addEventListener('click', async () => {
            if (!Utils.confirm('确认删除这篇文档？')) return;
            if (delBtn.dataset.locked) return;
            delBtn.dataset.locked = '1'; delBtn.disabled = true;
            try {
              await DB.deleteDoc(d.id);
              Utils.toast('已删除', 'info');
              renderList();
            } catch (e) {
              Utils.toast('删除失败：' + e.message, 'error');
              delBtn.disabled = false; delBtn.dataset.locked = '';
            }
          });
          card.appendChild(delBtn);
        }

        listContainer.appendChild(card);
      });
    }

    categoryFilter.addEventListener('change', renderList);
    renderList();
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, adminOnly: false });
})();
