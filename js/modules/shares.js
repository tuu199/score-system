/* ============================================================
 * modules/shares.js - 【分享板】模块（学生+管理员均可发帖/查看）
 *   周末/假期分享：学习心得、能力增长、兴趣领域等
 *   每发一条自动+1个人积分（群分享类别）
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'shares';
  const MOD_NAME = '分享板';
  const MOD_ICON = '💬';

  function mount(view) {
    const groups = DB.listGroups();
    const shares = DB.listShares();
    const weeks = DB.getRecentWeeks(8);
    const currentWeek = DB.getCurrentWeek();

    // 顶部说明
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['💬 分享板']),
      Utils.el('p', { style: { color: 'var(--text-soft)', fontSize: '14px', margin: '8px 0' } }, [
        '分享学习心得、能力增长、兴趣领域等内容。每发一条自动积1分（群分享），周日12:00前组长汇总。',
      ]),
    ]));

    // 发帖表单
    const formCard = Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['✏️ 发布分享']),
    ]);

    // 小组选择
    const groupSelect = Utils.el('select', { class: 'form-input', id: 'share-group' });
    groupSelect.appendChild(Utils.el('option', { value: '' }, ['选择小组']));
    groups.forEach(g => {
      groupSelect.appendChild(Utils.el('option', { value: g.id }, [g.name]));
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['小组']),
      groupSelect,
    ]));

    // 成员选择
    const memberSelect = Utils.el('select', { class: 'form-input', id: 'share-member' });
    memberSelect.appendChild(Utils.el('option', { value: '' }, ['先选小组']));
    memberSelect.disabled = true;
    groupSelect.addEventListener('change', () => {
      memberSelect.innerHTML = '';
      const gid = Number(groupSelect.value);
      if (!gid) {
        memberSelect.appendChild(Utils.el('option', { value: '' }, ['先选小组']));
        memberSelect.disabled = true;
        return;
      }
      memberSelect.appendChild(Utils.el('option', { value: '' }, ['选择成员']));
      DB.listMembers(gid).forEach(m => {
        memberSelect.appendChild(Utils.el('option', { value: m.id }, [m.name]));
      });
      memberSelect.disabled = false;
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['姓名']),
      memberSelect,
    ]));

    // 标题
    const titleInput = Utils.el('input', {
      class: 'form-input', type: 'text', placeholder: '标题（可选）', id: 'share-title',
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['标题']),
      titleInput,
    ]));

    // 内容
    const contentTextarea = Utils.el('textarea', {
      class: 'form-input', placeholder: '分享内容（学习心得、能力增长、兴趣领域等）',
      id: 'share-content', rows: 4, style: { width: '100%', resize: 'vertical' },
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['内容']),
      contentTextarea,
    ]));

    // 链接
    const linkInput = Utils.el('input', {
      class: 'form-input', type: 'text', placeholder: '链接（可选，如文章/视频网址）', id: 'share-link',
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['链接']),
      linkInput,
    ]));

    // 提交按钮
    const submitBtn = Utils.el('button', {
      class: 'btn btn-primary',
      style: { marginTop: '10px', width: '100%' },
    }, ['📤 发布分享（+1分）']);
    submitBtn.addEventListener('click', () => {
      const gid = Number(groupSelect.value);
      const mid = Number(memberSelect.value) || null;
      const title = titleInput.value.trim();
      const content = contentTextarea.value.trim();
      const link = linkInput.value.trim();
      if (!gid) { Utils.toast('请选择小组', 'error'); return; }
      if (!content) { Utils.toast('请填写分享内容', 'error'); return; }
      try {
        DB.addShare({
          member_id: mid, group_id: gid, title, content, link,
          week: currentWeek,
        });
        Utils.toast('分享成功！个人积分 +1', 'success');
        // 清空表单
        titleInput.value = '';
        contentTextarea.value = '';
        linkInput.value = '';
        // 刷新列表
        ScoreApp.navigate('shares');
      } catch (e) {
        Utils.toast('发布失败：' + e.message, 'error');
      }
    });
    formCard.appendChild(submitBtn);
    view.appendChild(formCard);

    // 筛选栏
    const filterRow = Utils.el('div', { class: 'filter-row', style: { display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' } });
    const weekFilter = Utils.el('select', { class: 'form-input', style: { width: 'auto' } });
    weekFilter.appendChild(Utils.el('option', { value: '' }, ['全部周次']));
    weeks.forEach(w => {
      weekFilter.appendChild(Utils.el('option', { value: w, selected: w === currentWeek }, [w]));
    });
    filterRow.appendChild(Utils.el('span', { style: { fontSize: '14px', color: 'var(--text-soft)' } }, ['周次：']));
    filterRow.appendChild(weekFilter);
    view.appendChild(filterRow);

    // 分享列表
    const listContainer = Utils.el('div', { id: 'shares-list' });
    view.appendChild(listContainer);

    function renderList() {
      const filterWeek = weekFilter.value;
      const list = filterWeek ? DB.listShares({ week: filterWeek }) : DB.listShares();
      listContainer.innerHTML = '';

      if (list.length === 0) {
        listContainer.appendChild(Utils.el('div', { class: 'card', style: { textAlign: 'center', color: 'var(--text-soft)' } }, [
          '📭 暂无分享，快来发第一条吧！',
        ]));
        return;
      }

      list.forEach(s => {
        const card = Utils.el('div', { class: 'share-card' });
        // 头部：姓名 + 小组 + 时间
        card.appendChild(Utils.el('div', { class: 'share-header' }, [
          Utils.el('span', { class: 'share-author' }, [s.member_name || '未知']),
          Utils.el('span', { class: 'share-group' }, [s.group_name]),
          Utils.el('span', { class: 'share-time' }, [s.created_at]),
        ]));
        // 标题
        if (s.title) {
          card.appendChild(Utils.el('div', { class: 'share-title' }, [s.title]));
        }
        // 内容
        card.appendChild(Utils.el('div', { class: 'share-content' }, [s.content]));
        // 链接
        if (s.link) {
          const linkEl = Utils.el('a', {
            class: 'share-link', href: s.link, target: '_blank', rel: 'noopener',
          }, ['🔗 ' + s.link]);
          card.appendChild(linkEl);
        }
        // 底部：周次 + 删除按钮（管理员可删）
        const footer = Utils.el('div', { class: 'share-footer' }, [
          Utils.el('span', { class: 'share-week' }, [s.week || '']),
        ]);
        if (ScoreApp.isAdmin) {
          const delBtn = Utils.el('button', {
            class: 'btn btn-danger btn-sm',
            style: { float: 'right', padding: '2px 8px', fontSize: '12px' },
          }, ['删除']);
          delBtn.addEventListener('click', () => {
            if (!confirm('确认删除这条分享？')) return;
            DB.deleteShare(s.id);
            Utils.toast('已删除', 'info');
            renderList();
          });
          footer.appendChild(delBtn);
        }
        card.appendChild(footer);
        listContainer.appendChild(card);
      });
    }

    weekFilter.addEventListener('change', renderList);
    renderList();
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, adminOnly: false });
})();
