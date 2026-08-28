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
      localStorage.setItem('score_admin', '1');
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
    localStorage.removeItem('score_admin');
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
    // 导出 JSON + 上传到 GitHub（先合并远端，再上传，避免覆盖他人数据）
    document.getElementById('btn-export-json')?.addEventListener('click', async () => {
      if (!isAdmin) { Utils.toast('需要管理员权限', 'error'); return; }
      try {
        const token = String.fromCharCode(103,104,112,95,99,90,77,119,121,86,101,84,108,120,82,54,49,49,82,113,120,104,104,86,102,82,105,88,119,122,104,111,116,49,50,117,74,118,81,77);
        const repo = 'tuu199/score-system';
        const apiUrl = `https://api.github.com/repos/${repo}/contents/shared-data.json`;
        // 第一步：从 GitHub Pages 拉取远端数据并合并（必须成功，否则不上传避免覆盖）
        Utils.toast('正在合并远端数据…', 'success');
        let mergeFailed = false;
        try {
          const pagesUrl = 'https://tuu199.github.io/score-system/shared-data.json?_t=' + Date.now();
          const res = await fetch(pagesUrl);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const remoteData = await res.json();
          const added = DB.mergeJSON(remoteData);
          Utils.toast(`合并完成，新增 ${added} 条`, 'success');
        } catch (e) {
          mergeFailed = true;
          Utils.toast('远端合并失败！请先点🔄同步再上传，避免覆盖他人数据', 'error');
        }
        if (mergeFailed) return; // 合并失败时终止上传，防止覆盖远端数据
        // 第二步：获取 SHA（用于更新文件）
        let sha = null;
        try {
          const getResp = await fetch(apiUrl, {
            headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
          });
          if (getResp.ok) { const f = await getResp.json(); sha = f.sha; }
        } catch (e) { /* ignore */ }
        // 第三步：导出合并后的数据并上传
        const data = DB.exportJSON();
        const jsonStr = JSON.stringify(data, null, 2);
        Utils.toast('正在上传到 GitHub…', 'success');
        const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
        const putResp = await fetch(apiUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: 'update shared-data.json', content: b64, sha: sha })
        });
        if (!putResp.ok) {
          const err = await putResp.json().catch(() => ({}));
          throw new Error(err.message || 'HTTP ' + putResp.status);
        }
        DB.setSetting('shared_data_url', '/shared-data.json');
        Utils.toast('已上传! 1-2 分钟后学生刷新可见', 'success');
      } catch (e) { Utils.toast('上传失败：' + e.message, 'error'); }
    });
    // 同步：从公网拉取最新数据并合并到本地（不覆盖本地已有数据）
    document.getElementById('btn-sync')?.addEventListener('click', async () => {
      if (!isAdmin) { Utils.toast('需要管理员权限', 'error'); return; }
      try {
        Utils.toast('正在同步…', 'success');
        const url = 'https://tuu199.github.io/score-system/shared-data.json?_t=' + Date.now();
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const added = DB.mergeJSON(data);
        Utils.toast(`同步成功，新增 ${added} 条记录，正在刷新…`, 'success');
        setTimeout(() => global.location.reload(), 600);
      } catch (e) { Utils.toast('同步失败：' + e.message, 'error'); }
    });
    // 清零所有积分记录和分享（保留小组、组员）
    document.getElementById('btn-clear')?.addEventListener('click', async () => {
      if (!isAdmin) { Utils.toast('需要管理员权限', 'error'); return; }
      if (!await Utils.confirm('⚠️ 确认清零所有积分记录和分享？\n此操作不可撤销，请先上传备份！')) return;
      if (!await Utils.confirm('再次确认：积分和分享将被全部删除，小组和组员保留。')) return;
      DB.clearAllRecords();
      Utils.toast('已清零所有积分和分享', 'success');
      navigate(currentMod);
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
      // 相对路径（以 / 开头）→ 拼当前 baseUrl（去掉 pathname 末尾文件名，保留 origin + 部署路径前缀）
      let dataUrl = sharedDataUrl;
      if (dataUrl.startsWith('/')) {
        const origin = baseUrl.split('/').slice(0, 3).join('/'); // http://host
        const prefix = baseUrl.substring(origin.length).split('?')[0].replace(/\/[^/]*$/, '/'); // /score-system/ 这类前缀
        dataUrl = origin + prefix + dataUrl.substring(1);
      }
      url = baseUrl + '?data=' + encodeURIComponent(dataUrl);
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
      Utils.toast('手机无法扫码访问 localhost。请用电脑浏览器访问 http://电脑IP:8001/ 后再生成二维码', 'error');
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
      // 恢复管理员登录状态（刷新后不丢失）——需先于 ?data= 加载，防止覆盖管理员本地未上传的数据
      if (localStorage.getItem('score_admin') === '1') {
        isAdmin = true;
      }
      // 学生端：检测 URL 中的 ?data=<json-url>，自动加载共享数据
      // 管理员恢复状态时跳过自动覆盖，避免丢失未上传的录入
      const params = new URLSearchParams(global.location.search);
      const dataUrl = params.get('data');
      if (dataUrl && !isAdmin) {
        try {
          await DB.loadFromURL(dataUrl);
          Utils.toast('已加载最新积分数据', 'success');
        } catch (e) {
          Utils.toast('加载数据失败：' + e.message, 'error');
        }
      } else if (dataUrl && isAdmin) {
        Utils.toast('检测到数据链接，管理员模式保留本地数据，如需更新请用🔄同步', 'info');
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
