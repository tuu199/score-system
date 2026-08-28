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

    // 发帖表单
    const formCard = Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, ['✏️ 发布分享']),
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
    let imageBase64 = '';
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
      if (file.size > 5 * 1024 * 1024) {
        Utils.toast('图片不能超过5MB', 'error');
        return;
      }
      // 压缩图片
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 800;
          let w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          imageBase64 = canvas.toDataURL('image/jpeg', 0.7);
          imagePreview.innerHTML = '';
          imagePreview.appendChild(Utils.el('div', {
            style: { position: 'relative', display: 'inline-block' },
          }, [
            Utils.el('img', {
              src: imageBase64,
              style: { maxWidth: '200px', maxHeight: '150px', borderRadius: '8px', border: '1px solid #ddd' },
            }),
            Utils.el('button', {
              type: 'button',
              style: { position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '14px', lineHeight: '1' },
              onclick: () => { imageBase64 = ''; imagePreview.innerHTML = ''; imageInput.value = ''; },
            }, ['×']),
          ]));
          Utils.toast('图片已添加', 'success');
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
    formCard.appendChild(Utils.el('div', { class: 'form-row' }, [
      Utils.el('label', {}, ['图片']),
      imageBtn, imageInput, imagePreview,
    ]));

    // 提交按钮
    const submitBtn = Utils.el('button', {
      class: 'btn btn-primary',
      style: { marginTop: '10px', width: '100%' },
    }, ['📤 发布分享（+1分）']);
    submitBtn.addEventListener('click', () => {
      const gid = Number(groupSelect.value);
      const mid = Number(memberSelect.value) || null;
      const title = titleInput.value.trim();
      const content = contentTextarea.value.trim();
      const link = linkInput.value.trim();
      if (!gid) { Utils.toast('请选择小组', 'error'); return; }
      if (!content && !imageBase64) { Utils.toast('请填写分享内容或添加图片', 'error'); return; }
      try {
        DB.addShare({
          member_id: mid, group_id: gid, title, content, link,
          image_data: imageBase64, week: currentWeek,
        });
        Utils.toast('分享成功！个人积分 +1', 'success');
        // 清空表单
        titleInput.value = '';
        contentTextarea.value = '';
        linkInput.value = '';
        imageBase64 = '';
        imagePreview.innerHTML = '';
        imageInput.value = '';
        // 刷新列表
        ScoreApp.navigate('shares');
      } catch (e) {
        Utils.toast('发布失败：' + e.message, 'error');
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
        listContainer.appendChild(Utils.el('div', { class: 'card', style: { textAlign: 'center', color: 'var(--text-soft)' } }, [
          '📭 暂无分享，快来发第一条吧！',
        ]));
        return;
      }

      list.forEach(s => {
        const card = Utils.el('div', { class: 'share-card' });
        // 头部：姓名 + 小组 + 时间
        card.appendChild(Utils.el('div', { class: 'share-header' }, [
          Utils.el('span', { class: 'share-author' }, [s.member_name || '未知']),
          Utils.el('span', { class: 'share-group' }, [s.group_name]),
          Utils.el('span', { class: 'share-time' }, [s.created_at]),
        ]));
        // 标题
        if (s.title) {
          card.appendChild(Utils.el('div', { class: 'share-title' }, [s.title]));
        }
        // 内容
        if (s.content) {
          card.appendChild(Utils.el('div', { class: 'share-content' }, [s.content]));
        }
        // 图片（base64 或链接是图片网址）
        if (s.image_data) {
          card.appendChild(Utils.el('img', {
            src: s.image_data,
            class: 'share-image',
            style: { maxWidth: '100%', borderRadius: '8px', marginTop: '8px' },
          }));
        } else if (s.link && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(s.link)) {
          // 链接是图片网址，内嵌显示
          card.appendChild(Utils.el('img', {
            src: s.link,
            class: 'share-image',
            style: { maxWidth: '100%', borderRadius: '8px', marginTop: '8px' },
          }));
        }
        // 视频链接
        if (s.link) {
          // B站视频嵌入
          const biliMatch = s.link.match(/bilibili\.com\/video\/(BV[\w]+)/i);
          if (biliMatch) {
            const iframe = Utils.el('iframe', {
              src: '//player.bilibili.com/player.html?bvid=' + biliMatch[1] + '&high_quality=1',
              class: 'share-video',
              style: { width: '100%', height: '200px', border: 'none', borderRadius: '8px', marginTop: '8px' },
              allowfullscreen: 'true',
              scrolling: 'no',
            });
            card.appendChild(iframe);
          } else if (!/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(s.link)) {
            // 普通链接
            const linkEl = Utils.el('a', {
              class: 'share-link', href: s.link, target: '_blank', rel: 'noopener',
            }, ['🔗 ' + s.link]);
            card.appendChild(linkEl);
          }
        }
        // 底部：周次 + 删除按钮（管理员可删）
        const footer = Utils.el('div', { class: 'share-footer' }, [
          Utils.el('span', { class: 'share-week' }, [s.week || '']),
        ]);
        if (ScoreApp.isAdmin) {
          const delBtn = Utils.el('button', {
            class: 'btn btn-danger btn-sm',
            style: { float: 'right', padding: '2px 8px', fontSize: '12px' },
          }, ['删除']);
          delBtn.addEventListener('click', () => {
            if (!confirm('确认删除这条分享？')) return;
            DB.deleteShare(s.id);
            Utils.toast('已删除', 'info');
            renderList();
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
