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

    /** 安全转义 HTML，防止 XSS */
    escapeHtml(str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  };

  global.Utils = Utils;
})(window);
