/* ============================================================
 * modules/ranking.js - 【排名榜】模块（学生+管理员均可查看）
 *   小组排名 + 个人排名 + TOP3 高亮
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'ranking';
  const MOD_NAME = '排名榜';
  const MOD_ICON = '🏆';

  function mount(view) {
    if (!ScoreApp.isAdmin) {
      view.appendChild(Utils.el('div', { class: 'readonly-notice' }, ['🔒 学生模式：仅可查看排名']));
    }

    const groups = DB.getGroupRanking();
    const individuals = DB.getIndividualRanking();

    // 顶部：小组TOP3
    const top3 = groups.slice(0, 3);
    if (top3.length > 0) {
      view.appendChild(Utils.el('div', { class: 'stats-grid' },
        top3.map((g, i) => {
          const colors = ['#fbbf24', '#9ca3af', '#b45309'];
          const labels = ['🥇 第一名', '🥈 第二名', '🥉 第三名'];
          return Utils.el('div', { class: 'stat-card', style: { borderTop: '4px solid ' + colors[i] } }, [
            Utils.el('div', { class: 'stat-label', style: { color: colors[i] } }, [labels[i]]),
            Utils.el('div', { style: { fontSize: '20px', fontWeight: '700', margin: '6px 0' } }, [g.name]),
            Utils.el('div', { class: 'stat-value', style: { color: colors[i] } }, ['+' + g.total_pts]),
            Utils.el('div', { style: { fontSize: '12px', color: 'var(--text-soft)', marginTop: '4px' } }, [
              '组长：' + g.leader_name + ' · ' + g.member_count + ' 人',
            ]),
          ]);
        })
      ));
    }

    // 小组排名表
    const groupRows = groups.length === 0
      ? [Utils.el('tr', {}, [Utils.el('td', { class: 'empty', colspan: 7 }, ['暂无小组数据'])])]
      : groups.map(g => Utils.el('tr', { class: g.rank <= 3 ? 'rank-' + g.rank : '' }, [
          Utils.el('td', {}, [Utils.el('span', { class: 'rank-badge' }, [g.rank])]),
          Utils.el('td', {}, [Utils.el('strong', {}, [g.name])]),
          Utils.el('td', {}, [g.leader_name]),
          Utils.el('td', {}, [g.member_count + ' 人']),
          Utils.el('td', {}, ['+' + g.indiv_pts]),
          Utils.el('td', {}, ['+' + g.group_pts]),
          Utils.el('td', {}, [Utils.el('strong', { style: { color: 'var(--primary)' } }, ['+' + g.total_pts])]),
        ]));
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['🏆 小组总积分排名']),
      Utils.el('div', { class: 'table-wrap' }, [
        Utils.el('table', { class: 'data' }, [
          Utils.el('thead', {}, [Utils.el('tr', {}, [
            Utils.el('th', {}, ['名次']),
            Utils.el('th', {}, ['小组']),
            Utils.el('th', {}, ['组长']),
            Utils.el('th', {}, ['人数']),
            Utils.el('th', {}, ['个人积分']),
            Utils.el('th', {}, ['小组积分']),
            Utils.el('th', {}, ['合计']),
          ])]),
          Utils.el('tbody', {}, groupRows),
        ]),
      ]),
      Utils.el('p', { style: { color: 'var(--text-soft)', fontSize: '12px', marginTop: '10px' } }, [
        '说明：合计 = 个人积分累计 + 小组积分累计；个人积分归属个人的部分计入所属小组。',
      ]),
    ]));

    // 个人排名
    const indivRows = individuals.length === 0
      ? [Utils.el('tr', {}, [Utils.el('td', { class: 'empty', colspan: 6 }, ['暂无组员数据'])])]
      : individuals.map(m => Utils.el('tr', { class: m.rank <= 3 ? 'rank-' + m.rank : '' }, [
          Utils.el('td', {}, [Utils.el('span', { class: 'rank-badge' }, [m.rank])]),
          Utils.el('td', {}, [Utils.el('strong', {}, [m.name])]),
          Utils.el('td', {}, [m.group_name]),
          Utils.el('td', {}, [m.group_leader]),
          Utils.el('td', {}, [m.record_count + ' 次']),
          Utils.el('td', {}, [Utils.el('strong', { style: { color: 'var(--primary)' } }, ['+' + m.indiv_pts])]),
        ]));
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['⭐ 个人积分排名']),
      Utils.el('div', { class: 'table-wrap' }, [
        Utils.el('table', { class: 'data' }, [
          Utils.el('thead', {}, [Utils.el('tr', {}, [
            Utils.el('th', {}, ['名次']),
            Utils.el('th', {}, ['姓名']),
            Utils.el('th', {}, ['所属小组']),
            Utils.el('th', {}, ['组长']),
            Utils.el('th', {}, ['录入次数']),
            Utils.el('th', {}, ['个人积分']),
          ])]),
          Utils.el('tbody', {}, indivRows),
        ]),
      ]),
      Utils.el('p', { style: { color: 'var(--text-soft)', fontSize: '12px', marginTop: '10px' } }, [
        '说明：个人积分仅统计归属个人的部分（出勤打卡 5 分、群分享 1 分、单科状元 20 分等），小组积分不计入个人排名。',
      ]),
    ]));
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, adminOnly: false });
})();
