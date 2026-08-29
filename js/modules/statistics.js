/* ============================================================
 * modules/statistics.js - 【积分统计】模块（学生+管理员均可查看）
 *   总览 + 小组/类别统计表 + 可视化图表（Chart.js）
 *   新增：单小组详情可视化（成员排名 / 类别构成 / 周趋势）
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

    // ========== 顶部总览卡片 ==========
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

    // ========== 小组统计表 + 单小组详情切换 ==========
    const groups = DB.listGroups();
    let currentGroupId = groups[0] ? groups[0].id : null;

    // 小组选择器
    const groupSelector = Utils.el('select', { class: 'form-input', style: { width: 'auto', marginTop: '10px' } });
    groupSelector.appendChild(Utils.el('option', { value: '' }, ['📊 总览（所有小组）']));
    groups.forEach(g => {
      groupSelector.appendChild(Utils.el('option', { value: String(g.id), selected: String(g.id) === String(currentGroupId) }, ['👥 ' + g.name]));
    });

    // 统计详情容器（总览 / 单小组切换）
    const detailContainer = Utils.el('div', { id: 'stat-detail' });
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' } }, [
        Utils.el('div', { class: 'card-title', style: { margin: 0 } }, ['📊 积分统计']),
        groupSelector,
      ]),
      detailContainer,
    ]));

    /** 渲染总览或单小组详情 */
    function renderDetail() {
      detailContainer.innerHTML = '';
      const selectedGroupId = groupSelector.value ? Number(groupSelector.value) : null;
      destroyCharts(); // 切换时销毁旧图表

      if (!selectedGroupId) {
        renderOverview(detailContainer);
      } else {
        renderGroupDetail(detailContainer, selectedGroupId);
      }
    }
    groupSelector.addEventListener('change', renderDetail);

    function renderOverview(container) {
      // --- 总览：小组统计表 ---
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
      container.appendChild(Utils.el('div', { class: 'table-wrap', style: { marginTop: '12px' } }, [
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
      ]));

      // --- 总览：类别统计表 ---
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
      container.appendChild(Utils.el('div', { class: 'table-wrap', style: { marginTop: '18px' } }, [
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
      ]));

      if (typeof Chart === 'undefined') return;
      if (s.overall.total_records === 0) return;

      // --- 总览图表 1：小组积分对比柱状图 ---
      if (s.by_group.length > 0) {
        container.appendChild(chartCard('📊 小组积分对比', 'chart-group-bar', '320px'));
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

      // --- 总览图表 2：类别占比环形图 ---
      if (s.by_category.length > 0) {
        container.appendChild(chartCard('🏷️ 各类别积分占比', 'chart-cat-doughnut', '300px'));
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

      // --- 总览图表 3：小组堆叠 ---
      if (s.by_group.length > 0) {
        container.appendChild(chartCard('📈 小组积分构成（堆叠）', 'chart-group-stack', Math.max(220, s.by_group.length * 60) + 'px'));
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
    }

    function renderGroupDetail(container, gid) {
      const gs = DB.getGroupStatistics(gid);
      if (!gs) {
        container.appendChild(Utils.el('p', { style: { color: 'var(--text-soft)', textAlign: 'center', padding: '20px' } }, ['小组不存在']));
        return;
      }

      // --- 单小组顶部卡片 ---
      container.appendChild(Utils.el('div', { class: 'stats-grid', style: { marginTop: '12px' } }, [
        Utils.el('div', { class: 'stat-card' }, [
          Utils.el('div', { class: 'stat-label' }, ['👥 组员人数']),
          Utils.el('div', { class: 'stat-value' }, [String(gs.member_count)]),
        ]),
        Utils.el('div', { class: 'stat-card' }, [
          Utils.el('div', { class: 'stat-label' }, ['👤 个人积分']),
          Utils.el('div', { class: 'stat-value', style: { color: '#3b82f6' } }, ['+' + gs.indiv_pts]),
        ]),
        Utils.el('div', { class: 'stat-card' }, [
          Utils.el('div', { class: 'stat-label' }, ['🏢 小组积分']),
          Utils.el('div', { class: 'stat-value', style: { color: '#10b981' } }, ['+' + gs.group_pts]),
        ]),
        Utils.el('div', { class: 'stat-card' }, [
          Utils.el('div', { class: 'stat-label' }, ['🏆 总积分']),
          Utils.el('div', { class: 'stat-value', style: { color: 'var(--primary)' } }, ['+' + gs.total_pts]),
        ]),
      ]));

      if (typeof Chart === 'undefined') {
        container.appendChild(Utils.el('p', { style: { color: 'var(--text-soft)', textAlign: 'center', padding: '20px' } }, ['⚠️ 图表库未加载']));
        return;
      }
      if (gs.record_count === 0) {
        container.appendChild(Utils.el('p', { style: { color: 'var(--text-soft)', textAlign: 'center', padding: '30px' } }, ['该小组暂无积分记录，先录入积分再查看图表。']));
        return;
      }

      // --- 单小组图表 1：成员个人积分排名 ---
      if (gs.member_ranking.length > 0 && gs.member_ranking.some(m => m.indiv_pts > 0)) {
        const data = gs.member_ranking.filter(m => m.indiv_pts > 0);
        container.appendChild(chartCard('🏅 组员个人积分排名', 'chart-g-member', Math.max(220, data.length * 48) + 'px'));
        const cA = new Chart(document.getElementById('chart-g-member').getContext('2d'), {
          type: 'bar',
          data: {
            labels: data.map(m => m.name),
            datasets: [
              { label: '个人积分', data: data.map(m => m.indiv_pts), backgroundColor: '#3b82f6', borderRadius: 4 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            plugins: {
              legend: { position: 'top' },
              tooltip: { callbacks: { label: (ctx) => '个人积分: +' + ctx.parsed.x } },
            },
            scales: { x: { beginAtZero: true } },
          },
        });
        chartInstances.push(cA);
      }

      // --- 单小组图表 2：各类别积分占比环形图 ---
      if (gs.by_category.length > 0) {
        container.appendChild(chartCard('🏷️ ' + gs.name + ' - 各类别积分占比', 'chart-g-cat', '300px'));
        const cB = new Chart(document.getElementById('chart-g-cat').getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: gs.by_category.map(c => c.label),
            datasets: [{
              data: gs.by_category.map(c => c.total_pts),
              backgroundColor: gs.by_category.map(c => c.color),
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
        chartInstances.push(cB);
      }

      // --- 单小组图表 3：各类别构成堆叠条形图 ---
      if (gs.by_category.length > 0) {
        container.appendChild(chartCard('💡 各类别积分构成（个人/小组）', 'chart-g-catstack', Math.max(240, gs.by_category.length * 60) + 'px'));
        const cC = new Chart(document.getElementById('chart-g-catstack').getContext('2d'), {
          type: 'bar',
          data: {
            labels: gs.by_category.map(c => c.label),
            datasets: [
              { label: '个人积分', data: gs.by_category.map(c => c.indiv_pts), backgroundColor: '#3b82f6', borderRadius: 4 },
              { label: '小组积分', data: gs.by_category.map(c => c.group_pts), backgroundColor: '#10b981', borderRadius: 4 },
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
        chartInstances.push(cC);
      }

      // --- 单小组图表 4：各周积分趋势折线图 ---
      if (gs.week_trend.length > 0) {
        container.appendChild(chartCard('📈 ' + gs.name + ' - 各周积分趋势', 'chart-g-week', '300px'));
        const cD = new Chart(document.getElementById('chart-g-week').getContext('2d'), {
          type: 'line',
          data: {
            labels: gs.week_trend.map(w => w.week),
            datasets: [
              { label: '个人积分', data: gs.week_trend.map(w => w.indiv), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.15)', tension: 0.3, fill: true, pointRadius: 5 },
              { label: '小组积分', data: gs.week_trend.map(w => w.group), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)', tension: 0.3, fill: true, pointRadius: 5 },
              { label: '合计', data: gs.week_trend.map(w => w.total), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.1)', tension: 0.3, fill: false, pointRadius: 5, borderDash: [4, 4] },
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
        chartInstances.push(cD);
      }

      // --- 组员排名明细表格（便于查看数字）---
      if (gs.member_ranking.length > 0) {
        const memberRows = gs.member_ranking.filter(m => m.indiv_pts > 0).map((m, i) => Utils.el('tr', {}, [
          Utils.el('td', {}, ['#' + (i + 1)]),
          Utils.el('td', {}, [Utils.el('strong', {}, [m.name])]),
          Utils.el('td', {}, [String(m.record_count)]),
          Utils.el('td', {}, [Utils.el('strong', { style: { color: 'var(--primary)' } }, ['+' + m.indiv_pts])]),
        ]));
        if (memberRows.length === 0) {
          memberRows.push(Utils.el('tr', {}, [Utils.el('td', { class: 'empty', colspan: 4 }, ['暂无组员积分数据'])]));
        }
        container.appendChild(Utils.el('div', { class: 'table-wrap', style: { marginTop: '10px' } }, [
          Utils.el('table', { class: 'data' }, [
            Utils.el('thead', {}, [Utils.el('tr', {}, [
              Utils.el('th', {}, ['排名']), Utils.el('th', {}, ['成员']),
              Utils.el('th', {}, ['录入次数']), Utils.el('th', {}, ['个人积分']),
            ])]),
            Utils.el('tbody', {}, memberRows),
          ]),
        ]));
      }
    }

    // 首次渲染
    renderDetail();
  }

  function unmount() {
    destroyCharts();
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, unmount, adminOnly: false });
})();
