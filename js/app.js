/* ============================================================
 * app.js - 学习积分系统 主框架
 * 管理员密码登录 / 学生只读模式 / 模块注册与路由
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
  function showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const input = document.getElementById('login-pwd');
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
  function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.add('hidden');
  }
  function tryLogin(password) {
    if (DB.checkPassword(password)) {
      isAdmin = true;
      hideLoginModal();
      updateModeIndicator();
      renderNav();
      Utils.toast('管理员登录成功', 'success');
      // 如果当前在 adminOnly 模块之外，跳转到积分录入
      const mod = findModule(currentModuleId);
      if (!mod || (mod.adminOnly && !isAdmin)) navigate('record');
      else navigate(currentModuleId); // 重新 mount 以显示编辑控件
      return true;
    }
    Utils.toast('密码错误', 'error');
    return false;
  }
  function logout() {
    isAdmin = false;
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
    if (isAdmin) {
      btn.textContent = '退出管理员';
      btn.className = 'btn btn-danger btn-sm';
      badge.textContent = '管理员';
      badge.className = 'mode-badge admin';
    } else {
      btn.textContent = '管理员登录';
      btn.className = 'btn btn-ghost btn-sm';
      badge.textContent = '学生';
      badge.className = 'mode-badge student';
    }
  }

  /** ========== 导入导出 ========== */
  function setupIO() {
    // 导出 .db（完整 SQLite 文件，管理员备份用）
    document.getElementById('btn-export')?.addEventListener('click', () => {
      try {
        const data = DB.exportDatabase();
        Utils.downloadBlob(data, `学习积分数据_${new Date().toISOString().slice(0, 10)}.db`, 'application/x-sqlite3');
        Utils.toast('数据库已导出', 'success');
      } catch (e) { Utils.toast('导出失败：' + e.message, 'error'); }
    });
    // 导出 JSON + 自动上传到服务器（用于公网共享，学生端通过 ?data=<url> 加载）
    document.getElementById('btn-export-json')?.addEventListener('click', async () => {
      if (!isAdmin) { Utils.toast('需要管理员权限', 'error'); return; }
      try {
        const data = DB.exportJSON();
        const jsonStr = JSON.stringify(data, null, 2);
        // 同时下载本地备份
        const blob = new Blob([jsonStr], { type: 'application/json' });
        Utils.downloadBlob(blob, `学习积分共享_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
        // 自动上传到服务器，生成 shared-data.json
        Utils.toast('正在上传共享数据…', 'success');
        const resp = await fetch('/upload-shared', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: jsonStr,
        });
        if (!resp.ok) throw new Error('上传失败：HTTP ' + resp.status);
        const result = await resp.json();
        // 自动设置共享数据 URL（同源相对路径，部署到任何域名都可用）
        const sharedUrl = global.location.origin + '/shared-data.json';
        DB.setSetting('shared_data_url', sharedUrl);
        Utils.toast('已上传并更新共享数据，学生扫码即可查看', 'success');
      } catch (e) { Utils.toast('导出失败：' + e.message, 'error'); }
    });
    const fileInput = document.getElementById('file-import');
    document.getElementById('btn-import')?.addEventListener('click', () => {
      if (!isAdmin) { Utils.toast('需要管理员权限', 'error'); return; }
      fileInput?.click();
    });
    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (!Utils.confirm(`导入「${file.name}」将覆盖当前所有数据，确定继续？`)) { fileInput.value = ''; return; }
        const buf = await Utils.readFileAsArrayBuffer(file);
        DB.importDatabase(buf);
        Utils.toast('导入成功，正在刷新…', 'success');
        fileInput.value = '';
        setTimeout(() => global.location.reload(), 600);
      } catch (err) { Utils.toast('导入失败：' + err.message, 'error'); fileInput.value = ''; }
    });
  }

  /** ========== 二维码弹窗 ========== */
  // 通过 WebRTC 探测本机局域网 IP（手机扫码访问用）；探测失败返回 null
  function detectLanIp() {
    return new Promise((resolve) => {
      if (!global.RTCPeerConnection) return resolve(null);
      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        let done = false;
        const finish = (v) => { if (!done) { done = true; try { pc.close(); } catch (e) {} resolve(v); } };
        pc.onicecandidate = (e) => {
          if (!e.candidate) { finish(null); return; }
          const m = /((?:192\.168|10\.|172\.(?:1[6-9]|2\d|3[01])\.)(?:\d{1,3}\.){1,2}\d{1,3})/.exec(e.candidate.candidate || '');
          if (m) finish(m[1]);
        };
        pc.createDataChannel('lan-detect');
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => finish(null));
        setTimeout(() => finish(null), 2500);
      } catch (e) { resolve(null); }
    });
  }

  async function showQrcodeModal() {
    const modal = document.getElementById('qrcode-modal');
    const box = document.getElementById('qrcode-box');
    const urlEl = document.getElementById('qrcode-url');
    if (!modal || !box) return;
    box.innerHTML = '';
    modal.classList.remove('hidden');

    // 构造当前页面 URL（不含 hash）
    let baseUrl = global.location.origin + global.location.pathname;
    let lanIp = null;
    if (/localhost|127\.0\.0\.1/.test(baseUrl)) {
      lanIp = await detectLanIp();
      if (lanIp) baseUrl = baseUrl.replace(/localhost|127\.0\.0\.1/, lanIp);
    }

    // 拼接共享数据 URL（管理员已设置过则带上 ?data=）
    let url = baseUrl;
    const sharedDataUrl = DB.getSetting('shared_data_url');
    if (sharedDataUrl) {
      url = baseUrl + '?data=' + encodeURIComponent(sharedDataUrl);
    }

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

    // 管理员显示「设置共享数据 URL」入口
    let setDataBtn = document.getElementById('qrcode-set-data');
    if (!setDataBtn) {
      setDataBtn = Utils.el('button', {
        id: 'qrcode-set-data',
        class: 'btn btn-ghost btn-sm',
        style: 'margin-top:8px;width:100%',
      }, ['🔧 设置共享数据 URL']);
      urlEl.parentElement.appendChild(setDataBtn);
    }
    setDataBtn.style.display = isAdmin ? 'block' : 'none';
    setDataBtn.onclick = () => {
      const current = DB.getSetting('shared_data_url') || '';
      const input = prompt('请粘贴已上传的 JSON 共享数据 URL（如 Gist raw 链接）：', current);
      if (input === null) return;
      DB.setSetting('shared_data_url', input.trim());
      Utils.toast(input.trim() ? '已保存，二维码将带数据 URL' : '已清除共享数据 URL', 'success');
      showQrcodeModal(); // 重新生成二维码
    };

    // 探测失败提示
    if (!lanIp && /localhost|127\.0\.0\.1/.test(url)) {
      Utils.toast('手机无法扫码访问 localhost。请用电脑浏览器访问 http://电脑IP:8000/ 后再生成二维码', 'error');
    }
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
        // 回退方案
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
      try { DB.seedIfEmpty(); } catch (e) { /* 忽略 */ }
      // 学生端：检测 URL 中的 ?data=<json-url>，自动加载共享数据
      const params = new URLSearchParams(global.location.search);
      const dataUrl = params.get('data');
      if (dataUrl) {
        try {
          await DB.loadFromURL(dataUrl);
          // 数据来源为共享数据时，强制学生模式（只读）
          isAdmin = false;
          Utils.toast('已加载最新积分数据', 'success');
        } catch (e) {
          Utils.toast('加载数据失败：' + e.message, 'error');
        }
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
        <p style="margin-top:10px;color:var(--text-soft);font-size:13px">请检查网络连接（需从 CDN 加载 sql.js），刷新重试。</p>`;
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
