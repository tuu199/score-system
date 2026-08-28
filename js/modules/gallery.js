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

        // 头部：姓名 + 小组 + 时间
        card.appendChild(Utils.el('div', { class: 'share-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px' } }, [
          Utils.el('span', { class: 'share-author', style: { fontWeight: '600', color: isAnn ? '#d97706' : 'var(--text)' } }, [
            isAnn ? '📢 管理员公告' : '👤 ' + (s.member_name || '未知'),
          ]),
          Utils.el('span', { class: 'share-group', style: { color: 'var(--text-soft)' } }, [
            isAnn ? '通知' : s.group_name,
          ]),
          Utils.el('span', { class: 'share-time', style: { color: 'var(--text-soft)', fontSize: '12px' } }, [
            s.created_at ? s.created_at.slice(0, 16).replace('T', ' ') : '',
          ]),
        ]));

        // 标题
        if (s.title) {
          card.appendChild(Utils.el('div', { class: 'share-title', style: { fontWeight: '700', fontSize: '16px', marginBottom: '6px' } }, [s.title]));
        }
        // 内容
        if (s.content) {
          card.appendChild(Utils.el('div', { class: 'share-content', style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.6', marginBottom: '8px' } }, [s.content]));
        }
        // 图片（base64）
        if (s.image_data) {
          card.appendChild(Utils.el('img', {
            src: s.image_data,
            class: 'share-image',
            style: { maxWidth: '100%', borderRadius: '8px', marginTop: '8px', display: 'block' },
          }));
        } else if (s.link && /^https?:\/\//i.test(s.link) && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(s.link)) {
          card.appendChild(Utils.el('img', {
            src: s.link,
            class: 'share-image',
            style: { maxWidth: '100%', borderRadius: '8px', marginTop: '8px', display: 'block' },
          }));
        }
        // 视频链接
        if (s.link) {
          const biliMatch = s.link.match(/bilibili\.com\/video\/(BV[\w]+)/i);
          if (biliMatch) {
            card.appendChild(Utils.el('iframe', {
              src: '//player.bilibili.com/player.html?bvid=' + biliMatch[1] + '&high_quality=1',
              class: 'share-video',
              style: { width: '100%', height: '200px', border: 'none', borderRadius: '8px', marginTop: '8px' },
              allowfullscreen: 'true',
              scrolling: 'no',
            }));
          } else if (!/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(s.link)) {
            if (/^https?:\/\//i.test(s.link)) {
              card.appendChild(Utils.el('a', {
                class: 'share-link', href: s.link, target: '_blank', rel: 'noopener noreferrer',
                style: { display: 'inline-block', marginTop: '8px', color: 'var(--primary)', wordBreak: 'break-all' },
              }, ['🔗 ' + s.link]));
            } else {
              card.appendChild(Utils.el('span', { class: 'share-link', style: { display: 'inline-block', marginTop: '8px', color: 'var(--text-soft)', wordBreak: 'break-all' } }, ['🔗 ' + s.link]));
            }
          }
        }
        // 底部：周次 + 删除按钮（管理员可删）
        const footer = Utils.el('div', { class: 'share-footer', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' } }, [
          Utils.el('span', { class: 'share-week', style: { color: 'var(--text-soft)', fontSize: '12px' } }, [s.week || '']),
        ]);
        if (ScoreApp.isAdmin) {
          const delBtn = Utils.el('button', {
            class: 'btn btn-danger btn-sm',
            style: { padding: '2px 8px', fontSize: '12px' },
          }, ['删除']);
          delBtn.addEventListener('click', () => {
            if (!Utils.confirm('确认删除这条分享？')) return;
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
    typeFilter.addEventListener('change', renderList);
    renderList();
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount, adminOnly: false });
})();
