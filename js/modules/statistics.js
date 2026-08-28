/* ============================================================
 * modules/statistics.js - 【积分统计】模块（学生+管理员均可查看）
 *   总览 + 小组/类别统计表 + 可视化图表（Chart.js）
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'statistics';
  const MOD_NAME = '积分统计';
  const MOD_ICON = '📊';

  // 保存当前已创建的 Chart 实例，便于卸载时销毁，避免内存泄漏
  let chartInstances = [];

  function destroyCharts() {
    chartInstances.forEach(c => {
      try { c.destroy(); } catch (e) { /* ignore */ }
    });
    chartInstances = [];
  }

  function chartCard(title, canvasId, height) {
    return Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, [title]),
      Utils.el('div', { style: { position: 'relative', height: height, marginTop: '10px' } }, [
        Utils.el('canvas', { id: canvasId }),
      ]),
    ]);
  }

  function mount(view) {
    if (!ScoreApp.isAdmin) {
      view.appendChild(Utils.el('div', { class: 'readonly-notice' }, ['🔒 学生模式：仅可查看统计数据']));
    }

    const s = DB.computeStatistics();
    const cat = DB.CATEGORIES;
    const safeCat = (k) => cat[k] || { icon: '📝', short: '其他', name: '未知', color: '#6b7280' };

    // 顶部总览卡片
    view.appendChild(Utils.el('div', { class: 'stats-grid' }, [
      Utils.el('div', { class: 'stat-card' }, [
        Utils.el('div', { class: 'stat-label' }, ['📝 总记录数']),
        Utils.el('div', { class: 'stat-value' }, [String(s.overall.total_records)]),
      ]),
      Utils.el('div', { class: 'stat-card' }, [
        Utils.el('div', { class: 'stat-label' }, ['👤 个人积分合计']),
        Utils.el('div', { class: 'stat-value', style: { color: '#3b82f6' } }, ['+' + s.overall.total_individual]),
      ]),
      Utils.el('div', { class: 'stat-card' }, [
        Utils.el('div', { class: 'stat-label' }, ['👥 小组积分合计']),
        Utils.el('div', { class: 'stat-value', style: { color: '#10b981' } }, ['+' + s.overall.total_group]),
      ]),
      Utils.el('div', { class: 'stat-card' }, [
        Utils.el('div', { class: 'stat-label' }, ['🏆 总积分']),
        Utils.el('div', { class: 'stat-value', style: { color: 'var(--primary)' } }, ['+' + s.overall.total_all]),
      ]),
    ]));

    // 小组统计表
    const groupRows = s.by_group.length === 0
      ? [Utils.el('tr', {}, [Utils.el('td', { class: 'empty', colspan: 6 }, ['暂无小组数据'])])]
      : s.by_group.map(g => Utils.el('tr', {}, [
          Utils.el('td', {}, [Utils.el('strong', {}, [g.name])]),
          Utils.el('td', {}, [g.leader_name]),
          Utils.el('td', {}, [g.record_count + ' 次']),
          Utils.el('td', {}, ['+' + g.indiv_pts]),
          Utils.el('td', {}, ['+' + g.group_pts]),
          Utils.el('td', {}, [Utils.el('strong', { style: { color: 'var(--primary)' } }, ['+' + g.total_pts])]),
        ]));
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['👥 各小组积分统计']),
      Utils.el('div', { class: 'table-wrap' }, [
        Utils.el('table', { class: 'data' }, [
          Utils.el('thead', {}, [Utils.el('tr', {}, [
            Utils.el('th', {}, ['小组']),
            Utils.el('th', {}, ['组长']),
            Utils.el('th', {}, ['录入次数']),
            Utils.el('th', {}, ['个人积分']),
            Utils.el('th', {}, ['小组积分']),
            Utils.el('th', {}, ['合计']),
          ])]),
          Utils.el('tbody', {}, groupRows),
        ]),
      ]),
    ]));

    // 类别统计表
    const catRows = s.by_category.length === 0
      ? [Utils.el('tr', {}, [Utils.el('td', { class: 'empty', colspan: 5 }, ['暂无类别数据'])])]
      : s.by_category.map(r => {
          const c = safeCat(r.category);
          return Utils.el('tr', {}, [
          Utils.el('td', {}, [c.icon + ' ' + c.name]),
          Utils.el('td', {}, [r.record_count + ' 次']),
          Utils.el('td', {}, ['+' + r.indiv_pts]),
          Utils.el('td', {}, ['+' + r.group_pts]),
          Utils.el('td', {}, [Utils.el('strong', { style: { color: c.color } }, ['+' + r.total_pts])]),
        ]);
      });
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['🏷️ 各类别积分统计']),
      Utils.el('div', { class: 'table-wrap' }, [
        Utils.el('table', { class: 'data' }, [
          Utils.el('thead', {}, [Utils.el('tr', {}, [
            Utils.el('th', {}, ['类别']),
            Utils.el('th', {}, ['录入次数']),
            Utils.el('th', {}, ['个人积分']),
            Utils.el('th', {}, ['小组积分']),
            Utils.el('th', {}, ['合计']),
          ])]),
          Utils.el('tbody', {}, catRows),
        ]),
      ]),
    ]));

    // ========== 可视化图表（Chart.js）==========
    if (typeof Chart === 'undefined') {
      view.appendChild(Utils.el('div', { class: 'card', style: { color: 'var(--text-soft)' } },
        ['⚠️ 图表库未加载，无法显示可视化图表。请检查网络连接。']));
      return;
    }
    if (s.overall.total_records === 0) {
      view.appendChild(Utils.el('div', { class: 'card', style: { textAlign: 'center', color: 'var(--text-soft)' } },
        ['暂无积分记录，无法生成图表。请先录入积分后查看。']));
      return;
    }

    // 1. 小组积分对比柱状图（个人 / 小组 / 合计）
    if (s.by_group.length > 0) {
      view.appendChild(chartCard('📊 小组积分对比', 'chart-group-bar', '320px'));
      const c1 = new Chart(document.getElementById('chart-group-bar').getContext('2d'), {
        type: 'bar',
        data: {
          labels: s.by_group.map(g => g.name),
          datasets: [
            { label: '个人积分', data: s.by_group.map(g => g.indiv_pts), backgroundColor: '#3b82f6', borderRadius: 4 },
            { label: '小组积分', data: s.by_group.map(g => g.group_pts), backgroundColor: '#10b981', borderRadius: 4 },
            { label: '合计', data: s.by_group.map(g => g.total_pts), backgroundColor: '#4f46e5', borderRadius: 4 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': +' + ctx.parsed.y } },
          },
          scales: { y: { beginAtZero: true } },
        },
      });
      chartInstances.push(c1);
    }

    // 2. 类别积分占比环形图
    if (s.by_category.length > 0) {
      view.appendChild(chartCard('🏷️ 各类别积分占比', 'chart-cat-doughnut', '300px'));
      const c2 = new Chart(document.getElementById('chart-cat-doughnut').getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: s.by_category.map(r => safeCat(r.category).icon + ' ' + safeCat(r.category).short),
          datasets: [{
            data: s.by_category.map(r => r.total_pts),
            backgroundColor: s.by_category.map(r => safeCat(r.category).color),
            borderWidth: 2, borderColor: '#fff',
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right' },
            tooltip: { callbacks: { label: (ctx) => ctx.label + ': +' + ctx.parsed } },
          },
        },
      });
      chartInstances.push(c2);
    }

    // 3. 小组积分构成堆叠图（水平堆叠：个人 + 小组）
    if (s.by_group.length > 0) {
      view.appendChild(chartCard('📈 小组积分构成（堆叠）', 'chart-group-stack', Math.max(220, s.by_group.length * 60) + 'px'));
      const c3 = new Chart(document.getElementById('chart-group-stack').getContext('2d'), {
        type: 'bar',
        data: {
          labels: s.by_group.map(g => g.name),
          datasets: [
            { label: '个人积分', data: s.by_group.map(g => g.indiv_pts), backgroundColor: '#3b82f6', borderRadius: 4 },
            { label: '小组积分', data: s.by_group.map(g => g.group_pts), backgroundColor: '#10b981', borderRadius: 4 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y', stacked: true,
          plugins: {
            legend: { position: 'top' },
            tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': +' + ctx.parsed.x } },
          },
          scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } },
        },
      });
      chartInstances.push(c3);
    }

    view.appendChild(Utils.el('p', { style: { color: 'var(--text-soft)', fontSize: '12px', marginTop: '10px' } }, [
      '说明：图表基于已录入的积分记录自动生成，切换模块时图表会自动销毁以释放内存。',
    ]));
  }

  function unmount() {
    destroyCharts();
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, unmount, adminOnly: false });
})();
