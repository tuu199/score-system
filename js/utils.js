/* ============================================================
 * utils.js - 通用工具函数（不依赖任何模块，安全先加载）
 * ============================================================ */
(function (global) {
  'use strict';

  const Utils = {
    /** 格式化日期为 YYYY-MM-DD HH:mm:ss */
    formatDate(d = new Date()) {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
        + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    },

    /** 四舍五入到 n 位小数，默认 2 位 */
    round(num, n = 2) {
      const p = Math.pow(10, n);
      return Math.round(Number(num) * p) / p;
    },

    /** 安全转义 HTML，防止 XSS（H-3） */
    escapeHtml(str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /** H-3：把字符串转成可安全放到 src/href/style/on* 属性里的形式（比 escapeHtml 多处理 ` 和反斜杠） */
    escapeAttr(str) {
      if (str == null) return '';
      return Utils.escapeHtml(str).replace(/`/g, '&#96;').replace(/\\/g, '&#92;');
    },

    /** H-3：安全 URL 校验（白名单协议 + B站域名白名单）。返回 null 表示不安全；否则返回原样（可加 rel=noopener noreferrer） */
    sanitizeUrl(url, { allowImageData = false, allowVideoData = false, allowAnyData = false } = {}) {
      if (url == null) return null;
      const s = String(url).trim();
      if (!s) return null;
      // 协议白名单
      const protocols = ['http://', 'https://', 'mailto:', 'tel:', 'blob:'];
      if (allowAnyData) protocols.push('data:');
      else {
        if (allowImageData) protocols.push('data:image/');
        if (allowVideoData) protocols.push('data:video/');
      }
      const low = s.toLowerCase();
      const allow = protocols.some(p => low.startsWith(p));
      if (!allow) return null;
      // 禁止 javascript:/vbscript:/data:text/html 等
      if (/^\s*javascript\s*:/i.test(s) || /^\s*vbscript\s*:/i.test(s) ||
          low.startsWith('data:text/html') || low.startsWith('data:text/')) return null;
      return s;
    },

    /** H-3：判断是否是 B 站可嵌入 iframe 的安全域名（白名单） */
    isBilibiliUrl(url) {
      if (!url) return false;
      try {
        const u = new URL(String(url));
        return /(^|\.)(bilibili\.com|b23\.tv)$/.test(u.hostname);
      } catch (_) { return false; }
    },

    /** 创建 DOM 元素的快捷函数 */
    el(tag, attrs = {}, children = []) {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') e.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') e.innerHTML = v;
        else if (v !== undefined && v !== null) e.setAttribute(k, v);
      }
      // 递归展平 children，支持 [a, [b, c], [[d]]] 这种嵌套
      const stack = [children];
      while (stack.length) {
        const cur = stack.pop();
        if (Array.isArray(cur)) {
          for (let i = cur.length - 1; i >= 0; i--) stack.push(cur[i]);
          continue;
        }
        if (cur == null || cur === false) continue;
        e.appendChild(typeof cur === 'string' || typeof cur === 'number'
          ? document.createTextNode(String(cur)) : cur);
      }
      return e;
    },

    /** 显示 Toast 提示 */
    toast(msg, type = 'info', timeout = 2200) {
      const el = document.getElementById('toast');
      if (!el) return;
      el.className = 'toast ' + type;
      el.textContent = msg;
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.className = 'toast hidden'; }, timeout);
    },

    /** 显示确认对话框 */
    confirm(msg) {
      return window.confirm(msg);
    },

    /** 从 ArrayBuffer 生成下载链接并触发下载 */
    downloadBlob(buffer, filename, mime = 'application/octet-stream') {
      const blob = new Blob([buffer], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    /** 读取文件为 ArrayBuffer */
    readFileAsArrayBuffer(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsArrayBuffer(file);
      });
    },

    /** 从对象生成简单 <tr> 行（值已 HTML 转义） */
    row(values) {
      const tr = document.createElement('tr');
      for (const v of values) {
        const td = document.createElement('td');
        if (typeof v === 'object' && v.nodeType) td.appendChild(v);
        else td.textContent = v == null ? '' : String(v);
        tr.appendChild(td);
      }
      return tr;
    },

    /**
     * 图片 Lightbox（浮层大图）：点击图片打开大图，支持 Esc 关闭、点击遮罩关闭、左右方向键浏览同组图片。
     * 用法：对 <img> 调用 Utils.openLightbox(src)，或把一组图片元素绑定到同一 galleryId。
     * 返回 true 表示已打开。
     */
    openLightbox(src, { groupId = null, alt = '' } = {}) {
      if (!src || typeof document === 'undefined') return false;
      const safeSrc = Utils.sanitizeUrl(src, { allowImageData: true });
      if (!safeSrc) return false;
      // 构造图集：有 groupId 的话，取当前页面所有 data-lightbox-group="xxx" 的 img 作为图集
      const images = [];
      if (groupId) {
        const all = document.querySelectorAll('img[data-lightbox-group="' + Utils.escapeAttr(String(groupId)).replace(/^"|"$/g, '') + '"]');
        all.forEach(img => {
          const s = img.getAttribute('data-lightbox-src') || img.src;
          const safe = Utils.sanitizeUrl(s, { allowImageData: true });
          if (safe) images.push(safe);
        });
      }
      if (images.length === 0) images.push(safeSrc);
      let idx = Math.max(0, images.indexOf(safeSrc));

      // 单例：避免叠加多个 lightbox
      const old = document.getElementById('__utils_lightbox');
      if (old) old.remove();

      const mask = Utils.el('div', {
        id: '__utils_lightbox',
        role: 'dialog', 'aria-modal': 'true', 'aria-label': '图片预览',
        style: {
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px', cursor: 'zoom-out',
        },
      });
      const toolbar = Utils.el('div', {
        style: {
          position: 'absolute', top: '12px', right: '16px',
          display: 'flex', gap: '8px', alignItems: 'center', color: '#fff', fontSize: '13px',
        },
      });
      const counter = Utils.el('span', { id: '__lb_counter', style: { marginRight: '12px' } });
      const dlBtn = Utils.el('a', {
        href: safeSrc, download: '', target: '_blank', rel: 'noopener noreferrer',
        style: {
          color: '#fff', padding: '4px 10px', background: 'rgba(255,255,255,0.12)',
          borderRadius: '6px', textDecoration: 'none', cursor: 'pointer',
        },
      }, ['⬇️ 原图']);
      const closeBtn = Utils.el('button', {
        type: 'button',
        style: {
          color: '#fff', background: 'rgba(255,255,255,0.12)', border: 'none',
          padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
        },
      }, ['✕ 关闭']);
      toolbar.appendChild(counter);
      toolbar.appendChild(dlBtn);
      toolbar.appendChild(closeBtn);

      const imgWrap = Utils.el('div', { style: { maxWidth: '100%', maxHeight: '100%', position: 'relative' } });
      const img = Utils.el('img', {
        src: safeSrc,
        alt: Utils.escapeAttr(alt),
        loading: 'lazy',
        style: { maxWidth: '100%', maxHeight: 'calc(100vh - 80px)', borderRadius: '6px', objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.6)', background: '#111' },
      });
      imgWrap.appendChild(img);

      const prevBtn = Utils.el('button', {
        type: 'button', title: '上一张 (←)',
        style: {
          position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
          color: '#fff', background: 'rgba(0,0,0,0.45)', border: 'none', width: '44px', height: '44px',
          borderRadius: '50%', fontSize: '20px', cursor: 'pointer', display: images.length > 1 ? 'block' : 'none',
        },
      }, ['‹']);
      const nextBtn = Utils.el('button', {
        type: 'button', title: '下一张 (→)',
        style: {
          position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
          color: '#fff', background: 'rgba(0,0,0,0.45)', border: 'none', width: '44px', height: '44px',
          borderRadius: '50%', fontSize: '20px', cursor: 'pointer', display: images.length > 1 ? 'block' : 'none',
        },
      }, ['›']);

      mask.appendChild(toolbar);
      mask.appendChild(imgWrap);
      mask.appendChild(prevBtn);
      mask.appendChild(nextBtn);

      function close() { mask.remove(); document.removeEventListener('keydown', onKey); }
      function show(i) {
        idx = (i + images.length) % images.length;
        img.src = images[idx];
        dlBtn.href = images[idx];
        const name = (images[idx].split('/').pop() || '').split('?')[0];
        try { dlBtn.setAttribute('download', decodeURIComponent(name)); } catch (_) { /* ignore */ }
        counter.textContent = images.length > 1 ? (idx + 1) + ' / ' + images.length : '';
      }
      function onKey(e) {
        if (e.key === 'Escape') close();
        else if (images.length > 1 && e.key === 'ArrowLeft') show(idx - 1);
        else if (images.length > 1 && e.key === 'ArrowRight') show(idx + 1);
      }
      mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
      closeBtn.addEventListener('click', close);
      prevBtn.addEventListener('click', () => show(idx - 1));
      nextBtn.addEventListener('click', () => show(idx + 1));
      document.addEventListener('keydown', onKey);

      show(idx);
      document.body.appendChild(mask);
      return true;
    },

    /** 便捷：把一组 <img> 元素（或 CSS 选择器匹配的 img）全部绑定点击打开 Lightbox（支持 ←/→ 切换） */
    bindLightbox(selectorOrEls, { groupId = 'default' } = {}) {
      let els;
      if (typeof selectorOrEls === 'string') {
        els = Array.from(document.querySelectorAll(selectorOrEls));
      } else if (selectorOrEls && typeof selectorOrEls.length === 'number') {
        els = Array.from(selectorOrEls);
      } else if (selectorOrEls) {
        els = [selectorOrEls];
      } else return;
      const gid = String(groupId);
      els.forEach((img) => {
        if (!(img && img.tagName === 'IMG')) return;
        img.setAttribute('data-lightbox-group', gid);
        if (!img.style.cursor || img.style.cursor === 'auto' || img.style.cursor === '') img.style.cursor = 'zoom-in';
        if (img.getAttribute('data-lightbox-bound') === '1') return;
        img.setAttribute('data-lightbox-bound', '1');
        img.addEventListener('click', (e) => {
          e.preventDefault();
          const src = img.getAttribute('data-lightbox-src') || img.src;
          Utils.openLightbox(src, { groupId: gid, alt: img.alt || '' });
        });
      });
    },
  };

  global.Utils = Utils;
})(window);
