/* ============================================================
 * modules/rules.js - 【积分规则】模块
 *   展示尖刀排学习积分细则，所有用户可读，管理员可编辑说明
 * ============================================================ */
(function () {
  'use strict';

  const MOD_ID = 'rules';
  const MOD_NAME = '积分规则';
  const MOD_ICON = '📋';

  /** 规则详细文本（来自用户提供的细则原文） */
  const RULES = [
    {
      cat: 1, icon: '📍', title: '周日到校出勤打卡',
      time: '每周日 15:00',
      body: '每周日15:00按时到校打卡，到校以后发定位或拍校园照片。',
      points: [
        { label: '个人单次打卡', val: '+5 分', type: 'individual' },
        { label: '小组全员准时到校', val: '+30 分', type: 'group' },
      ],
    },
    {
      cat: 2, icon: '📚', title: '每周单词背诵打卡考核',
      time: '每周日 12:00 前上报',
      body: '每周日中午12:00前，各组组长汇总本组全员扇贝单词累计打卡总量，上报本群。按小组总量排名。',
      points: [
        { label: '第 1 名', val: '+12 分', type: 'group' },
        { label: '第 2 名', val: '+8 分', type: 'group' },
        { label: '第 3 名', val: '+5 分', type: 'group' },
      ],
    },
    {
      cat: 3, icon: '💬', title: '周末及假期群分享',
      time: '周日 12:00 前汇总',
      body: '可分享学习、能力增长、兴趣领域等内容发到此群。每人每次积1分。组长周日中午12点前汇总成员此项积分，发在群里如「胡楚睿组积*分」。',
      points: [
        { label: '每人每次', val: '+1 分', type: 'individual' },
      ],
    },
    {
      cat: 4, icon: '🎓', title: '期末考试小组学业积分',
      time: '期末统算',
      body: '依据期末考试成绩结算小组学业积分。',
      points: [
        { label: '单科均分位列第一', val: '+25 分', type: 'group' },
        { label: '总成绩均分排名 1-6 名', val: '80 / 65 / 55 / 40 / 20 / 10', type: 'group' },
      ],
    },
    {
      cat: 5, icon: '⭐', title: '个人单科拔尖奖励',
      time: '获评年级单科状元',
      body: '获评年级单科状元，个人积20分，小组积10分。（此项个人积分不与小组积分重复计算，即小组只因此积10分而不是30分）',
      points: [
        { label: '个人', val: '+20 分', type: 'individual' },
        { label: '小组', val: '+10 分', type: 'group' },
      ],
    },
  ];

  function renderRuleCard(rule) {
    return Utils.el('div', { class: 'rule-card', style: { borderLeftColor: DB.CATEGORIES[rule.cat].color } }, [
      Utils.el('div', { class: 'rule-header' }, [
        Utils.el('span', { class: 'rule-icon' }, [rule.icon]),
        Utils.el('span', { class: 'rule-title' }, [rule.title]),
        Utils.el('span', { class: 'cat-badge cat-' + rule.cat, style: { marginLeft: 'auto' } }, ['类别 ' + rule.cat]),
      ]),
      Utils.el('div', { class: 'rule-body' }, [
        Utils.el('div', { style: { marginBottom: '8px' } }, [rule.body]),
        Utils.el('div', { style: { marginBottom: '8px', color: 'var(--text)', fontSize: '13px' } }, [
          Utils.el('span', { style: { color: 'var(--text-soft)' } }, ['考核时间：']),
          rule.time,
        ]),
        Utils.el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' } },
          rule.points.map(p => Utils.el('span', {
            class: 'rule-points ' + (p.type === 'group' ? 'point-group' : 'point-individual'),
          }, [
            Utils.el('span', { style: { opacity: 0.8 } }, [p.type === 'group' ? '👥 ' : '👤 ']),
            p.label + ' ',
            Utils.el('strong', {}, [p.val]),
          ]))
        ),
      ]),
    ]);
  }

  function mount(view) {
    view.appendChild(Utils.el('div', { class: 'card' }, [
      Utils.el('div', { class: 'card-title' }, [
        Utils.el('span', {}, ['📋 尖刀排学习积分细则']),
        Utils.el('span', { style: { fontSize: '12px', color: 'var(--text-soft)', fontWeight: 'normal' } },
          ['本学期期末统一汇总积分开展评优表彰']),
      ]),
      Utils.el('div', { style: { background: '#eef2ff', padding: '14px 16px', borderRadius: '8px', marginBottom: '14px', fontSize: '14px', color: '#3730a3', lineHeight: 1.7 } }, [
        Utils.el('p', {}, [
          Utils.el('strong', {}, ['各位同学：']),
        ]),
        Utils.el('p', { style: { marginTop: '6px' } }, [
          '从本周起，尖刀排正式推行',
          Utils.el('strong', {}, ['小组协同发展考核机制']),
          '。请各位组长做好统筹管理，组员凝心聚力、互帮共进。各组暂以组长名字来命名（如 胡楚睿组）。',
        ]),
        Utils.el('p', { style: { marginTop: '6px' } }, [
          '本学期期末统一汇总积分开展评优表彰，具体积分规则如下，同时欢迎大家积极提出优化建议，完善评价体系。',
        ]),
      ]),
      ...RULES.map(renderRuleCard),
      Utils.el('div', { style: { textAlign: 'center', color: 'var(--text-soft)', fontSize: '13px', padding: '14px 0 4px' } }, [
        '⬇️ 以上积分规则适用于管理员录入与学生查看',
      ]),
    ]));
  }

  ScoreApp.registerModule({ id: MOD_ID, name: MOD_NAME, icon: MOD_ICON, mount });
})();
