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
        accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.zip,.rar',
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
          const result = await DB.uploadFile(file);
          linkInput.value = result.url;
          uploadedFileName = result.name;
          fileNameLabel.textContent = '✅ ' + result.name;
          if (!titleInput.value.trim()) {
            const baseName = result.name.replace(/\.[^.]+$/, '');
            titleInput.value = baseName;
          }
          Utils.toast('文件上传成功', 'success');
        } catch (err) {
          Utils.toast('上传失败：' + err.message, 'error');
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
      submitBtn.addEventListener('click', () => {
        const title = titleInput.value.trim();
        const link = linkInput.value.trim();
        if (!title) { Utils.toast('请填写文档标题', 'error'); return; }
        if (!link) { Utils.toast('请填写文档链接', 'error'); return; }
        try {
          DB.addDoc({
            title, content: contentInput.value.trim(), link,
            category: categorySelect.value, is_pinned: pinCheckbox.checked,
          });
          Utils.toast('文档已发布', 'success');
          titleInput.value = ''; contentInput.value = ''; linkInput.value = ''; pinCheckbox.checked = false;
          ScoreApp.navigate('docs');
        } catch (e) { Utils.toast('发布失败：' + e.message, 'error'); }
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

        // 头部：分类标签 + 时间
        card.appendChild(Utils.el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px' } }, [
          Utils.el('span', { style: { background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' } }, [
            (isPinned ? '📌 ' : '') + (d.category || '其他'),
          ]),
          Utils.el('span', { style: { color: 'var(--text-soft)', fontSize: '12px' } }, [
            d.created_at ? d.created_at.slice(0, 16).replace('T', ' ') : '',
          ]),
        ]));

        // 标题
        card.appendChild(Utils.el('div', { style: { fontWeight: '700', fontSize: '16px', marginBottom: '6px' } }, [d.title || '无标题']));

        // 描述
        if (d.content) {
          card.appendChild(Utils.el('div', { style: { color: 'var(--text-soft)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.6', marginBottom: '8px', fontSize: '14px' } }, [d.content]));
        }

        // 链接 + 文件预览
        if (d.link) {
          const isUrl = /^https?:\/\//i.test(d.link);
          const ext = (d.link.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|jpg|jpeg|png|gif|webp|zip|rar)(\?|$)/i) || [])[1] || '';

          if (isUrl) {
            // 文件预览区
            if (ext === 'pdf') {
              // PDF 内嵌预览
              card.appendChild(Utils.el('div', { style: { marginTop: '10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' } }, [
                Utils.el('iframe', {
                  src: d.link, style: { width: '100%', height: '400px', border: 'none' },
                }),
              ]));
            } else if (/^(doc|docx|xls|xlsx|ppt|pptx)$/i.test(ext)) {
              // Word/Excel/PPT 用 Office Online 预览
              card.appendChild(Utils.el('div', { style: { marginTop: '10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' } }, [
                Utils.el('iframe', {
                  src: 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(d.link),
                  style: { width: '100%', height: '400px', border: 'none' },
                }),
              ]));
            } else if (/^(jpg|jpeg|png|gif|webp)$/i.test(ext)) {
              // 图片预览
              card.appendChild(Utils.el('img', {
                src: d.link, alt: d.title || '文档图片',
                style: { maxWidth: '100%', borderRadius: '8px', marginTop: '10px', display: 'block' },
              }));
            }

            // 下载按钮（所有文件类型）
            const btnRow = Utils.el('div', { style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } });
            btnRow.appendChild(Utils.el('a', {
              href: d.link, target: '_blank', rel: 'noopener noreferrer', download: '',
              class: 'btn btn-primary btn-sm',
              style: { textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' },
            }, ['📥 下载文件' + (ext ? '（' + ext.toUpperCase() + '）' : '')]));

            // 打印按钮（PDF在新标签打开后可直接 Ctrl+P 打印）
            if (ext === 'pdf') {
              btnRow.appendChild(Utils.el('button', {
                class: 'btn btn-ghost btn-sm',
                onclick: () => window.open(d.link, '_blank'),
              }, ['🖨️ 打印']));
            }
            // Word/Excel 提示下载后打印
            if (/^(doc|docx|xls|xlsx|ppt|pptx)$/i.test(ext)) {
              btnRow.appendChild(Utils.el('span', { style: { fontSize: '12px', color: 'var(--text-soft)', alignSelf: 'center' } }, ['（下载后可打印）']));
            }
            card.appendChild(btnRow);
          } else {
            card.appendChild(Utils.el('span', { style: { display: 'inline-block', marginTop: '8px', color: 'var(--text-soft)', wordBreak: 'break-all', fontSize: '14px' } }, ['🔗 ' + d.link]));
          }
        }

        // 删除按钮（管理员）
        if (ScoreApp.isAdmin) {
          const delBtn = Utils.el('button', {
            class: 'btn btn-danger btn-sm',
            style: { marginTop: '8px', padding: '2px 10px', fontSize: '12px' },
          }, ['🗑 删除']);
          delBtn.addEventListener('click', () => {
            if (!Utils.confirm('确认删除这篇文档？')) return;
            DB.deleteDoc(d.id);
            Utils.toast('已删除', 'info');
            renderList();
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
