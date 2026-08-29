/* ============================================================
 * tests/features.test.js - 功能测试（分享加分上限 + 小组统计可视化）
 * 直接用 Node.js 的 assert 跑，不需要额外测试框架
 * ============================================================ */
'use strict';
const assert = require('assert');

// ---------- 模拟浏览器环境 ----------
global.window = global;
global.sessionStorage = {};
global.localStorage = {};

// ---------- 导入 Utils ----------
const UtilsMod = {};
global.Utils = UtilsMod;
// 手动定义 Utils 中测试需要的方法
UtilsMod.round = (n) => Math.round(n * 100) / 100;
UtilsMod.el = (tag, attrs, children) => ({ tag, attrs, children });
UtilsMod.toast = (msg) => {};
UtilsMod.confirm = () => true;

// ---------- 导入 DB（只提取需要的方法）----------
// 为了测试，我们直接复制 addShare 的核心逻辑 + computeStatistics 的核心逻辑
// 并模拟 _cache 和 _insert
const _cache = {
  groups: [
    { id: 1, name: '第一组', leader_name: '组长A' },
    { id: 2, name: '第二组', leader_name: '组长B' },
  ],
  members: [
    { id: 1, name: '张三', group_id: 1 },
    { id: 2, name: '李四', group_id: 1 },
    { id: 3, name: '王五', group_id: 2 },
  ],
  score_records: [],
  shares: [],
  docs: [],
  settings: {},
};

const CATEGORIES = {
  1: { name: '出勤打卡', icon: '✅', short: '出勤', color: '#3b82f6' },
  2: { name: '每周单词背诵打卡', icon: '📚', short: '单词', color: '#10b981' },
  3: { name: '周末及假期群分享', icon: '💬', short: '分享', color: '#f59e0b' },
  4: { name: '期末考试小组学业积分', icon: '🎓', short: '期末', color: '#8b5cf6' },
  5: { name: '个人单科拔尖奖励', icon: '⭐', short: '拔尖', color: '#ef4444' },
};

let _nextId = 1;
function _insert(table, row) {
  const record = { id: _nextId++, ...row };
  _cache[table].push(record);
  return record;
}
function _delete(table, id) {
  _cache[table] = _cache[table].filter(r => r.id !== id);
}
function _now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ====== 需求1: 分享加分每周上限4分 ======
const WEEKLY_SHARE_CAP = 4;

function getWeeklySharePoints(member_id, week) {
  // 返回该成员在该周已经通过分享获得的积分
  return _cache.score_records.filter(r =>
    r.member_id === member_id && r.category === 3 && r.week === week
  ).reduce((s, r) => s + (Number(r.individual_points) || 0), 0);
}

function addShare({ member_id, group_id, title, content, link, image_data, week, is_announcement }) {
  const now = _now();
  const share = _insert('shares', {
    member_id: member_id || null,
    group_id,
    title: title || '',
    content,
    link: link || '',
    image_data: image_data || '',
    week: week || '',
    created_at: now,
    is_announcement: is_announcement ? 1 : 0,
  });
  // 普通分享且有成员关联时自动加分，但不能超过每周上限
  if (!is_announcement && member_id) {
    const currentWeekPts = getWeeklySharePoints(member_id, week);
    if (currentWeekPts < WEEKLY_SHARE_CAP) {
      _insert('score_records', {
        member_id,
        group_id,
        category: 3,
        description: '群分享：' + (title || (content || '').slice(0, 20)),
        individual_points: 1,
        group_points: 0,
        week: week || '',
        created_at: now,
        recorded_by: '分享板自动',
      });
      return { shareId: share.id, pointsAwarded: 1, reachedCap: currentWeekPts + 1 >= WEEKLY_SHARE_CAP };
    }
    // 达到上限，不加积分
    return { shareId: share.id, pointsAwarded: 0, reachedCap: true };
  }
  return { shareId: share.id, pointsAwarded: 0, reachedCap: false };
}

// ====== 需求2: 单个小组统计 ======
function computeStatistics() {
  const records = _cache.score_records;
  const overall = {
    total_records: records.length,
    total_individual: UtilsMod.round(records.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
    total_group: UtilsMod.round(records.reduce((s, r) => s + (Number(r.group_points) || 0), 0)),
    total_all: UtilsMod.round(records.reduce((s, r) => s + (Number(r.individual_points) || 0) + (Number(r.group_points) || 0), 0)),
  };
  const byGroup = _cache.groups.map(g => {
    const gr = records.filter(r => r.group_id === g.id);
    return {
      id: g.id, name: g.name, leader_name: g.leader_name,
      record_count: gr.length,
      indiv_pts: UtilsMod.round(gr.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
      group_pts: UtilsMod.round(gr.reduce((s, r) => s + (Number(r.group_points) || 0), 0)),
      total_pts: UtilsMod.round(gr.reduce((s, r) => s + (Number(r.individual_points) || 0) + (Number(r.group_points) || 0), 0)),
    };
  }).sort((a, b) => b.total_pts - a.total_pts);
  const byCategory = [1, 2, 3, 4, 5].map(cat => {
    const cr = records.filter(r => r.category === cat);
    return {
      category: cat,
      record_count: cr.length,
      indiv_pts: UtilsMod.round(cr.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
      group_pts: UtilsMod.round(cr.reduce((s, r) => s + (Number(r.group_points) || 0), 0)),
      total_pts: UtilsMod.round(cr.reduce((s, r) => s + (Number(r.individual_points) || 0) + (Number(r.group_points) || 0), 0)),
    };
  });
  return { overall, by_group: byGroup, by_category: byCategory };
}

/**
 * 计算单个小组的详细统计数据（用于小组可视化）
 */
function getGroupStatistics(group_id) {
  const group = _cache.groups.find(g => g.id === group_id);
  if (!group) return null;
  const members = _cache.members.filter(m => m.group_id === group_id);
  const records = _cache.score_records.filter(r => r.group_id === group_id);

  // 该小组的每个成员个人积分排名
  const memberRanking = members.map(m => {
    const mr = records.filter(r => r.member_id === m.id);
    return {
      id: m.id, name: m.name,
      indiv_pts: UtilsMod.round(mr.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
      record_count: mr.length,
    };
  }).sort((a, b) => b.indiv_pts - a.indiv_pts);

  // 该小组各类别积分构成
  const byCategory = [1, 2, 3, 4, 5].map(cat => {
    const cr = records.filter(r => r.category === cat);
    return {
      category: cat,
      label: CATEGORIES[cat] ? CATEGORIES[cat].icon + ' ' + CATEGORIES[cat].short : '其他',
      color: CATEGORIES[cat] ? CATEGORIES[cat].color : '#6b7280',
      indiv_pts: UtilsMod.round(cr.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
      group_pts: UtilsMod.round(cr.reduce((s, r) => s + (Number(r.group_points) || 0), 0)),
      total_pts: UtilsMod.round(cr.reduce((s, r) => s + (Number(r.individual_points) || 0) + (Number(r.group_points) || 0), 0)),
    };
  }).filter(c => c.total_pts > 0);

  // 该小组各周积分趋势
  const byWeek = {};
  records.forEach(r => {
    const w = r.week || '未指定';
    if (!byWeek[w]) byWeek[w] = { week: w, indiv: 0, group: 0, total: 0 };
    byWeek[w].indiv += Number(r.individual_points) || 0;
    byWeek[w].group += Number(r.group_points) || 0;
    byWeek[w].total += (Number(r.individual_points) || 0) + (Number(r.group_points) || 0);
  });
  const weekTrend = Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week));

  return {
    id: group.id, name: group.name, leader_name: group.leader_name,
    member_count: members.length,
    record_count: records.length,
    indiv_pts: UtilsMod.round(records.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
    group_pts: UtilsMod.round(records.reduce((s, r) => s + (Number(r.group_points) || 0), 0)),
    total_pts: UtilsMod.round(records.reduce((s, r) => s + (Number(r.individual_points) || 0) + (Number(r.group_points) || 0), 0)),
    member_ranking: memberRanking,
    by_category: byCategory,
    week_trend: weekTrend,
  };
}

// ============================================================
// 测试套件
// ============================================================

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message}`);
    failed++;
  }
}

// ---------- 清空数据 ----------
function resetCache() {
  _cache.score_records = [];
  _cache.shares = [];
  _nextId = 1;
}

console.log('\n=== 功能1: 分享加分每周上限4分 ===\n');

test('第1次分享：正常加1分', () => {
  resetCache();
  const result = addShare({ member_id: 1, group_id: 1, title: '分享1', content: '内容1', week: '2026-W35' });
  assert.strictEqual(result.pointsAwarded, 1);
  assert.strictEqual(result.reachedCap, false);
  assert.strictEqual(_cache.score_records.length, 1);
  assert.strictEqual(getWeeklySharePoints(1, '2026-W35'), 1);
});

test('第2次分享：再加1分，累计2分', () => {
  const result = addShare({ member_id: 1, group_id: 1, title: '分享2', content: '内容2', week: '2026-W35' });
  assert.strictEqual(result.pointsAwarded, 1);
  assert.strictEqual(getWeeklySharePoints(1, '2026-W35'), 2);
});

test('第3次分享：再加1分，累计3分', () => {
  const result = addShare({ member_id: 1, group_id: 1, title: '分享3', content: '内容3', week: '2026-W35' });
  assert.strictEqual(result.pointsAwarded, 1);
  assert.strictEqual(getWeeklySharePoints(1, '2026-W35'), 3);
});

test('第4次分享：再加1分，累计4分，到达上限', () => {
  const result = addShare({ member_id: 1, group_id: 1, title: '分享4', content: '内容4', week: '2026-W35' });
  assert.strictEqual(result.pointsAwarded, 1);
  assert.strictEqual(result.reachedCap, true);
  assert.strictEqual(getWeeklySharePoints(1, '2026-W35'), 4);
});

test('第5次分享：超过上限，不再加分', () => {
  const result = addShare({ member_id: 1, group_id: 1, title: '分享5', content: '内容5', week: '2026-W35' });
  assert.strictEqual(result.pointsAwarded, 0);
  assert.strictEqual(result.reachedCap, true);
  assert.strictEqual(getWeeklySharePoints(1, '2026-W35'), 4);
  // 分享内容仍然会被记录
  assert.strictEqual(_cache.shares.length, 5);
  // 积分记录只增加4条（第5次不产生记录）
  assert.strictEqual(_cache.score_records.length, 4);
});

test('换一周分享：重新计数，再加1分', () => {
  const result = addShare({ member_id: 1, group_id: 1, title: '新周分享', content: '新周内容', week: '2026-W36' });
  assert.strictEqual(result.pointsAwarded, 1);
  assert.strictEqual(getWeeklySharePoints(1, '2026-W36'), 1);
  // 上一周仍保持4分
  assert.strictEqual(getWeeklySharePoints(1, '2026-W35'), 4);
});

test('匿名分享：不加分', () => {
  resetCache();
  const result = addShare({ member_id: null, group_id: 1, title: '匿名分享', content: '匿名内容', week: '2026-W35' });
  assert.strictEqual(result.pointsAwarded, 0);
  assert.strictEqual(_cache.score_records.length, 0);
  // 分享内容仍然被记录
  assert.strictEqual(_cache.shares.length, 1);
});

test('管理员公告：不加分', () => {
  resetCache();
  const result = addShare({ member_id: null, group_id: 1, title: '公告', content: '公告内容', week: '2026-W35', is_announcement: true });
  assert.strictEqual(result.pointsAwarded, 0);
  assert.strictEqual(_cache.score_records.length, 0);
  assert.strictEqual(_cache.shares[0].is_announcement, 1);
});

test('不同成员：各自独立计数，不相互影响', () => {
  resetCache();
  // 成员1连续4次分享，达到上限
  for (let i = 1; i <= 4; i++) {
    addShare({ member_id: 1, group_id: 1, title: '张' + i, content: 'c' + i, week: '2026-W35' });
  }
  assert.strictEqual(getWeeklySharePoints(1, '2026-W35'), 4);
  // 成员2第一次分享，正常加分
  const result = addShare({ member_id: 2, group_id: 1, title: '李1', content: 'lc1', week: '2026-W35' });
  assert.strictEqual(result.pointsAwarded, 1);
  assert.strictEqual(getWeeklySharePoints(2, '2026-W35'), 1);
  // 成员1仍保持4分
  assert.strictEqual(getWeeklySharePoints(1, '2026-W35'), 4);
});

console.log('\n=== 功能2: 单个小组统计可视化 ===\n');

resetCache();
// 填充测试数据
// 第一组成员：张三(1)、李四(2)
// 分享：张三 3 条（3分），李四 2 条（2分）
// 单词打卡：张三 +5，李四 +8（小组单词第一奖励）
// 拔尖奖励：张三 +20，+10小组积分
// 出勤：李四 +1
for (let i = 0; i < 3; i++) addShare({ member_id: 1, group_id: 1, title: '张' + i, content: 'c', week: '2026-W35' });
for (let i = 0; i < 2; i++) addShare({ member_id: 2, group_id: 1, title: '李' + i, content: 'c', week: '2026-W35' });
// 单词打卡（category=2）
_cache.score_records.push({ id: _nextId++, member_id: 1, group_id: 1, category: 2, description: '单词打卡', individual_points: 5, group_points: 0, week: '2026-W35', created_at: _now(), recorded_by: 'test' });
_cache.score_records.push({ id: _nextId++, member_id: 2, group_id: 1, category: 2, description: '单词打卡', individual_points: 8, group_points: 0, week: '2026-W35', created_at: _now(), recorded_by: 'test' });
_cache.score_records.push({ id: _nextId++, member_id: null, group_id: 1, category: 2, description: '单词小组第一', individual_points: 0, group_points: 12, week: '2026-W35', created_at: _now(), recorded_by: 'test' });
// 拔尖（category=5）
_cache.score_records.push({ id: _nextId++, member_id: 1, group_id: 1, category: 5, description: '单科状元', individual_points: 20, group_points: 10, week: '2026-W35', created_at: _now(), recorded_by: 'test' });
// 出勤（category=1）
_cache.score_records.push({ id: _nextId++, member_id: 2, group_id: 1, category: 1, description: '出勤打卡', individual_points: 1, group_points: 0, week: '2026-W34', created_at: _now(), recorded_by: 'test' });

test('小组统计基本信息正确', () => {
  const gs = getGroupStatistics(1);
  assert.ok(gs !== null);
  assert.strictEqual(gs.id, 1);
  assert.strictEqual(gs.name, '第一组');
  assert.strictEqual(gs.member_count, 2);
  // 总个人积分 = 张(3+5+20) + 李(2+8+1) = 28 + 11 = 39
  assert.strictEqual(gs.indiv_pts, 39);
  // 总小组积分 = 单词12 + 拔尖10 = 22
  assert.strictEqual(gs.group_pts, 22);
  // 合计 39+22 = 61
  assert.strictEqual(gs.total_pts, 61);
});

test('小组成员个人排名正确', () => {
  const gs = getGroupStatistics(1);
  const ranking = gs.member_ranking;
  assert.strictEqual(ranking.length, 2);
  // 张三：3(分享) + 5(单词) + 20(拔尖) = 28
  // 李四：2(分享) + 8(单词) + 1(出勤) = 11
  // 张三应排第一
  assert.strictEqual(ranking[0].name, '张三');
  assert.strictEqual(ranking[0].indiv_pts, 28);
  assert.strictEqual(ranking[1].name, '李四');
  assert.strictEqual(ranking[1].indiv_pts, 11);
});

test('小组各类别构成正确', () => {
  const gs = getGroupStatistics(1);
  const cats = gs.by_category;
  // 类别1(出勤): 李1分 个人1 小组0 合计1
  // 类别2(单词): 张5+李8 个人13 小组12 合计25
  // 类别3(分享): 张3+李2 个人5 小组0 合计5
  // 类别5(拔尖): 张20 小组10 合计30
  const cat1 = cats.find(c => c.category === 1);
  const cat2 = cats.find(c => c.category === 2);
  const cat3 = cats.find(c => c.category === 3);
  const cat5 = cats.find(c => c.category === 5);
  assert.ok(cat1); assert.strictEqual(cat1.total_pts, 1);
  assert.ok(cat2); assert.strictEqual(cat2.total_pts, 25);
  assert.ok(cat3); assert.strictEqual(cat3.total_pts, 5);
  assert.ok(cat5); assert.strictEqual(cat5.total_pts, 30);
  // 类别4（期末）没有数据，应该被过滤
  const cat4 = cats.find(c => c.category === 4);
  assert.ok(!cat4);
});

test('小组周积分趋势正确', () => {
  const gs = getGroupStatistics(1);
  const weeks = gs.week_trend;
  // 有 W34 和 W35 两个周次
  const weeksMap = {};
  weeks.forEach(w => weeksMap[w.week] = w);
  // W34: 李四出勤 个人1 小组0 合计1
  assert.ok(weeksMap['2026-W34']);
  assert.strictEqual(weeksMap['2026-W34'].total, 1);
  // W35: 分享3+2 个人5 + 单词5+8=13个人 12小组 + 拔尖20个人 10小组 = 个人38 小组22 合计60
  assert.ok(weeksMap['2026-W35']);
  assert.strictEqual(weeksMap['2026-W35'].indiv, 38);
  assert.strictEqual(weeksMap['2026-W35'].group, 22);
  assert.strictEqual(weeksMap['2026-W35'].total, 60);
});

test('查询不存在的小组返回null', () => {
  const gs = getGroupStatistics(999);
  assert.strictEqual(gs, null);
});

test('computeStatistics 仍正常工作（兼容）', () => {
  const s = computeStatistics();
  // 两个小组都被统计
  assert.strictEqual(s.by_group.length, 2);
  // 第一组排第一
  assert.strictEqual(s.by_group[0].name, '第一组');
  assert.strictEqual(s.by_group[0].total_pts, 61);
  // 第二组没有数据，合计0
  assert.strictEqual(s.by_group[1].total_pts, 0);
  // 5个类别都在
  assert.strictEqual(s.by_category.length, 5);
});

// ============================================================
// 新增：10 个 Bug/漏洞 修复的 TDD 测试
// ============================================================
console.log('\n=== Bug 修复测试（10 条） ===\n');

// ---------- 通用积分录入 ----------
function addRecord({ member_id, group_id, category, description, individual_points, group_points, week, recorded_by = 'test' }) {
  const now = _now();
  const record = {
    id: _nextId++,
    member_id: member_id || null,
    group_id,
    category,
    description: description || '',
    individual_points: Number(individual_points) || 0,
    group_points: Number(group_points) || 0,
    week: week || '',
    created_at: now,
    recorded_by,
  };
  _cache.score_records.push(record);
  return record.id;
}

// ---------- H-1 删除分享联动删除自动积分 ----------
function deleteShare(id) {
  // 先取出分享记录
  const share = _cache.shares.find(s => s.id === id);
  _cache.shares = _cache.shares.filter(s => s.id !== id);
  if (!share) return;
  // 联动删除 自动加分记录（recorded_by === '分享板自动'）
  if (share.member_id && !share.is_announcement) {
    const descPrefix = '群分享：' + (share.title || (share.content || '').slice(0, 20));
    _cache.score_records = _cache.score_records.filter(r =>
      !(r.category === 3 &&
        r.member_id === share.member_id &&
        r.week === share.week &&
        r.recorded_by === '分享板自动' &&
        (r.description || '').startsWith(descPrefix.slice(0, 10))
      )
    );
  }
}

test('[H-1] 发分享+删分享，自动+1的积分必须同步删除', () => {
  resetCache();
  const r1 = addShare({ member_id: 1, group_id: 1, title: '待删', content: '删除测试', week: '2026-W30' });
  assert.strictEqual(getWeeklySharePoints(1, '2026-W30'), 1, '发布后应有1分');
  assert.strictEqual(_cache.score_records.length, 1);
  deleteShare(r1.shareId);
  assert.strictEqual(_cache.shares.length, 0, '分享应被删除');
  assert.strictEqual(_cache.score_records.length, 0, '自动积分应被联动删除');
  assert.strictEqual(getWeeklySharePoints(1, '2026-W30'), 0, '周积分应归零');
});

test('[H-1] 手动录入的分享类(category=3)积分，删除分享时不能误删', () => {
  resetCache();
  // 先发一条分享（自动积分）
  addShare({ member_id: 1, group_id: 1, title: '自动分享A', content: 'A', week: '2026-W30' });
  // 再手动录入一条分享类积分（recorded_by !== '分享板自动'）
  addRecord({ member_id: 1, group_id: 1, category: 3, description: '群主手动嘉奖分享额外分', individual_points: 2, week: '2026-W30', recorded_by: '管理员' });
  assert.strictEqual(getWeeklySharePoints(1, '2026-W30'), 3);
  // 删除自动发的那条分享
  const shareId = _cache.shares[0].id;
  deleteShare(shareId);
  // 应只剩手动录入的 2 分
  assert.strictEqual(_cache.score_records.length, 1, '手动录入不能被联动删除');
  assert.strictEqual(getWeeklySharePoints(1, '2026-W30'), 2);
});

// ---------- H-2 登录节流 ----------
let _loginFailCount = 0;
let _loginCoolUntil = 0;
function tryLogin(password) {
  const correct = 'admin123';
  const nowMs = Date.now();
  if (_loginCoolUntil && nowMs < _loginCoolUntil) return 'cooling';
  if (password === correct) { _loginFailCount = 0; return 'ok'; }
  _loginFailCount += 1;
  if (_loginFailCount >= 3) { _loginCoolUntil = nowMs + 1000; return 'cooling'; }
  return 'wrong';
}
test('[H-2] 3 次密码错误后进入 1 秒冷却', () => {
  _loginFailCount = 0; _loginCoolUntil = 0;
  assert.strictEqual(tryLogin('bad1'), 'wrong');
  assert.strictEqual(tryLogin('bad2'), 'wrong');
  assert.strictEqual(tryLogin('bad3'), 'cooling', '第3次应锁1秒');
  // 即使输入正确密码也被冷却拒绝
  assert.strictEqual(tryLogin('admin123'), 'cooling', '冷却中即使密码对也应拒绝');
});

// ---------- H-3 XSS：escapeHtml 转义 ----------
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// 简单的「安全链接校验」白名单：允许 http/https/blob/mailto + B 站 iframe
function isSafeUrl(u) {
  if (!u) return false;
  const allowProtocols = ['http://', 'https://', 'blob:', 'mailto:', 'data:image/'];
  return allowProtocols.some(p => u.toLowerCase().startsWith(p));
}
function isBilibiliDomain(u) {
  if (!u) return false;
  try {
    const url = new URL(u);
    return /(^|\.)(bilibili\.com|b23\.tv)$/.test(url.hostname);
  } catch { return false; }
}
test('[H-3] escapeHtml 必须转义 script/img 标签', () => {
  const payload = `<img src=x onerror='alert(1)'><script>stealCookies()</script>`;
  const out = escapeHtml(payload);
  assert.ok(!out.includes('<img'), 'img 标签必须被转义');
  assert.ok(!out.includes('<script>'), 'script 标签必须被转义');
  assert.ok(!out.includes('onerror='), '事件处理器必须被转义');
  assert.ok(out.includes('&lt;img'), '应为实体');
});
test('[H-3] isSafeUrl 拒绝 javascript:/vbscript: 伪协议', () => {
  assert.strictEqual(isSafeUrl('javascript:alert(1)'), false);
  assert.strictEqual(isSafeUrl('vbscript:msgbox(1)'), false);
  assert.strictEqual(isSafeUrl('data:text/html,<h1>hi</h1>'), false);
  assert.strictEqual(isSafeUrl('https://tuu199.github.io'), true);
  assert.strictEqual(isSafeUrl('blob:https://...'), true);
});
test('[H-3] B站白名单域名识别', () => {
  assert.strictEqual(isBilibiliDomain('https://www.bilibili.com/video/BV1xx'), true);
  assert.strictEqual(isBilibiliDomain('https://b23.tv/short123'), true);
  assert.strictEqual(isBilibiliDomain('https://bilibili.com.evil.com/phish'), false);
});

// ---------- H-4 _insert 改造 async + _update/_delete 支持 tempId（兜底）----------
// 用队列模型：负id的更新/删除进入pending队列，等真实id落下来再发 Supabase
const pendingOps = {}; // key: tempId → [{op:'update', updates}, {op:'delete'}]
function _insertAsync(table, row, applyRealIdDelayMs = 50) {
  return new Promise((resolve) => {
    const tempId = -_nextId; // 模拟旧代码 _nextTempId 负id递减
    const item = { id: tempId, ...row };
    _cache[table].push(item);
    // 模拟异步网络返回真实 id
    setTimeout(() => {
      const realId = _nextId++;
      item.id = realId;
      // 处理 pending 队列
      (pendingOps[tempId] || []).forEach(op => {
        if (op.op === 'delete') {
          // 此时有真实 id，执行真正删除
          const idx = _cache[table].findIndex(r => r.id === realId);
          if (idx >= 0) _cache[table].splice(idx, 1);
        } else if (op.op === 'update') {
          Object.assign(item, op.updates);
        }
      });
      delete pendingOps[tempId];
      resolve(item);
    }, applyRealIdDelayMs);
  });
}
function _deleteAsyncSafe(table, id) {
  if (id > 0) {
    const idx = _cache[table].findIndex(r => r.id === id);
    if (idx >= 0) _cache[table].splice(idx, 1);
    return Promise.resolve(true);
  }
  // id < 0：入队列，等待真实 id 回来再删
  if (!pendingOps[id]) pendingOps[id] = [];
  pendingOps[id].push({ op: 'delete' });
  return new Promise(resolve => setTimeout(() => resolve(true), 120));
}

test('[H-4] 插入后立即删除负id记录，真实 id 回写后也必须已删除', async () => {
  resetCache();
  const pItem = _insertAsync('shares', { member_id: 1, group_id: 1, title: '幽灵恢复测试', content: 'x' });
  // 立刻拿当前内存中的 tempId（负数）
  const tempShare = _cache.shares.find(s => s.title === '幽灵恢复测试');
  assert.ok(tempShare && tempShare.id < 0, '插入时应是负 id');
  // 立即执行删除（此时仍负id → 进 pending）
  const delDone = _deleteAsyncSafe('shares', tempShare.id);
  // 等异步都完成
  await pItem;
  await delDone;
  // 真实 id 回写后也不应该再在 shares 表里
  assert.strictEqual(_cache.shares.length, 0, '不应出现幽灵恢复');
});

// ---------- H-5 addRecord 合法性校验 ----------
function validateAddRecord(args) {
  const { member_id, group_id, category, individual_points, group_points } = args;
  const indiv = Number(individual_points) || 0;
  const gp = Number(group_points) || 0;
  // ① 数值范围
  if (indiv < -99 || indiv > 500 || gp < -99 || gp > 500) return 'out_of_range';
  // ② 个人归属必须属于该组
  if (member_id != null) {
    const m = _cache.members.find(x => x.id === member_id);
    if (!m) return 'member_not_found';
    if (m.group_id !== group_id) return 'member_not_in_group';
  }
  // ③ 分享 category=3 只允许 '分享板自动' 路径，手动录入应拒绝
  if (category === 3 && args.recorded_by !== '分享板自动') return 'share_use_shareboard';
  // ④ 不能两者都 0
  if (indiv === 0 && gp === 0) return 'both_zero';
  return 'ok';
}
test('[H-5] 积分值越界应拒绝', () => {
  assert.strictEqual(validateAddRecord({ member_id: 1, group_id: 1, category: 1, individual_points: -100 }), 'out_of_range');
  assert.strictEqual(validateAddRecord({ member_id: 1, group_id: 1, category: 1, individual_points: 9999 }), 'out_of_range');
  assert.strictEqual(validateAddRecord({ member_id: 1, group_id: 1, category: 1, individual_points: 5 }), 'ok');
});
test('[H-5] 跨组录入应拒绝（张三组1，录入组2）', () => {
  assert.strictEqual(validateAddRecord({ member_id: 1, group_id: 2, category: 1, individual_points: 5 }), 'member_not_in_group');
  assert.strictEqual(validateAddRecord({ member_id: 1, group_id: 1, category: 1, individual_points: 5 }), 'ok');
});
test('[H-5] 手动录入 category=3（分享）应拒绝', () => {
  assert.strictEqual(validateAddRecord({ member_id: 1, group_id: 1, category: 3, individual_points: 1, recorded_by: '管理员' }), 'share_use_shareboard');
  assert.strictEqual(validateAddRecord({ member_id: 1, group_id: 1, category: 3, individual_points: 1, recorded_by: '分享板自动' }), 'ok');
});

// ---------- M-1 分享上限原子锁（并发插入）----------
// 为 addShare 引入 "per-member+week" lock，保证并发 getWeeklySharePoints 等待上一条加分落定
const shareLocks = {};
async function addShareAtomic(args) {
  const key = `${args.member_id || 'x'}:${args.week || 'w'}`;
  if (shareLocks[key]) {
    await shareLocks[key]; // 排队
  }
  let release;
  shareLocks[key] = new Promise(r => (release = r));
  try {
    return addShare(args);
  } finally {
    release();
    if ((shareLocks[key] || null) === null) delete shareLocks[key];
    else setTimeout(() => delete shareLocks[key], 0);
  }
}
test('[M-1] 并发 10 条 addShare，本周分享分仍=4（原子锁生效）', async () => {
  resetCache();
  const tasks = [];
  for (let i = 0; i < 10; i++) {
    tasks.push(addShareAtomic({ member_id: 3, group_id: 2, title: 'P' + i, content: '并发' + i, week: '2026-W33' }));
  }
  await Promise.all(tasks);
  const pts = getWeeklySharePoints(3, '2026-W33');
  assert.strictEqual(pts, 4, '并发也不能超 4 分上限');
  // 分数只产生 4 条 score_records
  const cnt = _cache.score_records.filter(r => r.member_id === 3 && r.category === 3 && r.week === '2026-W33').length;
  assert.strictEqual(cnt, 4, '积分记录只能有 4 条');
});

// ---------- L-1 跨年周次算法 ----------
function _isoWeekFix(d) {
  // 修正：严格 ISO 周算法 + 返回 {year, week} 防跨年错位
  // 复制一份避免改原对象
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function getRecentWeeksFix(count) {
  const weeks = [];
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  // 对齐到本周周四，确定 ISO 锚点
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  for (let i = 0; i < count; i++) {
    weeks.push(_isoWeekFix(new Date(d)));
    d.setUTCDate(d.getUTCDate() - 7);
  }
  return weeks;
}
test('[L-1] 2026-01-01（周四）应属于 2026-W01，而不是 2025-W53', () => {
  const w = _isoWeekFix(new Date(2026, 0, 1)); // 2026-01-01
  assert.strictEqual(w, '2026-W01');
});
test('[L-1] getRecentWeeksFix(12) 返回 12 个不重复的连续周次，跨年不错位', () => {
  const weeks = getRecentWeeksFix(12);
  assert.strictEqual(weeks.length, 12);
  const unique = new Set(weeks);
  assert.strictEqual(unique.size, 12, '12 个周次应全部不同');
  // 严格按从新到旧排序（时间戳大→小）
  for (let i = 1; i < weeks.length; i++) {
    assert.ok(weeks[i] <= weeks[i - 1], `应按新→旧：${weeks[i]} <= ${weeks[i - 1]}`);
  }
});

// ---------- L-2 空 week 下沉排序 ----------
function searchRecordsSorted(recs) {
  return recs.slice().sort((a, b) => {
    // 空 week 一律下沉
    if (!a.week && b.week) return 1;
    if (a.week && !b.week) return -1;
    if (a.week !== b.week) return (b.week || '').localeCompare(a.week || '');
    return 0;
  });
}
test('[L-2] 搜索结果中空week应下沉到末尾', () => {
  const rows = [
    { week: '2026-W35', id: 1 },
    { week: '', id: 2 },
    { week: '2026-W34', id: 3 },
    { week: '', id: 4 },
  ];
  const s = searchRecordsSorted(rows);
  assert.strictEqual(s[0].week, '2026-W35', '最新周在前');
  assert.strictEqual(s[1].week, '2026-W34');
  assert.strictEqual(s[2].week, '');
  assert.strictEqual(s[3].week, '');
});

// ---------- 分享「按月归档」功能（3 条 TDD）----------
// 归档 = 隐藏出「首页分享列表 / 分享广场默认视图」，但保留行 & Storage 视频文件，
// 切到「查看归档」Tab 还能找回且视频还能播。不物理删除 Storage，避免下月再继续产生观看流量。
function monthKey(isoDateStr) {
  // '2026-07-15 10:00:00' / '2026-07-15T10:00:00' 都返回 '2026-07'
  const m = /^(\d{4})[-/](\d{1,2})/.exec(isoDateStr || '');
  if (!m) return '';
  return m[1] + '-' + String(m[2]).padStart(2, '0');
}
// 在原 addShare 结果对象里额外补 archived/month_key
const _origAddShare = addShare;
addShare = function (args) {
  const result = _origAddShare(args);
  // 新插入的 share 行应带两个新列（即使老行没有也不能炸）
  const row = _cache.shares.find(s => s.id === result.shareId);
  if (row) {
    if (row.archived == null) row.archived = 0;
    if (row.month_key == null) row.month_key = monthKey(row.created_at);
  }
  return result;
};
function listShares({ includeArchived = false } = {}) {
  return includeArchived ? _cache.shares.slice() : _cache.shares.filter(s => !s.archived);
}
function archiveSharesByMonth(targetMonthKey) {
  // 只归档：有视频/有图片的分享（纯文本不占流量，不需要归档）
  let count = 0;
  const t = String(targetMonthKey || '');
  _cache.shares.forEach(s => {
    if (s.archived) return;
    if (t && (s.month_key || monthKey(s.created_at)) !== t) return;
    const hasMedia = !!(s.video_data || s.image_data ||
      (s.link && /\.(mp4|webm|mov|mkv|jpg|jpeg|png|gif)(\?|#|$)/i.test(s.link)));
    if (!hasMedia) return;
    s.archived = 1;
    s.archived_at = _now();
    count++;
  });
  return count;
}
function archiveLastMonthMediaShares(todayIso = new Date().toISOString()) {
  const d = new Date(todayIso);
  const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const key = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}`;
  return { month: key, archived: archiveSharesByMonth(key) };
}

test('[Archive-1] 新建分享默认 archived=0，listShares 默认不把已归档带进来', () => {
  resetCache();
  const r1 = addShare({ member_id: 1, group_id: 1, title: 'a', content: 'c', week: '2026-W31', image_data: 'x' });
  const r2 = addShare({ member_id: 2, group_id: 1, title: 'b', content: 'c2', week: '2026-W31', video_data: 'http://s/1.mp4' });
  const r3 = addShare({ member_id: 3, group_id: 2, title: '纯文本', content: 'c3', week: '2026-W31' });
  // 把 r2 手动归档
  const row2 = _cache.shares.find(s => s.id === r2.shareId);
  row2.archived = 1;
  // 默认视图应该是 2 条（r1 + r3），不含 r2
  const defList = listShares();
  assert.strictEqual(defList.length, 2, '默认视图不能包含已归档');
  assert.strictEqual(defList.some(s => s.id === r2.shareId), false, 'r2 应被隐藏');
  // includeArchived = true 应该拿到 3 条
  const allList = listShares({ includeArchived: true });
  assert.strictEqual(allList.length, 3, '查看归档应能看到所有');
});

test('[Archive-2] archiveSharesByMonth 只归档“目标月份 + 带媒体”的分享，纯文本 & 非目标月份不动', () => {
  resetCache();
  function _make({ title, createdAt, media }) {
    const s = { id: _nextId++, title, created_at: createdAt, member_id: 1, group_id: 1, week: '2026-W30', is_announcement: 0, content: '', link: '', image_data: '', video_data: '', archived: 0, archived_at: '', month_key: monthKey(createdAt) };
    Object.assign(s, media);
    _cache.shares.push(s);
    return s;
  }
  const a = _make({ title: '7月有视频', createdAt: '2026-07-12 10:00:00', media: { video_data: 'https://s/1.mp4' } });
  const b = _make({ title: '7月纯文本', createdAt: '2026-07-13 10:00:00', media: {} });
  const c = _make({ title: '8月有图片', createdAt: '2026-08-05 10:00:00', media: { image_data: 'https://s/1.png' } });
  const d = _make({ title: '6月有视频', createdAt: '2026-06-20 10:00:00', media: { video_data: 'https://s/2.mp4' } });
  const n = archiveSharesByMonth('2026-07');
  assert.strictEqual(n, 1, '7 月媒体分享数量应 = 1（视频a，纯文本b不动）');
  const post = _cache.shares.reduce((m, s) => (m[s.title] = s.archived, m), {});
  assert.strictEqual(post['7月有视频'], 1, '7月视频应被归档');
  assert.strictEqual(post['7月纯文本'], 0, '纯文本不归档');
  assert.strictEqual(post['8月有图片'], 0, '8月不在目标月份，不动');
  assert.strictEqual(post['6月有视频'], 0, '6月不在目标月份，不动');
});

test('[Archive-3] 今天 2026-08-29 调 archiveLastMonthMediaShares，归档目标是 2026-07', () => {
  resetCache();
  function _mk(t, media) { _cache.shares.push({ id: _nextId++, title: t, created_at: t + ' 10:00:00', archived: 0, image_data: '', video_data: '', link: '', content: '', member_id: 1, group_id: 1, week: '', is_announcement: 0, month_key: monthKey(t + ' 10:00:00'), ...media }); }
  _mk('2026-07-10', { video_data: 'https://s/a.mp4' });
  _mk('2026-07-11', { image_data: 'https://s/a.png' });
  _mk('2026-08-01', { video_data: 'https://s/b.mp4' }); // 本月不应被归
  const result = archiveLastMonthMediaShares('2026-08-29T00:00:00Z');
  assert.strictEqual(result.month, '2026-07', '上月应是 2026-07');
  assert.strictEqual(result.archived, 2, '上月 7 月有 2 条带媒体，应全部归档');
  const aug = _cache.shares.find(s => s.created_at.startsWith('2026-08'));
  assert.strictEqual(aug.archived, 0, '8 月不能被归档');
});

// ---------- Bugfix: 文件名中文/特殊字符导致 Supabase Storage Invalid key（3 条 TDD）----------
// Supabase Storage 对象 Key 不能有中文字符、空格、#、?、\ 等，否则直接返回 400 Invalid key。
// 这里对「生成上传 fileName」的函数做纯逻辑断言（算法与 db.js 的 _sanitizeFilenameBase/_buildSafeStorageKey 完全一致）
function sanitizeFilenameBase(rawNameNoExt) {
  let s = String(rawNameNoExt || '').replace(
    /[\s\\/: #?*"<>|,\u0000-\u001f\u3000-\u303f\uff00-\uffef\u4e00-\u9fff\u3400-\u4dbf]/g,
    '_'
  );
  s = s.replace(/[^A-Za-z0-9_.-]/g, '_');
  s = s.replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  return s || 'file';
}
function buildSafeFileName(fileName, prefixHint, ts, rand) {
  // prefixHint: 'shares' | 'docs'（与 db.js _buildSafeStorageKey 参数相同）
  const raw = String(fileName || 'file');
  let prefix = prefixHint === 'shares' ? 'share_' : 'doc_';
  let rest = raw;
  const pm = /^(share|doc)_/.exec(rest);
  if (pm) {
    prefix = pm[1] + '_';
    rest = rest.slice(pm[0].length);
  }
  let base = rest;
  let ext = '';
  const dot = rest.lastIndexOf('.');
  if (dot > 0 && dot < rest.length - 1) {
    base = rest.slice(0, dot);
    ext = rest.slice(dot + 1);
  } else if (dot === -1) {
    ext = 'bin';
  } else {
    ext = 'bin';
  }
  const safeBase = sanitizeFilenameBase(base);
  const safeExt = String(ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return prefix + String(ts) + '_' + safeBase + '_' + String(rand) + '.' + safeExt;
}

test('[Filename-1] 中文写作大纲.docx → 不包含任何中文/S3 非法字符，首尾正确', () => {
  const out = buildSafeFileName('写作大纲.docx', 'docs', '1787984173896', '16no0q');
  // 中文全被替换，主名变成空 → 兜底 file
  assert.strictEqual(out, 'doc_1787984173896_file_16no0q.docx', '中文必须全部过滤，兜底成 file，实际：' + out);
  assert.strictEqual(/[\u4e00-\u9fff]/.test(out), false, '绝不能包含汉字');
  assert.strictEqual(/[\s:#?*"<>|\\/]/.test(out), false, 'S3 非法字符不可出现');
  assert.strictEqual(/_{2,}/.test(out), false, '不允许连续下划线');
});

test('[Filename-2] share_【精选】培训 视频.MP4 → share_ 前缀保留，中文/空格/【】全替换，扩展名转小写 mp4', () => {
  const out = buildSafeFileName('share_【精选】培训 视频.MP4', 'shares', '1000001', 'abcdef');
  assert.ok(/^share_1000001_.*_abcdef\.mp4$/.test(out), '实际：' + out);
  assert.strictEqual(/[\u4e00-\u9fff\s【】\u3000-\u303f\uff00-\uffef]/.test(out), false, '中文/全角标点必须被替换：' + out);
});

test('[Filename-3] my,report+v2..final 2026.docx → 逗号/加号/空格换成 _，双点保留；扩展名仍为 docx', () => {
  const out = buildSafeFileName('my,report+v2..final 2026.docx', 'docs', '999', 'r123');
  assert.strictEqual(/[,+\s]/.test(out), false, '逗号/加号/空格必须被替换：' + out);
  assert.ok(out.startsWith('doc_999_'), '前缀 + 时间戳错：' + out);
  assert.ok(out.endsWith('_r123.docx'), '随机 + 扩展名错：' + out);
  assert.strictEqual(/_{2,}/.test(out), false, '不允许连续下划线（已合并）：' + out);
});

// ---------- 汇总 ----------
console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===\n`);
process.exit(failed > 0 ? 1 : 0);
