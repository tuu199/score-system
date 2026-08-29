/* ============================================================
 * modules/gallery.js - 【分享广场】模块（学生+管理员均可查看）
 *   专门查看分享内容：管理员公告置顶 + 学生分享列表
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'gallery';
  const MOD_NAME = '分享广场';
  const MOD_ICON = '📖';

  function mount(view) {
    // 顶部说明
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['📖 分享广场']),
      Utils.el('p', { style: { color: 'var(--text-soft)', fontSize: '14px' } }, [
        '查看同学们的分享内容和管理员公告。管理员发布的公告置顶显示。',
      ]),
    ]));

    const currentWeek = DB.getCurrentWeek();
    const weeks = DB.getRecentWeeks(8);

    // 筛选栏
    const filterRow = Utils.el('div', { class: 'filter-row', style: { display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' } });
    const weekFilter = Utils.el('select', { class: 'form-input', style: { width: 'auto' } });
    // 默认选中"全部周次"，避免分享数据 week 不匹配时被全部过滤
    weekFilter.appendChild(Utils.el('option', { value: '', selected: true }, ['全部周次']));
    weeks.forEach(w => {
      weekFilter.appendChild(Utils.el('option', { value: w }, [w]));
    });

    const typeFilter = Utils.el('select', { class: 'form-input', style: { width: 'auto' } });
    typeFilter.appendChild(Utils.el('option', { value: '' }, ['全部内容']));
    typeFilter.appendChild(Utils.el('option', { value: 'announcement' }, ['📢 管理员公告']));
    typeFilter.appendChild(Utils.el('option', { value: 'share' }, ['💬 同学分享']));

    filterRow.appendChild(Utils.el('span', { style: { fontSize: '14px', color: 'var(--text-soft)' } }, ['周次：']));
    filterRow.appendChild(weekFilter);
    filterRow.appendChild(Utils.el('span', { style: { fontSize: '14px', color: 'var(--text-soft)', marginLeft: '10px' } }, ['类型：']));
    filterRow.appendChild(typeFilter);
    view.appendChild(filterRow);

    // 分享列表容器
    const listContainer = Utils.el('div', { id: 'gallery-list' });
    view.appendChild(listContainer);

    function renderList() {
      const filterWeek = weekFilter.value;
      const filterType = typeFilter.value;
      let list = DB.listShares();

      // 按类型筛选
      if (filterType === 'announcement') {
        list = list.filter(s => s.is_announcement === 1);
      } else if (filterType === 'share') {
        list = list.filter(s => s.is_announcement !== 1);
      }

      // 按周次筛选
      if (filterWeek) {
        list = list.filter(s => s.week === filterWeek);
      }

      // 排序：公告置顶 + 时间倒序
      list.sort((a, b) => {
        if (a.is_announcement === 1 && b.is_announcement !== 1) return -1;
        if (a.is_announcement !== 1 && b.is_announcement === 1) return 1;
        return (b.created_at || '').localeCompare(a.created_at || '');
      });

      listContainer.innerHTML = '';

      if (list.length === 0) {
        listContainer.appendChild(Utils.el('div', { class: 'card', style: { textAlign: 'center', color: 'var(--text-soft)', padding: '40px' } }, [
          '📭 暂无分享内容',
        ]));
        return;
      }

      list.forEach(s => {
        const isAnn = s.is_announcement === 1;
        const card = Utils.el('div', {
          class: 'share-card',
          style: isAnn
            ? { borderLeft: '4px solid #f59e0b', background: '#fffbeb', marginBottom: '12px' }
            : { marginBottom: '12px' },
        });

        // 头部：姓名 / 小组 / 时间 统一 textContent（防 H-3 XSS）
        const authorSpan = Utils.el('span', { class: 'share-author', style: { fontWeight: '600', color: isAnn ? '#d97706' : 'var(--text)' } });
        authorSpan.textContent = isAnn ? '📢 管理员公告' : '👤 ' + (s.member_name || '🕶️ 匿名同学');
        const groupSpan = Utils.el('span', { class: 'share-group', style: { color: 'var(--text-soft)' } });
        groupSpan.textContent = isAnn ? '通知' : (s.group_name || '');
        const timeSpan = Utils.el('span', { class: 'share-time', style: { color: 'var(--text-soft)', fontSize: '12px' } });
        timeSpan.textContent = s.created_at ? s.created_at.slice(0, 16).replace('T', ' ') : '';

        card.appendChild(Utils.el('div', { class: 'share-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px' } }, [
          authorSpan, groupSpan, timeSpan,
        ]));

        // 标题
        if (s.title) {
          const titleEl = Utils.el('div', { class: 'share-title', style: { fontWeight: '700', fontSize: '16px', marginBottom: '6px' } });
          titleEl.textContent = s.title;
          card.appendChild(titleEl);
        }
        // 内容
        if (s.content) {
          const contentEl = Utils.el('div', { class: 'share-content', style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.6', marginBottom: '8px' } });
          contentEl.textContent = s.content;
          card.appendChild(contentEl);
        }
        // H-3：图片走 sanitizeUrl 白名单协议；点击放大（Lightbox，支持 ←/→ 切图）
        function appendImage(card, src, options = {}) {
          if (!src) return;
          const safeSrc = Utils.sanitizeUrl(src, { allowImageData: true });
          if (!safeSrc) return;
          const img = Utils.el('img', {
            src: safeSrc,
            class: 'share-image',
            style: Object.assign({
              maxWidth: '100%', borderRadius: '8px', marginTop: '8px', display: 'block', cursor: 'zoom-in',
            }, options.style || {}),
            loading: 'lazy', referrerpolicy: 'no-referrer',
            title: '点击查看大图（支持 ← / → 切换同页图片）',
            'data-lightbox-group': 'gallery-list',
            'data-lightbox-src': safeSrc,
          });
          img.addEventListener('click', (e) => {
            e.preventDefault();
            Utils.openLightbox(safeSrc, { groupId: 'gallery-list', alt: options.alt || '' });
          });
          card.appendChild(img);
        }
        function isImageLink(u) { return u && /^https?:\/\//i.test(u) && /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(u); }
        function isVideoLink(u) { return u && /^https?:\/\//i.test(u) && /\.(mp4|m4v|webm|ogg|ogv|mov|3gp|avi|mkv|ts)(\?|#|$)/i.test(u); }

        if (s.image_data) {
          appendImage(card, s.image_data);
        } else if (s.link && isImageLink(s.link)) {
          appendImage(card, s.link);
        }
        // ===== 视频卡片（分享广场新增：点击即播放 / 全屏 / 新窗口打开） =====
        if (s.video_data || isVideoLink(s.link)) {
          const vsrc = Utils.sanitizeUrl(s.video_data || s.link, { allowVideoData: true, allowImageData: true });
          if (vsrc) {
            const ext1 = (s.video_data ? s.video_data : s.link).split('.').pop().split(/[?#]/)[0].toLowerCase();
            const isBrowserNative = /^(mp4|m4v|webm|ogg|ogv|mov)$/.test(ext1);
            const vWrap = Utils.el('div', {
              style: {
                marginTop: '8px', borderRadius: '8px', overflow: 'hidden',
                background: '#0f172a', border: '1px solid #1e293b',
              },
            });
            const vBar = Utils.el('div', {
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '8px', padding: '6px 10px', color: '#e2e8f0',
                fontSize: '12px', background: '#1e293b', flexWrap: 'wrap',
              },
            });
            const badge = Utils.el('span', { style: { color: '#fef08a', fontWeight: 600 } });
            badge.textContent = (s.video_data ? '🎥 上传视频' : '🎬 视频链接') + ' · ' + ext1.toUpperCase();
            const btns = Utils.el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } });
            const fsBtn = Utils.el('button', {
              type: 'button', class: 'btn btn-ghost btn-sm',
              style: { padding: '2px 8px', fontSize: '12px', color: '#f1f5f9', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' },
            });
            fsBtn.textContent = '⛶ 全屏播放';
            const openBtn = Utils.el('a', {
              href: vsrc, target: '_blank', rel: 'noopener noreferrer',
              class: 'btn btn-ghost btn-sm',
              style: { padding: '2px 8px', fontSize: '12px', textDecoration: 'none', color: '#f1f5f9', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' },
            });
            openBtn.textContent = '🔗 新窗口打开';
            btns.appendChild(fsBtn);
            btns.appendChild(openBtn);
            if (!isBrowserNative) {
              const warn = Utils.el('span', { style: { color: '#fca5a5' } });
              warn.textContent = '此格式浏览器可能不支持直接播放，建议「新窗口打开」下载后观看';
              btns.appendChild(warn);
            }
            vBar.appendChild(badge);
            vBar.appendChild(btns);
            vWrap.appendChild(vBar);
            if (isBrowserNative) {
              const vid = Utils.el('video', {
                src: vsrc, controls: '', preload: 'metadata', playsinline: 'true',
                style: { width: '100%', maxHeight: '480px', display: 'block', background: '#000' },
              });
              fsBtn.addEventListener('click', () => {
                try {
                  if (vid.requestFullscreen) vid.requestFullscreen();
                  else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
                  else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
                  else vid.play().catch(() => {});
                } catch (_e) { Utils.toast('当前浏览器不支持全屏，已切换普通播放', 'warning'); vid.play().catch(() => {}); }
              });
              vWrap.appendChild(vid);
            } else {
              const fallback = Utils.el('a', {
                href: vsrc, target: '_blank', rel: 'noopener noreferrer',
                style: {
                  display: 'block', padding: '28px 14px', textAlign: 'center', color: '#e2e8f0',
                  textDecoration: 'none', background: 'linear-gradient(180deg,#334155,#0f172a)',
                },
              }, [
                Utils.el('div', { style: { fontSize: '40px' } }, ['📼']),
                Utils.el('div', { style: { marginTop: '4px', fontWeight: 600 } }, ['点击新窗口打开 / 下载后播放']),
                Utils.el('div', { style: { marginTop: '4px', fontSize: '12px', color: '#94a3b8' } }, ['链接：' + vsrc]),
              ]);
              vWrap.appendChild(fallback);
            }
            card.appendChild(vWrap);
          }
        }
        // 视频链接 / 普通链接
        if (s.link) {
          const safeLink = Utils.sanitizeUrl(s.link, { allowImageData: false });
          // B站 iframe 嵌入：必须先判 B站白域名
          if (safeLink && Utils.isBilibiliUrl(safeLink)) {
            const m = s.link.match(/(BV[A-Za-z0-9]+)/);
            if (m) {
              const bvid = Utils.escapeAttr(m[1]);
              card.appendChild(Utils.el('iframe', {
                src: 'https://player.bilibili.com/player.html?bvid=' + bvid + '&high_quality=1',
                class: 'share-video',
                style: { width: '100%', height: '200px', border: 'none', borderRadius: '8px', marginTop: '8px' },
                allowfullscreen: 'true', scrolling: 'no',
                referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-popups allow-presentation',
              }));
            }
          }
          const isImage = isImageLink(s.link);
          const isVideo = isVideoLink(s.link);
          if (!isImage && !isVideo) {
            if (safeLink && /^https?:\/\//i.test(safeLink)) {
              const a = Utils.el('a', {
                class: 'share-link', href: safeLink, target: '_blank', rel: 'noopener noreferrer',
                style: { display: 'inline-block', marginTop: '8px', color: 'var(--primary)', wordBreak: 'break-all' },
              });
              a.textContent = '🔗 ' + s.link;
              card.appendChild(a);
            } else {
              const plain = Utils.el('span', { class: 'share-link', style: { display: 'inline-block', marginTop: '8px', color: 'var(--text-soft)', wordBreak: 'break-all' } });
              plain.textContent = '🔗 ' + s.link;
              card.appendChild(plain);
            }
          }
        }
        // 底部：周次（L-2 空 week 不渲染空标签） + 删除按钮（管理员可删，async）
        const footer = Utils.el('div', { class: 'share-footer', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' } });
        if (s.week) {
          const weekSpan = Utils.el('span', { class: 'share-week', style: { color: 'var(--text-soft)', fontSize: '12px' } });
          weekSpan.textContent = s.week;
          footer.appendChild(weekSpan);
        } else {
          // 即使没有 week，也占位一个空 span，保持 flex 对齐（视觉不突兀）
          footer.appendChild(Utils.el('span', {}));
        }
        if (ScoreApp.isAdmin) {
          const delBtn = Utils.el('button', {
            class: 'btn btn-danger btn-sm',
            style: { padding: '2px 8px', fontSize: '12px' },
          });
          delBtn.textContent = '删除';
          delBtn.addEventListener('click', async () => {
            if (!Utils.confirm('确认删除这条分享？删除后对应积分也将同步撤销')) return;
            if (delBtn.dataset.locked) return;
            delBtn.dataset.locked = '1'; delBtn.disabled = true;
            try {
              await DB.deleteShare(s.id);
              Utils.toast('已删除', 'info');
              renderList();
            } catch (e) {
              Utils.toast('删除失败：' + e.message, 'error');
              delBtn.disabled = false; delBtn.dataset.locked = '';
            }
          });
          footer.appendChild(delBtn);
        }
        card.appendChild(footer);
        listContainer.appendChild(card);
      });
    }

    weekFilter.addEventListener('change', renderList);
    typeFilter.addEventListener('change', renderList);
    renderList();
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, adminOnly: false });
})();
