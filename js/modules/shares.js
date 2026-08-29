/* ============================================================
 * modules/shares.js - 【分享板】模块（学生+管理员均可发帖/查看）
 *   周末/假期分享：学习心得、能力增长、兴趣领域等
 *   每发一条自动+1个人积分（群分享类别）
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'shares';
  const MOD_NAME = '分享板';
  const MOD_ICON = '💬';

  function mount(view) {
    const groups = DB.listGroups();
    const shares = DB.listShares();
    const weeks = DB.getRecentWeeks(8);
    const currentWeek = DB.getCurrentWeek();

    // 顶部说明
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['💬 分享板']),
      Utils.el('p', { style: { color: 'var(--text-soft)', fontSize: '14px', margin: '8px 0' } }, [
        '分享学习心得、能力增长、兴趣领域等内容。每发一条自动积1分（群分享），周日12:00前组长汇总。',
      ]),
    ]));

    // 管理员公告发布区（仅管理员可见）
    if (ScoreApp.isAdmin) {
      const annCard = Utils.el('div', { class: 'card', style: { borderLeft: '4px solid #f59e0b' } });
      annCard.appendChild(Utils.el('div', { class: 'card-title' }, ['📢 发布通知/公告（管理员）']));

      const annTitle = Utils.el('input', {
        class: 'form-input', type: 'text', placeholder: '公告标题（如：本周注意事项）', id: 'ann-title',
      });
      annCard.appendChild(Utils.el('div', { class: 'form-row' }, [
        Utils.el('label', {}, ['标题']), annTitle,
      ]));

      const annContent = Utils.el('textarea', {
        class: 'form-input', placeholder: '公告内容（支持粘贴文档链接、网盘链接等）',
        id: 'ann-content', rows: 3, style: { width: '100%', resize: 'vertical' },
      });
      annCard.appendChild(Utils.el('div', { class: 'form-row' }, [
        Utils.el('label', {}, ['内容']), annContent,
      ]));

      const annLink = Utils.el('input', {
        class: 'form-input', type: 'text', placeholder: '链接（可选，网盘/文档网址）', id: 'ann-link',
      });
      annCard.appendChild(Utils.el('div', { class: 'form-row' }, [
        Utils.el('label', {}, ['链接']), annLink,
      ]));

      const annBtn = Utils.el('button', {
        class: 'btn btn-primary',
        style: { marginTop: '10px', width: '100%', background: '#f59e0b' },
      }, ['📢 发布公告（置顶，不加分）']);
      annBtn.addEventListener('click', () => {
        const title = annTitle.value.trim();
        const content = annContent.value.trim();
        if (!content) { Utils.toast('请填写公告内容', 'error'); return; }
        if (!groups.length) { Utils.toast('请先创建至少一个小组', 'error'); return; }
        try {
          DB.addShare({
            member_id: null, group_id: groups[0].id,
            title, content, link: annLink.value.trim(),
            image_data: '', week: currentWeek, is_announcement: true,
          });
          Utils.toast('公告已发布', 'success');
          annTitle.value = ''; annContent.value = ''; annLink.value = '';
          ScoreApp.navigate('shares');
        } catch (e) { Utils.toast('发布失败：' + e.message, 'error'); }
      });
      annCard.appendChild(annBtn);
      view.appendChild(annCard);
    }

    // 发帖表单（学生+管理员均可发布）
    const formCard = Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['✏️ 发布分享（自动+1分）']),
    ]);

    // 小组选择
    const groupSelect = Utils.el('select', { class: 'form-input', id: 'share-group' });
    groupSelect.appendChild(Utils.el('option', { value: '' }, ['选择小组']));
    groups.forEach(g => {
      groupSelect.appendChild(Utils.el('option', { value: g.id }, [g.name]));
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['小组']),
      groupSelect,
    ]));

    // 成员选择
    const memberSelect = Utils.el('select', { class: 'form-input', id: 'share-member' });
    memberSelect.appendChild(Utils.el('option', { value: '' }, ['先选小组']));
    memberSelect.disabled = true;
    groupSelect.addEventListener('change', () => {
      memberSelect.innerHTML = '';
      const gid = Number(groupSelect.value);
      if (!gid) {
        memberSelect.appendChild(Utils.el('option', { value: '' }, ['先选小组']));
        memberSelect.disabled = true;
        return;
      }
      memberSelect.appendChild(Utils.el('option', { value: '' }, ['选择成员']));
      DB.listMembers(gid).forEach(m => {
        memberSelect.appendChild(Utils.el('option', { value: m.id }, [m.name]));
      });
      memberSelect.disabled = false;
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['姓名']),
      memberSelect,
    ]));

    // 标题
    const titleInput = Utils.el('input', {
      class: 'form-input', type: 'text', placeholder: '标题（可选）', id: 'share-title',
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['标题']),
      titleInput,
    ]));

    // 内容
    const contentTextarea = Utils.el('textarea', {
      class: 'form-input', placeholder: '分享内容（学习心得、能力增长、兴趣领域等）',
      id: 'share-content', rows: 4, style: { width: '100%', resize: 'vertical' },
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['内容']),
      contentTextarea,
    ]));

    // 链接
    const linkInput = Utils.el('input', {
      class: 'form-input', type: 'text', placeholder: '链接（可选，图片/视频/文章网址）', id: 'share-link',
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['链接']),
      linkInput,
    ]));

    // 图片上传
    let imageData = '';        // 最终存储的 URL 或 base64（M-3 优先 storage）
    let imagePreviewSrc = ''; // 预览图 src
    const imageInput = Utils.el('input', {
      type: 'file', accept: 'image/*', id: 'share-image',
      style: { display: 'none' },
    });
    const imageBtn = Utils.el('button', {
      type: 'button', class: 'btn btn-ghost',
      style: { marginTop: '8px' },
    }, ['📷 添加图片（可选）']);
    const imagePreview = Utils.el('div', { id: 'image-preview', style: { marginTop: '8px' } });

    imageBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        Utils.toast('图片不能超过20MB', 'error');
        return;
      }
      // M-3：canvas 压缩到最长边 800px，JPEG 85%
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 800;
          let w = img.width, h = img.height;
          if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
          else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          imagePreviewSrc = compressedBase64;
          imageData = compressedBase64; // 先默认用 base64；提交时再尝试上传 storage
          imagePreview.innerHTML = '';
          const safeSrc = Utils.sanitizeUrl(imagePreviewSrc, { allowImageData: true });
          const imgPreviewEl = Utils.el('img', {
            style: { maxWidth: '200px', maxHeight: '150px', borderRadius: '8px', border: '1px solid #ddd' },
          });
          if (safeSrc) imgPreviewEl.src = safeSrc;
          const removeBtn = Utils.el('button', {
            type: 'button',
            style: { position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '14px', lineHeight: '1' },
          });
          removeBtn.textContent = '×';
          removeBtn.addEventListener('click', () => {
            imageData = ''; imagePreviewSrc = '';
            imagePreview.innerHTML = ''; imageInput.value = '';
          });
          imagePreview.appendChild(Utils.el('div', {
            style: { position: 'relative', display: 'inline-block' },
          }, [imgPreviewEl, removeBtn]));
          Utils.toast('图片已压缩至最长边 ≤800px（JPEG 85%）', 'success');
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['图片']),
      imageBtn, imageInput, imagePreview,
    ]));

    // 匿名发布选项
    const anonCheckbox = Utils.el('input', { type: 'checkbox', id: 'share-anon', style: { marginRight: '6px' } });
    const anonLabel = Utils.el('label', { style: { display: 'flex', alignItems: 'center', cursor: 'pointer' } }, [anonCheckbox, Utils.el('span', {}, ['🕶️ 匿名发布（不显示姓名，不加分）'])]);
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [anonLabel]));

    // 本周分享上限提示
    const cap = DB.WEEKLY_SHARE_CAP || 4;
    const capHint = Utils.el('div', {
      style: { fontSize: '12px', color: 'var(--text-soft)', marginTop: '6px', textAlign: 'right' },
    }, ['💡 实名分享每周积分上限 ' + cap + ' 分']);
    formCard.appendChild(capHint);

    // 提交按钮
    const submitBtn = Utils.el('button', {
      class: 'btn btn-primary',
      style: { marginTop: '10px', width: '100%' },
    }, ['📤 发布分享']);

    let _submitting = false;
    submitBtn.addEventListener('click', async () => {
      if (_submitting) { Utils.toast('正在提交，请稍候…', 'warning'); return; }
      const gid = Number(groupSelect.value);
      const mid = Number(memberSelect.value) || null;
      const title = titleInput.value.trim();
      const content = contentTextarea.value.trim();
      const link = linkInput.value.trim();
      const isAnon = anonCheckbox.checked;
      if (!gid) { Utils.toast('请选择小组', 'error'); return; }
      if (!isAnon && !mid) { Utils.toast('请选择成员或勾选匿名', 'error'); return; }
      if (!content && !imageData) { Utils.toast('请填写分享内容或添加图片', 'error'); return; }

      // H-3：提交前先校验链接是白名单协议，拒绝 javascript 等
      if (link) {
        const safe = Utils.sanitizeUrl(link, { allowImageData: false });
        if (!safe) { Utils.toast('链接协议不支持，请使用 http/https 等合规地址', 'error'); return; }
      }

      _submitting = true;
      submitBtn.disabled = true;
      const originalBtnText = submitBtn.textContent;
      submitBtn.textContent = '提交中…';
      try {
        // M-3：如果有压缩后的 base64 图，尝试上传到 Supabase Storage（shares bucket），失败仍用 base64 降级
        let finalImageData = imageData;
        if (imageData && imageData.startsWith('data:image/')) {
          const fakeFile = { name: 'share_' + Date.now() + '_' + Math.floor(Math.random() * 1e6) + '.jpg', size: 0 };
          try {
            if (typeof DB.uploadFile === 'function') {
              const publicUrl = await DB.uploadFile(fakeFile, imageData);
              if (publicUrl) finalImageData = publicUrl;
            }
          } catch (e) {
            console.warn('[SHARES] M-3 storage 上传失败，降级使用 base64：', e.message || e);
          }
        }

        const result = await DB.addShare({
          member_id: isAnon ? null : mid, group_id: gid, title, content, link,
          image_data: finalImageData, week: currentWeek,
        });
        if (isAnon) {
          Utils.toast('匿名分享成功！', 'success');
        } else if (result.pointsAwarded > 0) {
          const capNow = DB.getWeeklySharePoints(mid, currentWeek);
          const remain = cap - capNow;
          Utils.toast('分享成功！个人积分 +1（本周已得 ' + capNow + '/' + cap + '，还可加 ' + remain + ' 分）', 'success');
        } else {
          Utils.toast('分享已提交，但本周分享积分已达上限（' + cap + '/' + cap + '），不再加分', 'warning');
        }
        // 清空表单
        titleInput.value = '';
        contentTextarea.value = '';
        linkInput.value = '';
        imageData = ''; imagePreviewSrc = '';
        imagePreview.innerHTML = '';
        imageInput.value = '';
        anonCheckbox.checked = false;
        // 刷新列表
        renderList();
      } catch (e) {
        Utils.toast('发布失败：' + e.message, 'error');
      } finally {
        _submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
    });
    formCard.appendChild(submitBtn);
    view.appendChild(formCard);

    // 筛选栏
    const filterRow = Utils.el('div', { class: 'filter-row', style: { display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' } });
    const weekFilter = Utils.el('select', { class: 'form-input', style: { width: 'auto' } });
    weekFilter.appendChild(Utils.el('option', { value: '' }, ['全部周次']));
    weeks.forEach(w => {
      weekFilter.appendChild(Utils.el('option', { value: w, selected: w === currentWeek }, [w]));
    });
    filterRow.appendChild(Utils.el('span', { style: { fontSize: '14px', color: 'var(--text-soft)' } }, ['周次：']));
    filterRow.appendChild(weekFilter);
    view.appendChild(filterRow);

    // 分享列表
    const listContainer = Utils.el('div', { id: 'shares-list' });
    view.appendChild(listContainer);

    function renderList() {
      const filterWeek = weekFilter.value;
      const list = filterWeek ? DB.listShares({ week: filterWeek }) : DB.listShares();
      listContainer.innerHTML = '';

      if (list.length === 0) {
        const empty = Utils.el('div', { class: 'card', style: { textAlign: 'center', color: 'var(--text-soft)' } });
        empty.textContent = '📭 暂无分享，快来发第一条吧！';
        listContainer.appendChild(empty);
        return;
      }

      list.forEach(s => {
        const isAnn = s.is_announcement === 1;
        const card = Utils.el('div', {
          class: 'share-card',
          style: isAnn ? { borderLeft: '4px solid #f59e0b', background: '#fffbeb' } : {},
        });
        // 头部：姓名 + 小组 + 时间（全部 textContent：防 XSS）
        const authorSpan = Utils.el('span', { class: 'share-author' });
        authorSpan.textContent = isAnn ? '📢 管理员公告' : (s.member_name || '🕶️ 匿名同学');
        const groupSpan = Utils.el('span', { class: 'share-group' });
        groupSpan.textContent = isAnn ? '通知' : s.group_name;
        const timeSpan = Utils.el('span', { class: 'share-time' });
        timeSpan.textContent = s.created_at || '';
        card.appendChild(Utils.el('div', { class: 'share-header' }, [authorSpan, groupSpan, timeSpan]));

        // 标题
        if (s.title) {
          const titleEl = Utils.el('div', { class: 'share-title' });
          titleEl.textContent = s.title;
          card.appendChild(titleEl);
        }
        // 内容
        if (s.content) {
          const contentEl = Utils.el('div', { class: 'share-content' });
          contentEl.textContent = s.content;
          card.appendChild(contentEl);
        }
        // H-3：图片统一走 sanitizeUrl；只允许 http/https/data:image/blob
        if (s.image_data) {
          const safeSrc = Utils.sanitizeUrl(s.image_data, { allowImageData: true });
          if (safeSrc) {
            card.appendChild(Utils.el('img', {
              src: safeSrc,
              class: 'share-image',
              style: { maxWidth: '100%', borderRadius: '8px', marginTop: '8px' },
              loading: 'lazy', referrerpolicy: 'no-referrer',
            }));
          }
        } else if (s.link && /^https?:\/\//i.test(s.link) && /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(s.link)) {
          const safeSrc = Utils.sanitizeUrl(s.link, { allowImageData: false });
          if (safeSrc) {
            card.appendChild(Utils.el('img', {
              src: safeSrc,
              class: 'share-image',
              style: { maxWidth: '100%', borderRadius: '8px', marginTop: '8px' },
              loading: 'lazy', referrerpolicy: 'no-referrer',
            }));
          }
        }
        // 视频/链接
        if (s.link) {
          // B站白域名嵌入 iframe：先用 isBilibiliUrl 判域名，bvid 提取只抓字母数字
          const safeLink = Utils.sanitizeUrl(s.link, { allowImageData: false });
          if (safeLink && Utils.isBilibiliUrl(safeLink)) {
            const m = s.link.match(/(BV[A-Za-z0-9]+)/);
            if (m) {
              const bvid = Utils.escapeAttr(m[1]);
              const iframe = Utils.el('iframe', {
                class: 'share-video',
                style: { width: '100%', height: '200px', border: 'none', borderRadius: '8px', marginTop: '8px' },
                allowfullscreen: 'true', scrolling: 'no',
                // 必须用 player.bilibili.com，禁止拼接任意域名
                src: 'https://player.bilibili.com/player.html?bvid=' + bvid + '&high_quality=1',
                referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-popups allow-presentation',
              });
              card.appendChild(iframe);
            }
          }
          // 非图片后缀：http/https 走 a；其它协议降级为纯文本
          if (!/\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(s.link)) {
            if (safeLink && /^https?:\/\//i.test(safeLink)) {
              const a = Utils.el('a', {
                class: 'share-link', href: safeLink, target: '_blank',
                rel: 'noopener noreferrer', referrerpolicy: 'no-referrer',
              });
              a.textContent = '🔗 ' + s.link;
              card.appendChild(a);
            } else {
              const plain = Utils.el('span', {
                class: 'share-link', style: { color: 'var(--text-soft)', wordBreak: 'break-all' },
              });
              plain.textContent = '🔗 ' + s.link;
              card.appendChild(plain);
            }
          }
        }
        // 底部：周次 + 删除按钮（管理员可删）
        const footer = Utils.el('div', { class: 'share-footer' });
        // L-2：空 week 不渲染「空 span」占位，避免显示无意义标签
        if (s.week) {
          const weekSpan = Utils.el('span', { class: 'share-week' });
          weekSpan.textContent = s.week;
          footer.appendChild(weekSpan);
        }
        if (ScoreApp.isAdmin) {
          const delBtn = Utils.el('button', {
            class: 'btn btn-danger btn-sm',
            style: { float: 'right', padding: '2px 8px', fontSize: '12px' },
          });
          delBtn.textContent = '删除';
          delBtn.addEventListener('click', async () => {
            if (!Utils.confirm('确认删除这条分享？删除后对应积分也将同步撤销')) return;
            try {
              if (delBtn.dataset.locked === '1') return;
              delBtn.dataset.locked = '1';
              delBtn.disabled = true;
              await DB.deleteShare(s.id);
              Utils.toast('已删除', 'info');
              renderList();
            } catch (e) {
              Utils.toast('删除失败：' + e.message, 'error');
              delBtn.disabled = false;
              delBtn.dataset.locked = '';
            }
          });
          footer.appendChild(delBtn);
        }
        card.appendChild(footer);
        listContainer.appendChild(card);
      });
    }

    weekFilter.addEventListener('change', renderList);
    renderList();
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, adminOnly: false });
})();
