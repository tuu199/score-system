/* ============================================================
 * app.js - 学习积分系统 主框架
 * 管理员密码登录 / 学生只读模式 / 模块注册与路由
 * 基于 Supabase 云数据库（实时同步，无需手动上传）
 * ============================================================ */
(function (global) {
  'use strict';

  const modules = [];
  let currentModuleId = null;
  let currentView = null;
  let isAdmin = false;

  /** 注册模块：{ id, name, icon, mount, adminOnly? } */
  function registerModule(mod) {
    if (!mod || !mod.id || !mod.name || typeof mod.mount !== 'function') return;
    modules.push(Object.assign({ icon: '📄', adminOnly: false }, mod));
    if (document.getElementById('nav')) renderNav();
  }
  function findModule(id) { return modules.find(m => m.id === id); }

  /** 渲染导航：学生模式隐藏 adminOnly 模块 */
  function renderNav() {
    const nav = document.getElementById('nav');
    if (nav) {
      nav.innerHTML = '';
      modules.forEach(mod => {
        if (mod.adminOnly && !isAdmin) return;
        nav.appendChild(Utils.el('div', {
          class: 'nav-item' + (mod.id === currentModuleId ? ' active' : ''),
          onclick: () => navigate(mod.id),
        }, [mod.icon + ' ' + mod.name]));
      });
    }
    // 同步渲染手机端底部 Tab Bar
    const mnav = document.getElementById('mobile-nav');
    if (mnav) {
      mnav.innerHTML = '';
      modules.forEach(mod => {
        if (mod.adminOnly && !isAdmin) return;
        mnav.appendChild(Utils.el('div', {
          class: 'mobile-nav-item' + (mod.id === currentModuleId ? ' active' : ''),
          onclick: () => navigate(mod.id),
        }, [
          Utils.el('span', { class: 'mnav-icon' }, [mod.icon]),
          Utils.el('span', {}, [mod.name]),
        ]));
      });
    }
  }

  /** 切换模块 */
  function navigate(id) {
    const mod = findModule(id);
    if (!mod) return;
    if (mod.adminOnly && !isAdmin) {
      Utils.toast('该功能需要管理员权限', 'error');
      return;
    }
    const view = document.getElementById('view');
    if (currentModuleId) {
      const prev = findModule(currentModuleId);
      if (prev && typeof prev.unmount === 'function') {
        try { prev.unmount(currentView); } catch (e) { console.error(e); }
      }
    }
    view.innerHTML = '';
    // 清除可能残留的模态弹窗（小组编辑/组员管理等），但保留 login-modal 和 qrcode-modal
    document.querySelectorAll('body > .modal').forEach(m => {
      if (m.id !== 'login-modal' && m.id !== 'qrcode-modal') m.remove();
    });
    currentView = view;
    currentModuleId = id;
    renderNav();
    if (global.location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    try { mod.mount(view); }
    catch (e) {
      console.error(e);
      view.appendChild(Utils.el('div', { class: 'card', style: { color: 'var(--danger)' } },
        ['模块加载失败：' + e.message]));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** ========== 管理员登录 ========== */
  // H-2：登录失败计数 + 冷却期（只在内存有效，刷新会重置，但 3 次/分钟 已能阻止手工暴力破解）
  const LOGIN_COOLDOWN_MS = 60 * 1000; // 1 分钟
  const MAX_FAIL = 3;
  let _loginFails = 0;
  let _loginCoolUntil = 0;
  // H-2：首次使用默认密码 (admin123) 登录后，5 分钟内必须改密，否则自动登出
  let _forceChangePasswordDeadline = 0;
  let _forceChangeTimer = null;

  function showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (!modal) return;
    // H-2：展示剩余冷却时间
    const coolLeft = Math.max(0, _loginCoolUntil - Date.now());
    const hint = document.getElementById('login-hint') || document.createElement('p');
    hint.id = 'login-hint';
    hint.style.cssText = 'color:var(--danger);font-size:12px;margin-top:6px;min-height:16px;';
    modal.querySelector('.modal-body').appendChild(hint);
    if (coolLeft > 0) {
      hint.textContent = '⚠️ 密码错误次数过多，请等待 ' + Math.ceil(coolLeft / 1000) + ' 秒后再试';
    }
    modal.classList.remove('hidden');
    const input = document.getElementById('login-pwd');
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
  function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.add('hidden');
  }

  /** H-2：弹出修改默认密码的模态，要求用户输入新密码完成后才能继续操作 */
  function _promptChangeDefaultPassword() {
    const overlay = Utils.el('div', { class: 'modal', style: { zIndex: '9999' } });
    const pwd1 = Utils.el('input', {
      class: 'login-input', type: 'password', placeholder: '请输入新密码（至少 6 位）', autocomplete: 'new-password',
    });
    const pwd2 = Utils.el('input', {
      class: 'login-input', type: 'password', placeholder: '请再次输入新密码', autocomplete: 'new-password',
    });
    const hint = Utils.el('p', { style: { color: 'var(--danger)', fontSize: '12px', marginTop: '6px', minHeight: '16px' } }, []);
    const submit = Utils.el('button', { class: 'btn btn-primary' }, ['设置新密码']);
    overlay.appendChild(Utils.el('div', { class: 'modal-content', style: { maxWidth: '420px' } }, [
      Utils.el('div', { class: 'modal-header' }, [Utils.el('h2', {}, ['🔐 必须修改默认管理员密码'])]),
      Utils.el('div', { class: 'modal-body' }, [
        Utils.el('p', { style: { color: 'var(--text-soft)', fontSize: '13px', marginBottom: '10px' } },
          ['出于安全考虑，首次使用默认密码「admin123」后，请立即修改为专属密码。',
            Utils.el('br', {}),
            '5 分钟内未完成将自动退出管理员。']),
        Utils.el('div', { class: 'form-group', style: { marginBottom: '10px' } }, [Utils.el('label', {}, ['新密码']), pwd1]),
        Utils.el('div', { class: 'form-group', style: { marginBottom: '10px' } }, [Utils.el('label', {}, ['确认密码']), pwd2]),
        hint,
        Utils.el('div', { class: 'form-actions' }, [submit]),
      ]),
    ]));
    document.body.appendChild(overlay);
    setTimeout(() => pwd1.focus(), 80);

    function doChange() {
      const a = pwd1.value.trim(), b = pwd2.value.trim();
      if (a.length < 6) { hint.textContent = '密码至少 6 位'; return; }
      if (a === 'admin123') { hint.textContent = '新密码不能和默认密码相同'; return; }
      if (a !== b) { hint.textContent = '两次输入的密码不一致'; return; }
      DB.setPassword(a);
      DB.setSetting('admin_password_changed', '1');
      Utils.toast('管理员密码已更新，请妥善保管', 'success');
      _forceChangePasswordDeadline = 0;
      if (_forceChangeTimer) { clearTimeout(_forceChangeTimer); _forceChangeTimer = null; }
      document.body.removeChild(overlay);
    }
    submit.addEventListener('click', doChange);
    pwd1.addEventListener('keydown', e => { if (e.key === 'Enter') doChange(); });
    pwd2.addEventListener('keydown', e => { if (e.key === 'Enter') doChange(); });
  }

  function tryLogin(password) {
    // H-2：冷却期内即使输入正确密码也拒绝
    const now = Date.now();
    if (_loginCoolUntil && now < _loginCoolUntil) {
      Utils.toast(`密码错误次数过多，请 ${Math.ceil((_loginCoolUntil - now) / 1000)} 秒后再试`, 'error');
      return false;
    }
    if (!password) { Utils.toast('请输入密码', 'error'); return false; }
    if (DB.checkPassword(password)) {
      isAdmin = true;
      _loginFails = 0;
      localStorage.setItem('score_admin', '1');
      hideLoginModal();
      updateModeIndicator();
      renderNav();
      Utils.toast('管理员登录成功', 'success');

      // H-2：如果仍使用默认密码 admin123，提示立刻改密 + 5 分钟后强制登出
      const stillDefault = DB.getPassword() === 'admin123';
      const alreadyChanged = DB.getSetting('admin_password_changed', '') === '1';
      if (stillDefault && !alreadyChanged) {
        Utils.toast('⚠️ 检测到仍使用默认密码 admin123，请立即修改', 'warning');
        _forceChangePasswordDeadline = Date.now() + 5 * 60 * 1000;
        if (_forceChangeTimer) clearTimeout(_forceChangeTimer);
        _forceChangeTimer = setTimeout(() => {
          if (!isAdmin) return;
          Utils.toast('超过 5 分钟未改默认密码，已自动退出', 'error');
          logout();
        }, 5 * 60 * 1000);
        setTimeout(_promptChangeDefaultPassword, 500);
      }

      const mod = findModule(currentModuleId);
      if (!mod || (mod.adminOnly && !isAdmin)) navigate('record');
      else navigate(currentModuleId);
      return true;
    }
    _loginFails += 1;
    if (_loginFails >= MAX_FAIL) {
      _loginCoolUntil = Date.now() + LOGIN_COOLDOWN_MS;
      Utils.toast(`密码错误 ${_loginFails} 次，已限制登录 ${LOGIN_COOLDOWN_MS / 1000} 秒`, 'error');
      // 同步更新登录弹窗提示
      const hint = document.getElementById('login-hint');
      if (hint) hint.textContent = '⚠️ 连续错误过多，请等待 ' + (LOGIN_COOLDOWN_MS / 1000) + ' 秒后再尝试';
    } else {
      Utils.toast(`密码错误（还可尝试 ${MAX_FAIL - _loginFails} 次）`, 'error');
    }
    return false;
  }
  function logout() {
    isAdmin = false;
    localStorage.removeItem('score_admin');
    if (_forceChangeTimer) { clearTimeout(_forceChangeTimer); _forceChangeTimer = null; }
    _forceChangePasswordDeadline = 0;
    updateModeIndicator();
    renderNav();
    Utils.toast('已退出管理员模式', 'info');
    navigate('rules');
  }

  /** 更新顶部模式标识 */
  function updateModeIndicator() {
    const btn = document.getElementById('btn-mode');
    const badge = document.getElementById('mode-badge');
    if (!btn || !badge) return;
    const clearBtn = document.getElementById('btn-clear');
    if (isAdmin) {
      btn.textContent = '退出管理员';
      btn.className = 'btn btn-danger btn-sm';
      badge.textContent = '管理员';
      badge.className = 'mode-badge admin';
      if (clearBtn) clearBtn.style.display = 'inline-block';
    } else {
      btn.textContent = '管理员登录';
      btn.className = 'btn btn-ghost btn-sm';
      badge.textContent = '学生';
      badge.className = 'mode-badge student';
      if (clearBtn) clearBtn.style.display = 'none';
    }
  }

  /** ========== 导入导出 ========== */
  function setupIO() {
    // 💾 导出 JSON 文件（本地备份用）
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      if (!isAdmin) { Utils.toast('需要管理员权限', 'error'); return; }
      try {
        const data = DB.exportJSON();
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `学习积分共享_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Utils.toast('数据已导出到本地文件', 'success');
      } catch (e) {
        Utils.toast('导出失败：' + e.message, 'error');
      }
    });

    // 🔄 从云端重新加载最新数据（Supabase 实时同步）
    document.getElementById('btn-sync')?.addEventListener('click', async () => {
      if (!isAdmin) { Utils.toast('需要管理员权限', 'error'); return; }
      try {
        Utils.toast('正在从云端同步…', 'info');
        await DB.reload();
        Utils.toast('同步成功，已刷新为最新数据', 'success');
        navigate(currentModuleId);
      } catch (e) {
        Utils.toast('同步失败：' + e.message, 'error');
      }
    });

    // 🗑️ 清零所有积分记录和分享（保留小组、组员）
    document.getElementById('btn-clear')?.addEventListener('click', async () => {
      if (!isAdmin) { Utils.toast('需要管理员权限', 'error'); return; }
      if (!await Utils.confirm('⚠️ 确认清零所有积分记录和分享？\n此操作不可撤销！')) return;
      if (!await Utils.confirm('再次确认：积分和分享将被全部删除，小组和组员保留。')) return;
      DB.clearAllRecords();
      Utils.toast('已清零所有积分和分享', 'success');
      navigate(currentModuleId);
    });
  }

  /** ========== 二维码弹窗 ========== */
  function showQrcodeModal() {
    const modal = document.getElementById('qrcode-modal');
    const box = document.getElementById('qrcode-box');
    const urlEl = document.getElementById('qrcode-url');
    if (!modal || !box) return;
    box.innerHTML = '';
    modal.classList.remove('hidden');

    // 当前页面 URL（学生扫码直接访问，数据自动从 Supabase 加载）
    const url = global.location.origin + global.location.pathname;

    try {
      if (typeof QRCode === 'undefined') {
        Utils.toast('二维码库未加载，请检查网络', 'error');
        return;
      }
      new QRCode(box, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    } catch (e) {
      Utils.toast('生成二维码失败：' + e.message, 'error');
      return;
    }
    urlEl.textContent = url;
  }
  function hideQrcodeModal() {
    const modal = document.getElementById('qrcode-modal');
    if (modal) modal.classList.add('hidden');
  }
  function setupQrcode() {
    document.getElementById('btn-qrcode')?.addEventListener('click', showQrcodeModal);
    document.getElementById('qrcode-close')?.addEventListener('click', hideQrcodeModal);
    document.getElementById('qrcode-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'qrcode-modal') hideQrcodeModal();
    });
    document.getElementById('qrcode-copy')?.addEventListener('click', () => {
      const url = document.getElementById('qrcode-url').textContent || '';
      if (!url) return;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(
          () => Utils.toast('网址已复制', 'success'),
          () => Utils.toast('复制失败，请手动选择', 'error')
        );
      } else {
        const ta = document.createElement('textarea');
        ta.value = url; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); Utils.toast('网址已复制', 'success'); }
        catch (e) { Utils.toast('复制失败，请手动选择', 'error'); }
        document.body.removeChild(ta);
      }
    });
  }

  /** ========== 启动 ========== */
  async function init() {
    const loading = document.getElementById('loading');
    const view = document.getElementById('view');
    try {
      await DB.init();
      // 恢复管理员登录状态（刷新后不丢失）
      if (localStorage.getItem('score_admin') === '1') {
        isAdmin = true;
      }
      setupIO();
      setupQrcode();
      // 登录弹窗事件
      document.getElementById('login-submit')?.addEventListener('click', () => {
        tryLogin(document.getElementById('login-pwd').value);
      });
      document.getElementById('login-pwd')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryLogin(e.target.value);
      });
      document.getElementById('login-cancel')?.addEventListener('click', hideLoginModal);
      document.getElementById('login-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'login-modal') hideLoginModal();
      });
      // 模式切换按钮
      document.getElementById('btn-mode')?.addEventListener('click', () => {
        if (isAdmin) logout();
        else showLoginModal();
      });
      currentView = view;
      loading.classList.add('hidden');
      view.classList.remove('hidden');
      updateModeIndicator();
      const hashId = (global.location.hash || '').replace(/^#/, '');
      const defaultId = (findModule(hashId) && hashId) || (modules[0] && modules[0].id);
      if (defaultId) navigate(defaultId);
      else view.appendChild(Utils.el('div', { class: 'card' }, ['暂无模块']));
    } catch (e) {
      console.error(e);
      loading.innerHTML = `<p style="color:var(--danger)">初始化失败：${Utils.escapeHtml(e.message)}</p>
        <p style="margin-top:10px;color:var(--text-soft);font-size:13px">请检查网络连接（需从 CDN 加载 Supabase SDK），刷新重试。</p>`;
    }
  }

  global.addEventListener('hashchange', () => {
    const id = global.location.hash.replace(/^#/, '');
    if (id && id !== currentModuleId && findModule(id)) navigate(id);
  });

  global.ScoreApp = {
    init, registerModule, navigate,
    get isAdmin() { return isAdmin; },
  };
})(window);
