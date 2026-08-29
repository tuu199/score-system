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

    // 链接（支持视频直链：.mp4/.webm/.mov 等）
    const linkInput = Utils.el('input', {
      class: 'form-input', type: 'text',
      placeholder: '视频/图片/文章链接（可选；视频请用 .mp4/.webm/.mov 直链，或粘贴 B 站链接）',
      id: 'share-link',
    });
    const linkHint = Utils.el('div', {
      style: { fontSize: '12px', color: '#92400e', marginTop: '4px', lineHeight: 1.6 },
    });
    linkHint.innerHTML = '💡 <b>发视频链接可以吗？可以！</b> 而且推荐：因为视频文件≤49MB 是 Supabase 免费档死线（全局 50MB 无法改成 150MB），<b>超过 49MB 的视频先上传到 B 站 / 阿里云盘 / 百度网盘 / 企业微信「微盘」再把可分享链接贴这里，免费档流量不会爆</b>。识别到 .mp4/.webm/.mov 直链会自动生成视频卡片内嵌播放。';
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['链接 / 视频链接']),
      Utils.el('div', { style: { width: '100%' } }, [linkInput, linkHint]),
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

    // ===== 视频上传（新增：专门的视频上传渠道） =====
    let videoData = '';          // 最终存储到 DB.video_data 的 URL
    const videoInput = Utils.el('input', {
      type: 'file', id: 'share-video',
      accept: 'video/mp4,video/webm,video/ogg,video/x-matroska,video/quicktime,video/x-msvideo,.mp4,.m4v,.webm,.ogg,.ogv,.mov,.3gp,.avi,.mkv,.ts',
      style: { display: 'none' },
    });
    const videoBtn = Utils.el('button', {
      type: 'button', class: 'btn btn-ghost',
      style: { marginTop: '8px' },
    }, ['🎥 添加视频（可选，≤49MB，受 Supabase 免费档限制）']);
    const videoPreview = Utils.el('div', { id: 'video-preview', style: { marginTop: '8px' } });
    const formatBytes = (n) => {
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
      if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
      return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    };
    const VIDEO_MAX = 49 * 1024 * 1024;

    function clearVideo() {
      videoData = '';
      videoInput.value = '';
      videoPreview.innerHTML = '';
    }
    videoBtn.addEventListener('click', () => videoInput.click());
    videoInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > VIDEO_MAX) {
        Utils.toast('视频大小不能超过 49MB（Supabase 免费档全局上限 50MB），当前：' + formatBytes(file.size), 'error');
        videoInput.value = '';
        return;
      }
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!['mp4', 'm4v', 'webm', 'ogg', 'ogv', 'mov', '3gp', 'avi', 'mkv', 'ts'].includes(ext)) {
        Utils.toast('暂不支持的视频格式，请上传 .mp4 / .webm / .mov / .mkv 等常见格式', 'error');
        videoInput.value = '';
        return;
      }
      if (!file.type || !file.type.startsWith('video/')) {
        // 老浏览器 / 特殊容器 type 为空，给出 warning 但允许继续
        Utils.toast('检测到浏览器未识别此视频文件类型，仍会尝试上传', 'warning');
      }
      videoPreview.innerHTML = '';
      const previewUrl = URL.createObjectURL(file);
      const vidEl = Utils.el('video', {
        controls: '', preload: 'metadata',
        style: { maxWidth: '100%', maxHeight: '180px', borderRadius: '8px', background: '#000' },
      });
      vidEl.src = previewUrl;

      const metaRow = Utils.el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginTop: '4px' } });
      const infoSpan = Utils.el('span', { style: { color: 'var(--text-soft)', fontSize: '12px' } });
      infoSpan.textContent = '📁 ' + file.name + ' · ' + formatBytes(file.size) + ' · 上传到云端后可直接点击播放';
      const uploadTag = Utils.el('span', { style: { fontSize: '12px', color: '#92400e', background: '#fef3c7', padding: '2px 6px', borderRadius: '6px' } });
      uploadTag.textContent = '待上传（发布时自动上传到 Storage）';
      const removeBtn = Utils.el('button', {
        type: 'button',
        style: { padding: '2px 10px', fontSize: '12px' },
        class: 'btn btn-danger btn-sm',
      });
      removeBtn.textContent = '移除视频';
      removeBtn.addEventListener('click', () => {
        URL.revokeObjectURL(previewUrl);
        clearVideo();
      });
      metaRow.appendChild(infoSpan);
      metaRow.appendChild(uploadTag);
      metaRow.appendChild(removeBtn);

      videoPreview.appendChild(vidEl);
      videoPreview.appendChild(metaRow);
      // 临时保存 file 对象到 input 上，提交时用
      videoInput.__file = file;
      Utils.toast('视频已选入待发布，大小 ' + formatBytes(file.size) + '（发布时自动上传，失败会明确提示）', 'success');
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['视频']),
      videoBtn, videoInput, videoPreview,
    ]));
    // ===========================================================

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
      if (!content && !imageData && !videoInput.__file && !link) {
        Utils.toast('请填写分享内容、添加图片/视频，或粘贴链接', 'error'); return;
      }

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

        // ========== 视频上传：走 shares bucket，失败明确提示，不降级（视频不能塞 base64） ==========
        let finalVideoData = videoData;
        if (videoInput.__file && typeof DB.uploadFile === 'function') {
          submitBtn.textContent = '视频上传中…（大文件可能需要更久）';
          // 命名加前缀 share_vid_ 以便和图片 share_ 区分
          const ext = (videoInput.__file.name.split('.').pop() || 'mp4').toLowerCase();
          const fakeFile = Object.assign(new Blob([], { type: videoInput.__file.type || 'video/mp4' }), {
            name: 'share_vid_' + Date.now() + '_' + Math.floor(Math.random() * 1e6) + '.' + ext,
          });
          try {
            const vurl = await DB.uploadFile(videoInput.__file);
            if (!vurl) throw new Error('上传返回空链接');
            finalVideoData = vurl;
          } catch (ve) {
            console.error('[SHARES] 视频上传失败：', ve.message || ve);
            Utils.toast('视频上传失败：' + (ve.message || ve) + '（可稍后重试或压缩视频大小后再传）', 'error');
            _submitting = false;
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
            return;
          }
        }

        const result = await DB.addShare({
          member_id: isAnon ? null : mid, group_id: gid, title, content, link,
          image_data: finalImageData, video_data: finalVideoData, week: currentWeek,
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
        // 清视频
        videoPreview.querySelectorAll('video').forEach(v => { try { if (v.src) URL.revokeObjectURL(v.src); } catch (_) { /* ignore */ } });
        videoInput.value = '';
        videoInput.__file = null;
        videoPreview.innerHTML = '';
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
    const filterRow = Utils.el('div', { class: 'filter-row', style: { display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' } });
    const weekFilter = Utils.el('select', { class: 'form-input', style: { width: 'auto' } });
    weekFilter.appendChild(Utils.el('option', { value: '' }, ['全部周次']));
    weeks.forEach(w => {
      weekFilter.appendChild(Utils.el('option', { value: w, selected: w === currentWeek }, [w]));
    });
    // 视图 Tab：默认「当前分享」= 不看归档；「查看归档」= 只看归档
    const viewTabs = Utils.el('div', {
      style: {
        display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '8px',
        overflow: 'hidden', marginLeft: 'auto', background: 'var(--surface)',
      },
    });
    let curView = 'active'; // 'active' | 'archived'
    const tabActive = Utils.el('button', { type: 'button', class: 'btn btn-sm', style: { borderRadius: 0, background: 'var(--primary)', color: '#fff', border: 'none' } }, ['🟢 当前分享']);
    const tabArchive = Utils.el('button', { type: 'button', class: 'btn btn-sm btn-ghost', style: { borderRadius: 0, border: 'none' } }, ['📦 查看归档']);
    function syncTabs() {
      if (curView === 'active') {
        tabActive.style.background = 'var(--primary)';
        tabActive.style.color = '#fff';
        tabArchive.style.background = 'transparent';
        tabArchive.style.color = '';
      } else {
        tabArchive.style.background = 'var(--primary)';
        tabArchive.style.color = '#fff';
        tabActive.style.background = 'transparent';
        tabActive.style.color = '';
      }
    }
    tabActive.addEventListener('click', () => { curView = 'active'; syncTabs(); renderList(); });
    tabArchive.addEventListener('click', () => { curView = 'archived'; syncTabs(); renderList(); });
    viewTabs.appendChild(tabActive);
    viewTabs.appendChild(tabArchive);

    filterRow.appendChild(Utils.el('span', { style: { fontSize: '14px', color: 'var(--text-soft)' } }, ['周次：']));
    filterRow.appendChild(weekFilter);
    filterRow.appendChild(viewTabs);
    view.appendChild(filterRow);

    // 管理员工具条：归档上月媒体（视频/图片）分享 —— 减少默认首页产生的出流量 + Storage 视觉噪音，不物理删除
    if (ScoreApp.isAdmin && typeof DB.archiveLastMonthMediaShares === 'function') {
      const adminBar = Utils.el('div', {
        class: 'card',
        style: { padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', background: '#eff6ff', border: '1px dashed #93c5fd' },
      });
      const adminNote = Utils.el('div', { style: { fontSize: '13px', color: '#1e40af', lineHeight: 1.6 } });
      adminNote.innerHTML = '🛠️ <b>月度归档</b>（仅归档<b>上个月带视频/图片</b>的分享，纯文本不动）：<br/>'
        + '归档 = 默认视图隐藏，不删 Storage 文件，切到「📦 查看归档」还能播放；可显著减少「旧视频反复观看」吃掉的 2GB/月流量。';
      const archiveBtn = Utils.el('button', {
        type: 'button', class: 'btn btn-primary btn-sm',
        style: { background: '#2563eb', whiteSpace: 'nowrap' },
      }, ['📦 一键归档上月媒体分享']);
      archiveBtn.addEventListener('click', async () => {
        if (archiveBtn.dataset.locked === '1') return;
        if (!Utils.confirm('确定一键归档【上个月】所有带视频/图片的分享？\n（不会删除文件，只是默认隐藏，「查看归档」里还能找回并继续播放）')) return;
        try {
          archiveBtn.dataset.locked = '1';
          archiveBtn.disabled = true;
          const r = await DB.archiveLastMonthMediaShares();
          Utils.toast(`✅ 已归档 ${r.month} 月：共 ${r.archived} 条带媒体的分享`, 'success');
          renderList();
        } catch (e) {
          Utils.toast('归档失败：' + e.message, 'error');
        } finally {
          archiveBtn.dataset.locked = '';
          archiveBtn.disabled = false;
        }
      });
      adminBar.appendChild(adminNote);
      adminBar.appendChild(archiveBtn);
      view.appendChild(adminBar);
    }

    // 分享列表
    const listContainer = Utils.el('div', { id: 'shares-list' });
    view.appendChild(listContainer);

    function renderList() {
      const filterWeek = weekFilter.value;
      const includeArchived = curView === 'archived';
      let list;
      if (filterWeek) list = DB.listShares({ week: filterWeek, includeArchived: true });
      else list = DB.listShares({ includeArchived: true });
      // 根据 view 再过滤（避免修改 listShares 语义导致归档 Tab 拿不到 / 默认拿错）
      if (curView === 'archived') list = list.filter(s => !!s.archived);
      else list = list.filter(s => !s.archived);
      listContainer.innerHTML = '';

      if (list.length === 0) {
        const empty = Utils.el('div', { class: 'card', style: { textAlign: 'center', color: 'var(--text-soft)' } });
        empty.textContent = curView === 'archived'
          ? '📦 目前没有归档的分享（归档仅收上个月带视频/图片的分享）'
          : '📭 暂无分享，快来发第一条吧！';
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
        function appendImage(card, src, options = {}) {
          if (!src) return;
          const safeSrc = Utils.sanitizeUrl(src, { allowImageData: true });
          if (!safeSrc) return;
          const img = Utils.el('img', {
            src: safeSrc,
            class: 'share-image',
            style: Object.assign({ maxWidth: '100%', borderRadius: '8px', marginTop: '8px', display: 'block', cursor: 'zoom-in' }, (options.style || {})),
            loading: 'lazy', referrerpolicy: 'no-referrer',
            'data-lightbox-group': 'shares-list',
            'data-lightbox-src': safeSrc,
            title: '点击查看大图（支持 ← / → 切换同页图片）',
          });
          img.addEventListener('click', (e) => {
            e.preventDefault();
            Utils.openLightbox(safeSrc, { groupId: 'shares-list', alt: options.alt || '' });
          });
          card.appendChild(img);
        }
        function isImageLink(u) { return u && /^https?:\/\//i.test(u) && /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(u); }
        function isVideoLink(u) { return u && /^https?:\/\//i.test(u) && /\.(mp4|m4v|webm|ogg|ogv|mov|3gp|avi|mkv|ts)(\?|#|$)/i.test(u); }

        if (s.image_data) {
          appendImage(card, s.image_data);
        } else if (isImageLink(s.link)) {
          appendImage(card, s.link);
        }
        // ===== 视频卡片：专门上传的 video_data 或链接中识别出的 .mp4/.webm 等，点击即可直接播放 / 全屏 =====
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
            const btns = Utils.el('div', { style: { display: 'flex', gap: '6px' } });
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
            if (!isBrowserNative) {
              // 非原生支持（.mkv / .avi / .ts 等）：浏览器不保证能播，给个更明显的提示 + 默认不展示视频元素
              const warn = Utils.el('span', { style: { color: '#fca5a5' } });
              warn.textContent = '此格式浏览器可能不支持直接播放，建议点右侧「新窗口打开」下载后观看';
              btns.appendChild(warn);
            }
            vBar.appendChild(badge);
            vBar.appendChild(btns);
            vWrap.appendChild(vBar);

            if (isBrowserNative) {
              const vid = Utils.el('video', {
                src: vsrc,
                controls: '',
                preload: 'metadata',
                playsinline: 'true',
                style: { width: '100%', maxHeight: '460px', display: 'block', background: '#000' },
              });
              fsBtn.addEventListener('click', () => {
                try {
                  if (vid.requestFullscreen) vid.requestFullscreen();
                  else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
                  else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
                  else vid.play().catch(() => {});
                } catch (_e) { Utils.toast('当前浏览器不支持全屏，已切换到普通播放', 'warning'); vid.play().catch(() => {}); }
              });
              vWrap.appendChild(vid);
            } else {
              // 兜底：一个显眼的「点击下载后播放」卡片
              const fallback = Utils.el('a', {
                href: vsrc, target: '_blank', rel: 'noopener noreferrer',
                style: {
                  display: 'block', padding: '28px 14px', textAlign: 'center', color: '#e2e8f0',
                  textDecoration: 'none', background: 'linear-gradient(180deg,#334155,#0f172a)',
                },
              }, [
                Utils.el('div', { style: { fontSize: '40px' } }, ['📼']),
                Utils.el('div', { style: { marginTop: '4px', fontWeight: 600 } }, ['点击在新窗口打开 / 下载后播放']),
                Utils.el('div', { style: { marginTop: '4px', fontSize: '12px', color: '#94a3b8' } }, ['链接：' + vsrc]),
              ]);
              vWrap.appendChild(fallback);
            }
            card.appendChild(vWrap);
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
          // 非图片 / 非视频 后缀：http/https 走 a；其它协议降级为纯文本
          const isImg = isImageLink(s.link);
          const isVid = isVideoLink(s.link);
          if (!isImg && !isVid) {
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
        // 底部：周次 + 删除按钮（管理员可删）+ 归档标签/恢复按钮
        const footer = Utils.el('div', { class: 'share-footer' });
        // L-2：空 week 不渲染「空 span」占位，避免显示无意义标签
        if (s.week) {
          const weekSpan = Utils.el('span', { class: 'share-week' });
          weekSpan.textContent = s.week;
          footer.appendChild(weekSpan);
        }
        // 归档状态：给一个显眼的徽章
        if (s.archived) {
          const archBadge = Utils.el('span', {
            style: {
              marginLeft: '6px', fontSize: '12px', padding: '2px 8px',
              borderRadius: '999px', background: '#fef3c7', color: '#92400e',
              border: '1px solid #fcd34d',
            },
          });
          archBadge.textContent = '📦 已归档 · ' + (s.archived_at ? String(s.archived_at).slice(0, 10) : '');
          footer.appendChild(archBadge);
        }
        if (ScoreApp.isAdmin) {
          if (s.archived && typeof DB.unarchiveShare === 'function') {
            const unarchBtn = Utils.el('button', {
              class: 'btn btn-sm btn-ghost',
              style: { float: 'right', padding: '2px 8px', fontSize: '12px', marginLeft: '6px', color: '#166534', border: '1px solid #86efac' },
            });
            unarchBtn.textContent = '↩️ 恢复到当前';
            unarchBtn.addEventListener('click', async () => {
              if (unarchBtn.dataset.locked === '1') return;
              if (!Utils.confirm('确定把这条分享从归档恢复回「当前分享」视图？')) return;
              try {
                unarchBtn.dataset.locked = '1';
                unarchBtn.disabled = true;
                await DB.unarchiveShare(s.id);
                Utils.toast('已恢复到当前分享', 'info');
                renderList();
              } catch (e) {
                Utils.toast('恢复失败：' + e.message, 'error');
                unarchBtn.disabled = false;
                unarchBtn.dataset.locked = '';
              }
            });
            footer.appendChild(unarchBtn);
          }
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
