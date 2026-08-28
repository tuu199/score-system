/* ============================================================
 * modules/history.js - 【历史记录】模块（仅管理员）
 *   统一展示所有操作时间线：积分录入 / 分享发布 / 小组/成员变动
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'history';
  const MOD_NAME = '历史记录';
  const MOD_ICON = '🕘';

  function mount(view) {
    // 收集所有操作记录，合并成时间线
    const timeline = [];

    // 1. 积分录入记录
    DB.listRecords().forEach(r => {
      const cat = DB.CATEGORIES[r.category] || { icon: '📝', short: '其他' };
      const who = r.member_name ? `${r.member_name}（${r.group_name}）` : `${r.group_name}（小组）`;
      let desc = `${cat.icon} ${cat.short}：${who}`;
      if (r.individual_points) desc += ` 个人+${r.individual_points}`;
      if (r.group_points) desc += ` 小组+${r.group_points}`;
      if (r.description) desc += `（${r.description}）`;
      timeline.push({
        time: r.created_at, type: '积分', icon: cat.icon,
        desc, week: r.week, color: cat.color || '#6b7280',
      });
    });

    // 2. 分享发布记录
    DB.listShares().forEach(s => {
      let desc = `💬 分享：${s.member_name || '未知'}（${s.group_name}）`;
      if (s.title) desc += `「${s.title}」`;
      const preview = (s.content || '').slice(0, 40);
      if (preview) desc += ` ${preview}${(s.content || '').length > 40 ? '…' : ''}`;
      if (s.image_data) desc += ' [图片]';
      if (s.link) desc += ' [链接]';
      timeline.push({
        time: s.created_at, type: '分享', icon: '💬',
        desc, week: s.week, color: '#f59e0b',
      });
    });

    // 3. 小组创建记录
    DB.listGroups().forEach(g => {
      timeline.push({
        time: g.created_at, type: '小组', icon: '👥',
        desc: `创建小组：${g.name}（组长：${g.leader_name}）`,
        week: '', color: '#3b82f6',
      });
    });

    // 4. 成员添加记录
    DB.listMembersWithGroup().forEach(m => {
      timeline.push({
        time: m.created_at, type: '成员', icon: '👤',
        desc: `添加成员：${m.name}（${m.group_name}）`,
        week: '', color: '#10b981',
      });
    });

    // 按时间倒序
    timeline.sort((a, b) => b.time.localeCompare(a.time));

    // 筛选栏
    const filterRow = Utils.el('div', {
      style: { display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'center', flexWrap: 'wrap' },
    });
    const typeFilter = Utils.el('select', { class: 'form-input', style: { width: 'auto' } });
    [['', '全部类型'], ['积分', '积分录入'], ['分享', '分享发布'], ['小组', '小组变动'], ['成员', '成员变动']].forEach(([v, l]) => {
      typeFilter.appendChild(Utils.el('option', { value: v }, [l]));
    });
    filterRow.appendChild(Utils.el('span', { style: { fontSize: '14px', color: 'var(--text-soft)' } }, ['类型：']));
    filterRow.appendChild(typeFilter);
    view.appendChild(filterRow);

    // 统计
    const statsBar = Utils.el('div', {
      style: { display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' },
    });
    view.appendChild(statsBar);

    // 时间线列表
    const listContainer = Utils.el('div', { id: 'history-list' });
    view.appendChild(listContainer);

    function renderList() {
      const filterType = typeFilter.value;
      const filtered = filterType ? timeline.filter(t => t.type === filterType) : timeline;
      listContainer.innerHTML = '';
      statsBar.innerHTML = '';

      // 统计
      const typeCounts = {};
      timeline.forEach(t => { typeCounts[t.type] = (typeCounts[t.type] || 0) + 1; });
      const typeLabels = { '积分': '积分录入', '分享': '分享发布', '小组': '小组变动', '成员': '成员变动' };
      Object.entries(typeCounts).forEach(([type, count]) => {
        statsBar.appendChild(Utils.el('div', {
          class: 'stat-card', style: { flex: '1', minWidth: '100px', textAlign: 'center', padding: '8px 12px' },
        }, [
          Utils.el('div', { style: { fontSize: '11px', color: 'var(--text-soft)' } }, [typeLabels[type] || type]),
          Utils.el('div', { style: { fontSize: '20px', fontWeight: '700', color: 'var(--primary)' } }, [String(count)]),
        ]));
      });

      if (filtered.length === 0) {
        listContainer.appendChild(Utils.el('div', {
          class: 'card', style: { textAlign: 'center', color: 'var(--text-soft)' },
        }, ['📭 暂无记录']));
        return;
      }

      filtered.forEach(item => {
        const card = Utils.el('div', {
          class: 'share-card',
          style: { borderLeft: `3px solid ${item.color}` },
        });
        card.appendChild(Utils.el('div', { class: 'share-header' }, [
          Utils.el('span', { style: { fontSize: '16px' } }, [item.icon]),
          Utils.el('span', {
            style: { fontSize: '12px', color: '#fff', background: item.color, padding: '2px 8px', borderRadius: '10px' },
          }, [item.type]),
          Utils.el('span', { class: 'share-time' }, [item.time]),
        ]));
        card.appendChild(Utils.el('div', {
          style: { fontSize: '14px', color: 'var(--text)', lineHeight: 1.5 },
        }, [item.desc]));
        if (item.week) {
          card.appendChild(Utils.el('div', {
            style: { fontSize: '12px', color: 'var(--text-soft)', marginTop: '4px' },
          }, ['周次：' + item.week]));
        }
        listContainer.appendChild(card);
      });
    }

    typeFilter.addEventListener('change', renderList);
    renderList();
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, adminOnly: true });
})();
