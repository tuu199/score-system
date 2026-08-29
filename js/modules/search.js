/* ============================================================
 * modules/search.js - 【积分查询】模块（学生+管理员均可查询）
 *   关键词 + 小组 + 类别 + 周次 多条件筛选
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'search';
  const MOD_NAME = '积分查询';
  const MOD_ICON = '🔍';

  let state = { keyword: '', groupId: 0, category: 0, week: '' };

  function mount(view) {
    if (!ScoreApp.isAdmin) {
      view.appendChild(Utils.el('div', { class: 'readonly-notice' }, ['🔒 学生模式：仅可查询，不能修改数据']));
    }

    const groups = DB.listGroups();
    const cat = DB.CATEGORIES;
    const weeks = DB.getRecentWeeks(16);

    const kwInput = Utils.el('input', {
      class: 'login-input', placeholder: '搜索组员名 / 小组名 / 说明…',
      value: state.keyword, autocomplete: 'off',
    });
    const groupSel = Utils.el('select', { style: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px' } });
    groupSel.appendChild(Utils.el('option', { value: 0 }, ['全部小组']));
    groups.forEach(g => {
      const opt = Utils.el('option', { value: g.id }, [g.name]);
      if (g.id === state.groupId) opt.selected = true;
      groupSel.appendChild(opt);
    });
    const catSel = Utils.el('select', { style: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px' } });
    catSel.appendChild(Utils.el('option', { value: 0 }, ['全部类别']));
    Object.keys(cat).forEach(k => {
      const opt = Utils.el('option', { value: k }, [cat[k].icon + ' ' + cat[k].name]);
      if (Number(k) === state.category) opt.selected = true;
      catSel.appendChild(opt);
    });
    const weekSel = Utils.el('select', { style: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px' } });
    weekSel.appendChild(Utils.el('option', { value: '' }, ['全部周次']));
    weeks.forEach(w => {
      const opt = Utils.el('option', { value: w }, [w]);
      if (w === state.week) opt.selected = true;
      weekSel.appendChild(opt);
    });

    const searchBtn = Utils.el('button', { class: 'btn btn-primary' }, ['🔍 查询']);
    const resetBtn = Utils.el('button', { class: 'btn' }, ['重置']);
    const doSearch = () => {
      state = { keyword: kwInput.value.trim(), groupId: Number(groupSel.value), category: Number(catSel.value), week: weekSel.value };
      renderResults();
    };
    searchBtn.addEventListener('click', doSearch);
    resetBtn.addEventListener('click', () => {
      state = { keyword: '', groupId: 0, category: 0, week: '' };
      kwInput.value = '';
      groupSel.value = 0;
      catSel.value = 0;
      weekSel.value = '';
      renderResults();
    });
    kwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['🔍 多条件查询']),
      Utils.el('div', { class: 'form-row' }, [
        Utils.el('div', { class: 'form-group', style: { flex: 2 } }, [Utils.el('label', {}, ['关键词']), kwInput]),
        Utils.el('div', { class: 'form-group' }, [Utils.el('label', {}, ['小组']), groupSel]),
        Utils.el('div', { class: 'form-group' }, [Utils.el('label', {}, ['类别']), catSel]),
        Utils.el('div', { class: 'form-group' }, [Utils.el('label', {}, ['周次']), weekSel]),
      ]),
      Utils.el('div', { class: 'form-actions' }, [searchBtn, resetBtn]),
    ]));

    const resultWrap = Utils.el('div', { id: 'search-results' });
    view.appendChild(resultWrap);

    function renderResults() {
      resultWrap.innerHTML = '';
      const records = DB.searchRecords(state);
      let totalIndiv = 0, totalGroup = 0;
      records.forEach(r => {
        totalIndiv += Number(r.individual_points) || 0;
        totalGroup += Number(r.group_points) || 0;
      });

      const statCards = [
        { label: '记录条数', value: String(records.length), extraClass: '' },
        { label: '个人积分合计', value: '+' + Utils.round(totalIndiv), extraClass: 'success' },
        { label: '小组积分合计', value: '+' + Utils.round(totalGroup), extraClass: 'warning' },
      ];
      const statsGrid = Utils.el('div', { class: 'stats-grid' });
      statCards.forEach(s => {
        const card = Utils.el('div', { class: 'stat-card' + (s.extraClass ? ' ' + s.extraClass : '') });
        const lab = Utils.el('div', { class: 'stat-label' });
        lab.textContent = s.label;
        const val = Utils.el('div', { class: 'stat-value' });
        val.textContent = s.value;
        card.appendChild(lab); card.appendChild(val);
        statsGrid.appendChild(card);
      });
      resultWrap.appendChild(statsGrid);

      // L-2：空周次下沉的排序已在 DB.searchRecords 内处理；这里只负责展示
      const cols = ScoreApp.isAdmin ? 9 : 8;
      const rows = records.length === 0
        ? [Utils.el('tr', {}, [Utils.el('td', { class: 'empty', colspan: cols }, ['没有匹配的记录'])])]
        : records.map(r => {
          const tr = Utils.el('tr', { 'data-rid': String(r.id) });
          const catShort = Utils.el('span', { class: 'cat-badge cat-' + r.category });
          catShort.textContent = (cat[r.category] || { short: '其他' }).short;
          tr.appendChild(Utils.el('td', {}, [catShort]));

          const wTd = Utils.el('td', {});
          wTd.textContent = r.week || '-';
          tr.appendChild(wTd);

          const gTd = Utils.el('td', {});
          const gStrong = Utils.el('strong', {});
          gStrong.textContent = r.group_name || '';
          gTd.appendChild(gStrong);
          tr.appendChild(gTd);

          const mTd = Utils.el('td', {});
          mTd.textContent = r.member_name ? '👤 ' + r.member_name : '👥 全组';
          tr.appendChild(mTd);

          const descTd = Utils.el('td', {});
          descTd.textContent = r.description || '-';
          tr.appendChild(descTd);

          const iTd = Utils.el('td', {});
          iTd.textContent = r.individual_points ? '+' + r.individual_points : '-';
          tr.appendChild(iTd);

          const gpTd = Utils.el('td', {});
          gpTd.textContent = r.group_points ? '+' + r.group_points : '-';
          tr.appendChild(gpTd);

          const cTd = Utils.el('td', { style: { color: 'var(--text-soft)', fontSize: '12px' } });
          cTd.textContent = r.created_at || '';
          tr.appendChild(cTd);

          if (ScoreApp.isAdmin) {
            const opTd = Utils.el('td', {});
            const delBtn = Utils.el('button', { class: 'btn btn-danger btn-sm' });
            delBtn.textContent = '删除';
            delBtn.addEventListener('click', async () => {
              if (!Utils.confirm('删除该积分记录？')) return;
              if (delBtn.dataset.locked) return;
              delBtn.dataset.locked = '1'; delBtn.disabled = true;
              try {
                await DB.deleteRecord(r.id);
                Utils.toast('已删除', 'success');
                renderResults();
              } catch (e) {
                Utils.toast('删除失败：' + e.message, 'error');
                delBtn.disabled = false; delBtn.dataset.locked = '';
              }
            });
            opTd.appendChild(delBtn);
            tr.appendChild(opTd);
          }
          return tr;
        });

      const theadCells = [
        Utils.el('th', {}, ['类别']),
        Utils.el('th', {}, ['周次']),
        Utils.el('th', {}, ['小组']),
        Utils.el('th', {}, ['归属']),
        Utils.el('th', {}, ['说明']),
        Utils.el('th', {}, ['个人']),
        Utils.el('th', {}, ['小组']),
        Utils.el('th', {}, ['时间']),
      ];
      if (ScoreApp.isAdmin) theadCells.push(Utils.el('th', {}, ['操作']));

      resultWrap.appendChild(Utils.el('div', { class: 'card' }, [
        Utils.el('div', { class: 'card-title' }, ['📋 查询结果（' + records.length + ' 条）']),
        Utils.el('div', { class: 'table-wrap' }, [
          Utils.el('table', { class: 'data' }, [
            Utils.el('thead', {}, [Utils.el('tr', {}, theadCells)]),
            Utils.el('tbody', {}, rows),
          ]),
        ]),
      ]));
    }
    renderResults();
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, adminOnly: false });
})();
