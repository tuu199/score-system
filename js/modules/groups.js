/* ============================================================
 * modules/groups.js - 【小组管理】模块（管理员可编辑）
 *   小组列表 + 组员管理（增删改）
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'groups';
  const MOD_NAME = '小组管理';
  const MOD_ICON = '👥';

  /** 渲染：小组列表 */
  function renderGroups(view) {
    const groups = DB.listGroups();
    const rows = groups.length === 0
      ? [Utils.el('tr', {}, [Utils.el('td', { class: 'empty', colspan: 7 }, ['暂无小组数据，请登录管理员后新增小组'])])]
      : groups.map(g => Utils.el('tr', { 'data-id': String(g.id) }, [
          Utils.el('td', {}, [g.id]),
          Utils.el('td', {}, [Utils.el('strong', {}, [g.name])]),
          Utils.el('td', {}, [g.leader_name]),
          Utils.el('td', {}, [g.member_count + ' 人']),
          Utils.el('td', {}, [Utils.el('span', { class: 'rule-points point-group' }, ['👥 +' + g.group_pts])]),
          Utils.el('td', {}, [Utils.el('span', { class: 'rule-points point-individual' }, ['👤 +' + (g.member_indiv_pts + g.group_indiv_pts)])]),
          Utils.el('td', {},
            ScoreApp.isAdmin ? [
              Utils.el('button', {
                class: 'btn btn-ghost btn-sm act-member',
              }, ['组员']),
              Utils.el('button', {
                class: 'btn btn-ghost btn-sm act-edit',
              }, ['编辑']),
              Utils.el('button', {
                class: 'btn btn-danger btn-sm act-delete',
              }, ['删除']),
            ] : [Utils.el('button', {
              class: 'btn btn-ghost btn-sm act-view',
            }, ['查看组员'])]
          ),
        ]));
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, [
        Utils.el('span', {}, ['👥 小组列表（共 ' + groups.length + ' 组）']),
        ScoreApp.isAdmin ? Utils.el('button', {
          class: 'btn btn-primary btn-sm',
        }, ['+ 新增小组']) : Utils.el('span', {}),
      ]),
      Utils.el('div', { class: 'table-wrap' }, [
        Utils.el('table', { class: 'data' }, [
          Utils.el('thead', {}, [Utils.el('tr', {}, [
            Utils.el('th', {}, ['ID']),
            Utils.el('th', {}, ['小组名称']),
            Utils.el('th', {}, ['组长']),
            Utils.el('th', {}, ['组员数']),
            Utils.el('th', {}, ['小组积分']),
            Utils.el('th', {}, ['个人积分累计']),
            Utils.el('th', {}, ['操作']),
          ])]),
          Utils.el('tbody', {}, rows),
        ]),
      ]),
    ])]));

    // 挂事件（新增按钮 + 每行按钮）
    const card = view.querySelector('.card');
    const addBtn = card?.querySelector('.card-title .btn-primary');
    if (addBtn) addBtn.addEventListener('click', () => openGroupModal());
    rows.forEach((tr) => {
      const gid = tr.getAttribute('data-id');
      if (!gid) return;
      const g = groups.find(x => String(x.id) === gid);
      if (!g) return;
      const mb = tr.querySelector('.act-member');
      const ed = tr.querySelector('.act-edit');
      const dl = tr.querySelector('.act-delete');
      const vi = tr.querySelector('.act-view');
      if (mb) mb.addEventListener('click', () => openMemberPanel(g.id, g.name));
      if (ed) ed.addEventListener('click', () => openGroupModal(g));
      if (dl) dl.addEventListener('click', async () => {
        if (!Utils.confirm(`删除「${g.name}」将连同其组员与积分记录一并清除，确定继续？`)) return;
        if (dl.dataset.locked) return;
        dl.dataset.locked = '1'; dl.disabled = true;
        try {
          await DB.deleteGroup(g.id);
          Utils.toast('已删除小组', 'success');
          refresh();
        } catch (e) {
          Utils.toast('删除失败：' + e.message, 'error');
          dl.disabled = false; dl.dataset.locked = '';
        }
      });
      if (vi) vi.addEventListener('click', () => openMemberPanel(g.id, g.name, true));
    });
  }


  /** 小组新增/编辑弹窗 */
  function openGroupModal(group = null) {
    if (!ScoreApp.isAdmin) { Utils.toast('需要管理员权限', 'error'); return; }
    const isEdit = !!group;
    const overlay = Utils.el('div', { class: 'modal' });
    const inputName = Utils.el('input', {
      class: 'login-input', placeholder: '如 胡楚睿组', value: group ? group.name : '', autocomplete: 'off',
    });
    const inputLeader = Utils.el('input', {
      class: 'login-input', placeholder: '组长姓名', value: group ? group.leader_name : '', autocomplete: 'off',
    });
    const cancelBtn = Utils.el('button', { class: 'btn' }, ['取消']);
    const saveBtn = Utils.el('button', { class: 'btn btn-primary' }, ['保存']);
    overlay.appendChild(Utils.el('div', { class: 'modal-content' }, [
      Utils.el('div', { class: 'modal-header' }, [Utils.el('h2', {}, [(isEdit ? '编辑' : '新增') + '小组'])]),
      Utils.el('div', { class: 'modal-body' }, [
        Utils.el('div', { class: 'form-group', style: { marginBottom: '12px' } }, [
          Utils.el('label', {}, ['小组名称']),
          inputName,
        ]),
        Utils.el('div', { class: 'form-group', style: { marginBottom: '12px' } }, [
          Utils.el('label', {}, ['组长姓名']),
          inputLeader,
        ]),
      ]),
      Utils.el('div', { class: 'modal-footer' }, [cancelBtn, saveBtn]),
    ]));
    document.body.appendChild(overlay);
    setTimeout(() => inputName.focus(), 100);

    cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));
    let _lock = false;
    saveBtn.addEventListener('click', async () => {
      const name = inputName.value.trim();
      const leader_name = inputLeader.value.trim();
      if (!name || !leader_name) { Utils.toast('请填写小组名称与组长姓名', 'error'); return; }
      if (_lock) return;
      _lock = true; saveBtn.disabled = true;
      const orig = saveBtn.textContent;
      saveBtn.textContent = '保存中…';
      try {
        if (isEdit) await DB.updateGroup(group.id, { name, leader_name });
        else await DB.addGroup({ name, leader_name });
        Utils.toast(isEdit ? '已更新小组' : '已新增小组', 'success');
        document.body.removeChild(overlay);
        refresh();
      } catch (e) {
        Utils.toast('保存失败：' + e.message, 'error');
        _lock = false; saveBtn.disabled = false; saveBtn.textContent = orig;
      }
    });
  }

  /** 组员面板（查看 / 编辑） */
  function openMemberPanel(groupId, groupName, readOnly = false) {
    const ro = readOnly || !ScoreApp.isAdmin;
    const overlay = Utils.el('div', { class: 'modal' });
    const listWrap = Utils.el('div', {});
    function drawList() {
      const members = DB.listMembers(groupId);
      listWrap.innerHTML = '';
      if (members.length === 0) {
        listWrap.appendChild(Utils.el('p', { style: { color: 'var(--text-soft)', textAlign: 'center', padding: '14px' } }, ['暂无组员']));
        return;
      }
      const rows = members.map(m => Utils.el('tr', { 'data-mid': String(m.id) }, [
        Utils.el('td', {}, [Utils.el('strong', {}, [m.name])]),
        Utils.el('td', { style: { color: 'var(--text-soft)', fontSize: '12px' } }, [m.created_at]),
        ro ? Utils.el('td', {}, []) : Utils.el('td', {}, [
          Utils.el('button', { class: 'btn btn-ghost btn-sm act-rename' }, ['改名']),
          Utils.el('button', { class: 'btn btn-danger btn-sm act-del' }, ['删除']),
        ]),
      ]));
      listWrap.appendChild(Utils.el('table', { class: 'data' }, [
        Utils.el('thead', {}, [Utils.el('tr', {}, [
          Utils.el('th', {}, ['姓名']),
          Utils.el('th', {}, ['加入时间']),
          ro ? Utils.el('th', {}, []) : Utils.el('th', {}, ['操作']),
        ])]),
        Utils.el('tbody', {}, rows),
      ]));
      // 挂行内操作事件
      rows.forEach((tr) => {
        const mid = tr.getAttribute('data-mid');
        if (!mid) return;
        const m = members.find(x => String(x.id) === mid);
        if (!m) return;
        const rn = tr.querySelector('.act-rename');
        const dl = tr.querySelector('.act-del');
        if (rn) rn.addEventListener('click', async () => {
          const newName = window.prompt('修改组员姓名', m.name);
          if (newName && newName.trim() && newName !== m.name) {
            if (rn.dataset.locked) return;
            rn.dataset.locked = '1'; rn.disabled = true;
            try {
              await DB.updateMember(m.id, { name: newName.trim(), group_id: groupId });
              Utils.toast('已更新', 'success');
              drawList();
            } catch (e) {
              Utils.toast('改名失败：' + e.message, 'error');
              rn.disabled = false; rn.dataset.locked = '';
            }
          }
        });
        if (dl) dl.addEventListener('click', async () => {
          if (!Utils.confirm(`删除组员「${m.name}」？相关积分记录将被保留但不再归属个人。`)) return;
          if (dl.dataset.locked) return;
          dl.dataset.locked = '1'; dl.disabled = true;
          try {
            await DB.deleteMember(m.id);
            Utils.toast('已删除', 'success');
            drawList();
          } catch (e) {
            Utils.toast('删除失败：' + e.message, 'error');
            dl.disabled = false; dl.dataset.locked = '';
          }
        });
      });
    }
    drawList();

    const inputName = Utils.el('input', { class: 'login-input', placeholder: '组员姓名', autocomplete: 'off' });
    const addBtn = Utils.el('button', { class: 'btn btn-primary btn-sm' }, ['+ 添加']);
    let _adding = false;
    addBtn.addEventListener('click', async () => {
      const name = inputName.value.trim();
      if (!name) { Utils.toast('请输入姓名', 'error'); return; }
      if (_adding) return;
      _adding = true; addBtn.disabled = true;
      const orig = addBtn.textContent;
      addBtn.textContent = '添加中…';
      try {
        await DB.addMember({ name, group_id: groupId });
        Utils.toast('已添加「' + name + '」', 'success');
        inputName.value = '';
        drawList();
      } catch (e) {
        Utils.toast('添加失败：' + e.message, 'error');
        _adding = false; addBtn.disabled = false; addBtn.textContent = orig;
      }
    });

    overlay.appendChild(Utils.el('div', { class: 'modal-content', style: { width: '520px' } }, [
      Utils.el('div', { class: 'modal-header' }, [Utils.el('h2', {}, ['「' + groupName + '」组员管理'])]),
      Utils.el('div', { class: 'modal-body' }, [
        ro ? Utils.el('div', { class: 'readonly-notice' }, ['🔒 学生模式：仅查看']) : Utils.el('div', {}),
        listWrap,
        ro ? Utils.el('div', {}, []) : Utils.el('div', { class: 'form-row', style: { marginTop: '12px' } }, [
          Utils.el('div', { class: 'form-group' }, [
            Utils.el('label', {}, ['添加组员']),
            inputName,
          ]),
          Utils.el('div', { style: { display: 'flex', alignItems: 'flex-end' } }, [addBtn]),
        ]),
      ]),
      Utils.el('div', { class: 'modal-footer' }, []),
    ]));
    const footer = overlay.querySelector('.modal-footer');
    const closeBtn = Utils.el('button', { class: 'btn' }, ['关闭']);
    closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
    footer.appendChild(closeBtn);
    document.body.appendChild(overlay);
  }

  function refresh() {
    const view = document.getElementById('view');
    if (!view) return;
    view.innerHTML = '';
    mount(view);
  }

  function mount(view) {
    if (!ScoreApp.isAdmin) {
      view.appendChild(Utils.el('div', { class: 'readonly-notice' }, ['🔒 学生模式：仅可查看，如需修改请联系管理员登录。']));
    }
    renderGroups(view);
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, adminOnly: false });
})();
