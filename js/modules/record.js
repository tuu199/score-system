/* ============================================================
 * modules/record.js - 【积分录入】模块（仅管理员）
 *   录入：个人积分 / 小组积分；周次选择；类别筛选
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'record';
  const MOD_NAME = '积分录入';
  const MOD_ICON = '✍️';

  let state = {
    groupId: 0,
    week: '',
  };

  function buildSelect(options, valueKey, labelKey, placeholder, selected) {
    const sel = Utils.el('select', { class: '' });
    if (placeholder) sel.appendChild(Utils.el('option', { value: 0 }, [placeholder]));
    options.forEach(o => {
      const opt = Utils.el('option', { value: o[valueKey] }, [o[labelKey]]);
      if (String(o[valueKey]) === String(selected)) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function mount(view) {
    if (!ScoreApp.isAdmin) {
      view.appendChild(Utils.el('div', { class: 'card' }, [
        Utils.el('div', { class: 'readonly-notice' }, ['🔒 此模块仅管理员可操作，请先登录管理员。']),
        Utils.el('p', { style: { color: 'var(--text-soft)', marginTop: '10px' } }, ['点击右上角「管理员登录」按钮即可。']),
      ]));
      return;
    }

    state.week = state.week || DB.getCurrentWeek();
    const groups = DB.listGroups();
    state.groupId = state.groupId || (groups[0] && groups[0].id) || 0;

    // 顶部筛选条
    const groupSel = buildSelect(groups, 'id', 'name', '选择小组', state.groupId);
    groupSel.style.cssText = 'padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;';
    groupSel.addEventListener('change', () => {
      state.groupId = Number(groupSel.value);
      refresh();
    });

    const weekSel = Utils.el('select', { style: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px' } });
    const weeks = DB.getRecentWeeks(16);
    weeks.forEach(w => {
      const opt = Utils.el('option', { value: w }, [w]);
      if (w === state.week) opt.selected = true;
      weekSel.appendChild(opt);
    });
    weekSel.addEventListener('change', () => {
      state.week = weekSel.value;
      refresh();
    });

    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, [
        Utils.el('span', {}, ['✍️ 积分录入']),
        Utils.el('span', { style: { fontSize: '12px', color: 'var(--text-soft)', fontWeight: 'normal' } },
          ['共 ' + groups.length + ' 个小组 · 当前周次 ' + state.week]),
      ]),
      Utils.el('div', { class: 'form-row' }, [
        Utils.el('div', { class: 'form-group' }, [
          Utils.el('label', {}, ['选择小组']),
          groupSel,
        ]),
        Utils.el('div', { class: 'form-group' }, [
          Utils.el('label', {}, ['周次']),
          weekSel,
        ]),
      ]),
    ]));

    if (!state.groupId) {
      view.appendChild(Utils.el('div', { class: 'card' }, [
        Utils.el('p', { style: { color: 'var(--text-soft)', textAlign: 'center', padding: '20px' } },
          ['请先在「小组管理」中添加小组与组员。']),
      ]));
      return;
    }

    const group = DB.getGroup(state.groupId);
    const members = DB.listMembers(state.groupId);

    // 录入面板
    view.appendChild(renderRecordForm(group, members));
    // 本周已有记录
    view.appendChild(renderRecordList(group, members));
  }

  /** 录入表单 */
  function renderRecordForm(group, members) {
    const cat = DB.CATEGORIES;
    const catSel = Utils.el('select', { style: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px' } });
    Object.keys(cat).forEach(k => {
      catSel.appendChild(Utils.el('option', { value: k }, [cat[k].icon + ' ' + cat[k].name]));
    });
    catSel.value = '1';

    // 个人/小组切换
    const targetSel = Utils.el('select', { style: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px' } });
    targetSel.appendChild(Utils.el('option', { value: 'group' }, ['小组积分（不归属个人）']));
    members.forEach(m => {
      targetSel.appendChild(Utils.el('option', { value: 'member:' + m.id }, ['个人：' + m.name]));
    });

    const descInput = Utils.el('input', {
      class: 'login-input', placeholder: '说明（如：周日全员准时到校 / 分享学习笔记 / 单科状元）',
      autocomplete: 'off',
    });
    const indivInput = Utils.el('input', {
      class: 'login-input', type: 'number', step: '0.5', placeholder: '个人积分', value: '0',
      style: { width: '110px' },
    });
    const groupInput = Utils.el('input', {
      class: 'login-input', type: 'number', step: '0.5', placeholder: '小组积分', value: '0',
      style: { width: '110px' },
    });

    // 类别切换时自动填充建议积分
    function suggestPoints() {
      const k = Number(catSel.value);
      const t = targetSel.value;
      if (k === 1) { // 出勤
        if (t === 'group') { groupInput.value = 30; indivInput.value = 0; }
        else { indivInput.value = 5; groupInput.value = 0; }
      } else if (k === 2) { // 单词
        groupInput.value = 0; indivInput.value = 0; // 用户自填排名对应分
      } else if (k === 3) { // 分享
        indivInput.value = 1; groupInput.value = 0;
      } else if (k === 4) { // 期末
        indivInput.value = 0; groupInput.value = 0;
      } else if (k === 5) { // 拔尖
        if (t.startsWith('member:')) { indivInput.value = 20; groupInput.value = 10; }
        else { indivInput.value = 0; groupInput.value = 10; }
      }
    }
    catSel.addEventListener('change', suggestPoints);
    targetSel.addEventListener('change', suggestPoints);

    const submitBtn = Utils.el('button', { class: 'btn btn-primary' }, ['💾 录入积分']);
    submitBtn.addEventListener('click', () => {
      const category = Number(catSel.value);
      const t = targetSel.value;
      const memberId = t.startsWith('member:') ? Number(t.split(':')[1]) : null;
      const description = descInput.value.trim();
      const ip = Number(indivInput.value) || 0;
      const gp = Number(groupInput.value) || 0;
      if (ip === 0 && gp === 0) { Utils.toast('个人积分与小组积分不能都为 0', 'error'); return; }
      try {
        DB.addRecord({
          member_id: memberId, group_id: state.groupId, category, description,
          individual_points: ip, group_points: gp, week: state.week,
        });
        Utils.toast('已录入积分', 'success');
        descInput.value = '';
        refresh();
      } catch (e) { Utils.toast('录入失败：' + e.message, 'error'); }
    });

    return Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['➕ 录入到「' + group.name + '」']),
      Utils.el('div', { class: 'form-row' }, [
        Utils.el('div', { class: 'form-group' }, [Utils.el('label', {}, ['积分类别']), catSel]),
        Utils.el('div', { class: 'form-group' }, [Utils.el('label', {}, ['归属']), targetSel]),
      ]),
      Utils.el('div', { class: 'form-row' }, [
        Utils.el('div', { class: 'form-group', style: { minWidth: '260px', flex: 2 } }, [
          Utils.el('label', {}, ['说明']), descInput,
        ]),
        Utils.el('div', { class: 'form-group', style: { maxWidth: '120px' } }, [
          Utils.el('label', {}, ['👤 个人']), indivInput,
        ]),
        Utils.el('div', { class: 'form-group', style: { maxWidth: '120px' } }, [
          Utils.el('label', {}, ['👥 小组']), groupInput,
        ]),
      ]),
      Utils.el('div', { class: 'form-actions' }, [submitBtn]),
      Utils.el('p', { style: { color: 'var(--text-soft)', fontSize: '12px', marginTop: '8px' } }, [
        '提示：选择类别与归属后会自动填充建议积分，可手动调整。',
      ]),
    ]);
  }

  /** 当前小组本周记录列表 */
  function renderRecordList(group, members) {
    const records = DB.listRecords({ groupId: state.groupId, week: state.week });
    const cat = DB.CATEGORIES;
    const rows = records.length === 0
      ? [Utils.el('tr', {}, [Utils.el('td', { class: 'empty', colspan: 7 }, ['本周暂无记录'])])]
      : records.map(r => Utils.el('tr', {}, [
          Utils.el('td', {}, [Utils.el('span', { class: 'cat-badge cat-' + r.category }, [cat[r.category].short])]),
          Utils.el('td', {}, [r.member_name ? '👤 ' + r.member_name : '👥 全组']),
          Utils.el('td', {}, [r.description || '-']),
          Utils.el('td', {}, [r.individual_points ? '+' + r.individual_points : '-']),
          Utils.el('td', {}, [r.group_points ? '+' + r.group_points : '-']),
          Utils.el('td', { style: { color: 'var(--text-soft)', fontSize: '12px' } }, [r.created_at]),
          Utils.el('td', {}, [
            Utils.el('button', {
              class: 'btn btn-danger btn-sm',
              onclick: () => {
                if (Utils.confirm('删除该积分记录？')) {
                  DB.deleteRecord(r.id);
                  Utils.toast('已删除', 'success');
                  refresh();
                }
              },
            }, ['删除']),
          ]),
        ]));
    return Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['📋 本周「' + state.week + '」「' + group.name + '」积分记录（' + records.length + ' 条）']),
      Utils.el('div', { class: 'table-wrap' }, [
        Utils.el('table', { class: 'data' }, [
          Utils.el('thead', {}, [Utils.el('tr', {}, [
            Utils.el('th', {}, ['类别']),
            Utils.el('th', {}, ['归属']),
            Utils.el('th', {}, ['说明']),
            Utils.el('th', {}, ['个人']),
            Utils.el('th', {}, ['小组']),
            Utils.el('th', {}, ['录入时间']),
            Utils.el('th', {}, ['操作']),
          ])]),
          Utils.el('tbody', {}, rows),
        ]),
      ]),
    ]);
  }

  function refresh() {
    const view = document.getElementById('view');
    if (!view) return;
    view.innerHTML = '';
    mount(view);
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, adminOnly: true });
})();
