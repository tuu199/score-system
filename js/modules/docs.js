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
        class: 'form-input', type: 'text', placeholder: '文档链接（网盘/文档网址，必填）', id: 'doc-link',
      });
      formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
        Utils.el('label', {}, ['链接']), linkInput,
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

        // 链接
        if (d.link) {
          if (/^https?:\/\//i.test(d.link)) {
            card.appendChild(Utils.el('a', {
              href: d.link, target: '_blank', rel: 'noopener noreferrer',
              style: { display: 'inline-block', marginTop: '8px', color: 'var(--primary)', wordBreak: 'break-all', fontSize: '14px' },
            }, ['🔗 ' + d.link]));
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
