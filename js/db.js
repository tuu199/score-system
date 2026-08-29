/* ============================================================
 * db.js - 学习积分系统 数据访问层（基于 Supabase 云数据库）
 * 5 类积分：出勤打卡 / 单词背诵 / 群分享 / 期末考试 / 单科拔尖
 * 架构：内存缓存（同步读）+ Supabase（异步写，实时同步）
 * ============================================================ */
(function (global) {
  'use strict';

  // Supabase 凭证（内嵌在代码中，和之前 GitHub Token 安全级别相同）
  const SUPABASE_URL = 'https://uxtgarnebcwcwtupkkbi.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ONpQfqU1-ed2ryuTAq3cjg_s7b5SWcW';

  let supabase = null;
  let _tempId = 0;

  /** H-4 + 原子一致性：负 id 的 pending 操作队列（更新/删除），等真实 id 回写后再发 Supabase */
  const _pendingOps = {}; // { [tempId]: Array<{op:'update'|'delete', updates?}> }
  function _enqueuePending(tempId, op) {
    if (tempId >= 0) return false;
    if (!_pendingOps[tempId]) _pendingOps[tempId] = [];
    _pendingOps[tempId].push(op);
    return true;
  }
  function _flushPending(tempId, realItem, realId, table) {
    const q = _pendingOps[tempId];
    if (!q || !q.length) { delete _pendingOps[tempId]; return; }
    q.forEach(op => {
      try {
        if (op.op === 'delete') {
          supabase.from(table).delete().eq('id', realId).then(({ error }) => {
            if (error) console.error(`Supabase pending delete ${table}:${realId}:`, error.message);
          });
          // 此时内存里若仍存在 realItem，就清掉（用户在负 id 阶段发的删除）
          const idx = _cache[table].findIndex(r => r.id === realId);
          if (idx >= 0) _cache[table].splice(idx, 1);
        } else if (op.op === 'update') {
          Object.assign(realItem, op.updates);
          supabase.from(table).update(op.updates).eq('id', realId).then(({ error }) => {
            if (error) console.error(`Supabase pending update ${table}:${realId}:`, error.message);
          });
        }
      } catch (err) { console.error(`Pending flush ${table}:${realId}`, err); }
    });
    delete _pendingOps[tempId];
  }

  /** M-1：addShare 原子锁（per member_id+week），避免并发突破 WEEKLY_SHARE_CAP */
  const _shareLocks = {}; // { "member_id:week": Promise }
  function _acquireShareLock(member_id, week) {
    const key = `${member_id || '_'}:${week || '_'}`;
    const prev = _shareLocks[key];
    let release;
    const next = new Promise(resolve => (release = resolve));
    _shareLocks[key] = next;
    return {
      wait: prev || Promise.resolve(),
      release: () => {
        release();
        // 延迟清理，避免和下一个获得锁的任务竞态
        setTimeout(() => { if (_shareLocks[key] === next) delete _shareLocks[key]; }, 50);
      }
    };
  }

  /** 内存缓存（所有读操作从这里同步返回） */
  const _cache = {
    groups: [],
    members: [],
    score_records: [],
    shares: [],
    docs: [],
    settings: {},
  };

  /** 积分类别定义 */
  const CATEGORIES = {
    1: { name: '周日到校出勤打卡', icon: '📍', short: '出勤', color: '#3b82f6',
         desc: '每周日15:00按时到校打卡，发定位或拍校园照片。个人单次5分；小组全员准时到校额外奖励30分。' },
    2: { name: '每周单词背诵打卡', icon: '📚', short: '单词', color: '#10b981',
         desc: '每周日12:00前组长汇总扇贝单词累计打卡总量。按小组总量排名，前三名依次奖励12/8/5分。' },
    3: { name: '周末及假期群分享', icon: '💬', short: '分享', color: '#f59e0b',
         desc: '分享学习、能力增长、兴趣领域等内容，每人每次积1分。周日12:00前组长汇总。' },
    4: { name: '期末考试小组学业积分', icon: '🎓', short: '期末', color: '#8b5cf6',
         desc: '单科均分第一奖小组25分；总成绩均分排名1-6名依次80/65/55/40/20/10分。' },
    5: { name: '个人单科拔尖奖励', icon: '⭐', short: '拔尖', color: '#ef4444',
         desc: '获评年级单科状元，个人积20分，小组积10分（不重复计算）。' },
  };

  /** ========== 内部工具 ========== */
  function _nextTempId() { return --_tempId; }
  function _now() { return new Date().toISOString(); }

  /** 从 Supabase 加载所有数据到内存缓存 */
  async function _loadAllFromSupabase() {
    const [g, m, r, s, st, d] = await Promise.all([
      supabase.from('groups').select('*'),
      supabase.from('members').select('*'),
      supabase.from('score_records').select('*'),
      supabase.from('shares').select('*'),
      supabase.from('settings').select('*'),
      supabase.from('docs').select('*'),
    ]);
    if (g.error) throw new Error('加载小组失败: ' + g.error.message);
    if (s.error) console.error('[DB] shares 查询错误:', s.error.message);
    if (d.error) console.error('[DB] docs 查询错误:', d.error.message);
    _cache.groups = (g.data || []).sort((a, b) => a.name.localeCompare(b.name));
    _cache.members = (m.data || []).sort((a, b) => a.name.localeCompare(b.name));
    _cache.score_records = (r.data || []).sort((a, b) => {
      if (a.created_at < b.created_at) return 1;
      if (a.created_at > b.created_at) return -1;
      return b.id - a.id;
    });
    _cache.shares = (s.data || []).sort((a, b) => {
      if (a.is_announcement && !b.is_announcement) return -1;
      if (!a.is_announcement && b.is_announcement) return 1;
      if (a.created_at < b.created_at) return 1;
      if (a.created_at > b.created_at) return -1;
      return b.id - a.id;
    });
    _cache.docs = (d.data || []).sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      if (a.created_at < b.created_at) return 1;
      if (a.created_at > b.created_at) return -1;
      return b.id - a.id;
    });
    _cache.settings = {};
    (st.data || []).forEach(row => { _cache.settings[row.key] = row.value; });
  }

  /** 异步插入到 Supabase → 返回 Promise<item>（resolve 时 item.id 已是真实 id，内存已更新）
   *  H-4 修复：调用方能 await 拿到真实 id 再做后续修改/删除，负 id 阶段的更新/删除进入 pending 队列 */
  function _insert(table, row) {
    const tempId = _nextTempId();
    const item = { ...row, id: tempId };
    _cache[table].push(item);
    // 返回一个 Promise，等 Supabase 给出真实 id 才 resolve
    return supabase.from(table).insert(row).select().then(({ data, error }) => {
      if (error) {
        console.error(`Supabase insert ${table}:`, error.message);
        Utils.toast('同步到云端失败，请检查网络', 'error');
        // 云端失败：内存项仍保留（负 tempId），后续 reload 能纠正
        return item;
      }
      if (data && data[0]) {
        const realId = data[0].id;
        item.id = realId;
        // H-4：处理该 tempId 上排队的 pending ops
        _flushPending(tempId, item, realId, table);
      }
      return item;
    }).catch(err => {
      console.error(`Supabase insert ${table} failed:`, err);
      Utils.toast('同步到云端失败：' + err.message, 'error');
      return item;
    });
  }

  /** 异步更新 Supabase
   *  H-4 修复：若 id<0，仍立刻应用到内存对象，但把操作推入 pending 队列，等真实 id 回来后再同步 */
  function _update(table, id, updates) {
    const item = _cache[table].find(r => r.id === id);
    if (item) Object.assign(item, updates);
    if (id > 0) {
      supabase.from(table).update(updates).eq('id', id).then(({ error }) => {
        if (error) console.error(`Supabase update ${table}:`, error.message);
      });
    } else if (id < 0) {
      // H-4：负 id 入 pending 队列
      _enqueuePending(id, { op: 'update', updates });
    }
  }

  /** 异步删除 Supabase
   *  H-4 修复：id<0 时立刻清内存 + 入 pending 队列，真实 id 回写后立即发 Supabase.delete */
  function _delete(table, id) {
    const idx = _cache[table].findIndex(r => r.id === id);
    if (idx >= 0) _cache[table].splice(idx, 1);
    if (id > 0) {
      supabase.from(table).delete().eq('id', id).then(({ error }) => {
        if (error) console.error(`Supabase delete ${table}:`, error.message);
      });
    } else if (id < 0) {
      // H-4：负 id 入 pending（删除操作）
      _enqueuePending(id, { op: 'delete' });
    }
  }

  /** ========== 初始化 ========== */
  async function init() {
    if (supabase) return true;
    if (typeof global.supabase === 'undefined' || !global.supabase.createClient) {
      throw new Error('Supabase SDK 未加载，请检查网络连接');
    }
    supabase = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    await _loadAllFromSupabase();
    // 首次使用：创建默认小组
    if (_cache.groups.length === 0) {
      await seedIfEmpty();
    }
    return true;
  }

  /** 重新从 Supabase 加载所有数据（🔄 按钮调用） */
  async function reload() {
    if (!supabase) throw new Error('数据库未初始化');
    await _loadAllFromSupabase();
    return true;
  }

  /** ========== 小组 CRUD ========== */
  function listGroups() {
    return _cache.groups.map(g => {
      const members = _cache.members.filter(m => m.group_id === g.id);
      const records = _cache.score_records.filter(r => r.group_id === g.id);
      const group_pts = records.reduce((s, r) => s + (Number(r.group_points) || 0), 0);
      const member_indiv_pts = records.filter(r => r.member_id !== null).reduce((s, r) => s + (Number(r.individual_points) || 0), 0);
      const group_indiv_pts = records.filter(r => r.member_id === null).reduce((s, r) => s + (Number(r.individual_points) || 0), 0);
      return {
        ...g,
        member_count: members.length,
        group_pts: Utils.round(group_pts),
        member_indiv_pts: Utils.round(member_indiv_pts),
        group_indiv_pts: Utils.round(group_indiv_pts),
      };
    });
  }
  function getGroup(id) {
    return _cache.groups.find(g => g.id === id) || null;
  }
  function addGroup({ name, leader_name }) {
    const row = { name, leader_name, created_at: _now() };
    return _insert('groups', row); // Promise<item>
  }
  function updateGroup(id, { name, leader_name }) {
    _update('groups', id, { name, leader_name });
    return Promise.resolve(getGroup(id));
  }
  function deleteGroup(id) {
    // 从内存中删除小组及相关数据
    _cache.groups = _cache.groups.filter(g => g.id !== id);
    _cache.members = _cache.members.filter(m => m.group_id !== id);
    _cache.score_records = _cache.score_records.filter(r => r.group_id !== id);
    _cache.shares = _cache.shares.filter(s => s.group_id !== id);
    // 异步从 Supabase 删除（CASCADE 会自动删除相关数据）
    if (id > 0) {
      supabase.from('groups').delete().eq('id', id).then(({ error }) => {
        if (error) console.error('Supabase delete group:', error.message);
      });
    } else if (id < 0) {
      _enqueuePending(id, { op: 'delete' });
    }
    return Promise.resolve(true);
  }

  /** ========== 组员 CRUD ========== */
  function listMembers(groupId) {
    if (groupId) {
      return _cache.members.filter(m => m.group_id === groupId).sort((a, b) => a.name.localeCompare(b.name));
    }
    return _cache.members.slice().sort((a, b) => {
      if (a.group_id !== b.group_id) return a.group_id - b.group_id;
      return a.name.localeCompare(b.name);
    });
  }
  function listMembersWithGroup() {
    return _cache.members.map(m => {
      const g = _cache.groups.find(g => g.id === m.group_id);
      return { ...m, group_name: g?.name || '', group_leader: g?.leader_name || '' };
    }).sort((a, b) => {
      if (a.group_name !== b.group_name) return a.group_name.localeCompare(b.group_name);
      return a.name.localeCompare(b.name);
    });
  }
  function getMember(id) {
    return _cache.members.find(m => m.id === id) || null;
  }
  function addMember({ name, group_id }) {
    const row = { name, group_id, created_at: _now() };
    return _insert('members', row); // Promise<item>
  }
  function updateMember(id, { name, group_id }) {
    _update('members', id, { name, group_id });
    return Promise.resolve(getMember(id));
  }
  function deleteMember(id) {
    // 从内存中删除成员及相关数据
    _cache.members = _cache.members.filter(m => m.id !== id);
    _cache.score_records = _cache.score_records.filter(r => r.member_id !== id);
    _cache.shares = _cache.shares.filter(s => s.member_id !== id);
    if (id > 0) {
      supabase.from('members').delete().eq('id', id).then(({ error }) => {
        if (error) console.error('Supabase delete member:', error.message);
      });
    } else if (id < 0) {
      _enqueuePending(id, { op: 'delete' });
    }
    return Promise.resolve(true);
  }

  /** ========== 积分记录 CRUD ========== */
  function listRecords({ groupId = 0, memberId = 0, category = 0, week = '' } = {}) {
    let records = _cache.score_records.slice();
    if (groupId) records = records.filter(r => r.group_id === groupId);
    if (memberId) records = records.filter(r => r.member_id === memberId);
    if (category) records = records.filter(r => r.category === category);
    if (week) records = records.filter(r => r.week === week);
    return records.map(r => {
      const g = _cache.groups.find(g => g.id === r.group_id);
      const m = r.member_id ? _cache.members.find(m => m.id === r.member_id) : null;
      return {
        ...r,
        group_name: g?.name || '',
        group_leader: g?.leader_name || '',
        member_name: m?.name || '',
      };
    });
  }
  function addRecord({ member_id, group_id, category, description, individual_points, group_points, week, recorded_by }) {
    // ========== H-5：合法性校验 ==========
    const indiv = Number(individual_points) || 0;
    const gp = Number(group_points) || 0;
    // ① 数值范围限制
    if (indiv < -99 || indiv > 500 || gp < -99 || gp > 500) {
      const e = new Error('积分值超出允许范围 [-99, 500]'); e.code = 'ERR_RANGE'; throw e;
    }
    // ② 不能两者都 0
    if (indiv === 0 && gp === 0) {
      const e = new Error('个人积分与小组积分不能都为 0'); e.code = 'ERR_BOTH_ZERO'; throw e;
    }
    // ③ 校验归属：指定 member_id 时必须属于该 group_id
    if (member_id != null && member_id !== 0) {
      const m = _cache.members.find(x => x.id === member_id);
      if (!m) { const e = new Error('指定的成员不存在'); e.code = 'ERR_MEMBER_NOT_FOUND'; throw e; }
      if (m.group_id !== group_id) {
        const e = new Error('该成员不属于所选小组（跨组录入被禁止）'); e.code = 'ERR_MEMBER_NOT_IN_GROUP'; throw e;
      }
    }
    // ④ 禁止手动录入 category=3（分享类）积分；只能由分享板自动生成（recorded_by==='分享板自动'）
    if (category === 3 && recorded_by !== '分享板自动') {
      const e = new Error('分享类(category=3)积分只能通过「分享板」发布自动产生，请在分享板发布内容'); e.code = 'ERR_SHARE_USE_SHAREBOARD'; throw e;
    }
    // ⑤ category 和对应积分组合的合理性（仅防明显错填）
    if (category < 1 || category > 5) {
      const e = new Error('无效的积分类别'); e.code = 'ERR_CATEGORY'; throw e;
    }

    const row = {
      member_id: member_id || null,
      group_id,
      category,
      description: description || '',
      individual_points: indiv,
      group_points: gp,
      week: week || '',
      created_at: _now(),
      recorded_by: recorded_by || '管理员',
    };
    // 返回 Promise，真实 id 落定后才 resolve
    return _insert('score_records', row).then(item => item.id);
  }
  function updateRecord(id, { member_id, group_id, category, description, individual_points, group_points, week }) {
    const indiv = Number(individual_points) || 0;
    const gp = Number(group_points) || 0;
    // H-5：update 也做基础范围校验
    if (indiv < -99 || indiv > 500 || gp < -99 || gp > 500) {
      const e = new Error('积分值超出允许范围 [-99, 500]'); e.code = 'ERR_RANGE'; throw e;
    }
    if (member_id != null && member_id !== 0) {
      const m = _cache.members.find(x => x.id === member_id);
      if (m && group_id != null && m.group_id !== group_id) {
        const e = new Error('该成员不属于所选小组（跨组录入被禁止）'); e.code = 'ERR_MEMBER_NOT_IN_GROUP'; throw e;
      }
    }
    _update('score_records', id, {
      member_id: member_id || null,
      group_id,
      category,
      description: description || '',
      individual_points: indiv,
      group_points: gp,
      week: week || '',
    });
    return Promise.resolve(true);
  }
  function deleteRecord(id) {
    _delete('score_records', id);
    return Promise.resolve(true);
  }

  /** 清零所有积分记录和分享（保留小组、组员、设置） */
  function clearAllRecords() {
    _cache.score_records = [];
    _cache.shares = [];
    // 异步清空 Supabase
    supabase.from('score_records').delete().neq('id', 0).then(({ error }) => {
      if (error) console.error('Supabase clear records:', error.message);
    });
    supabase.from('shares').delete().neq('id', 0).then(({ error }) => {
      if (error) console.error('Supabase clear shares:', error.message);
    });
    return true;
  }

  /** ========== 搜索 ========== */
  function searchRecords({ keyword = '', groupId = 0, category = 0, week = '' } = {}) {
    let records = _cache.score_records.slice();
    if (keyword) {
      const kw = keyword.toLowerCase();
      records = records.filter(r => {
        const g = _cache.groups.find(g => g.id === r.group_id);
        const m = r.member_id ? _cache.members.find(m => m.id === r.member_id) : null;
        const name = (m?.name || '').toLowerCase();
        const gname = (g?.name || '').toLowerCase();
        const desc = (r.description || '').toLowerCase();
        return name.includes(kw) || gname.includes(kw) || desc.includes(kw);
      });
    }
    if (groupId) records = records.filter(r => r.group_id === groupId);
    if (category) records = records.filter(r => r.category === category);
    if (week) records = records.filter(r => r.week === week);
    return records.map(r => {
      const g = _cache.groups.find(g => g.id === r.group_id);
      const m = r.member_id ? _cache.members.find(m => m.id === r.member_id) : null;
      return {
        ...r,
        group_name: g?.name || '',
        group_leader: g?.leader_name || '',
        member_name: m?.name || '',
      };
    }).sort((a, b) => {
      // L-2：空 week 记录统一排到最后，正常 week 按周次倒序 → 再按 created_at/id 倒序
      const aEmpty = !a.week;
      const bEmpty = !b.week;
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (a.week !== b.week) return (b.week || '').localeCompare(a.week || '');
      if (a.created_at < b.created_at) return 1;
      if (a.created_at > b.created_at) return -1;
      // id 兜底排序（同毫秒下 id 越大越新）
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }

  /** ========== 分享板 CRUD ========== */
  function listShares({ groupId = 0, week = '' } = {}) {
    let shares = _cache.shares.slice();
    if (groupId) shares = shares.filter(s => s.group_id === groupId);
    if (week) shares = shares.filter(s => s.week === week);
    return shares.map(s => {
      const g = _cache.groups.find(g => g.id === s.group_id);
      const m = s.member_id ? _cache.members.find(m => m.id === s.member_id) : null;
      return {
        ...s,
        group_name: g?.name || '',
        member_name: m?.name || '',
      };
    });
  }
  const WEEKLY_SHARE_CAP = 4; // 分享加分每周上限4分

  /** 计算该成员在指定周已经通过分享获得的积分 */
  function getWeeklySharePoints(member_id, week) {
    return _cache.score_records.filter(r =>
      r.member_id === member_id && r.category === 3 && r.week === week
    ).reduce((s, r) => s + (Number(r.individual_points) || 0), 0);
  }

  /**
   * 新增分享（M-1：获取 per-member+week 锁后再计算上限，避免并发突破 WEEKLY_SHARE_CAP=4）
   * 返回 Promise<{shareId, pointsAwarded, reachedCap, weeklyCap}>，resolve 时分享和自动积分的真实 id 都已确定
   */
  function addShare({ member_id, group_id, title, content, link, image_data, week, is_announcement }) {
    // M-1 原子锁（per member_id + week）
    const lock = _acquireShareLock(is_announcement ? null : member_id, week);
    // 先等前一个锁释放完成，再做检查 + 插入
    return lock.wait.then(() => {
      const now = _now();
      const sharePromise = _insert('shares', {
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
      let pointsAwarded = 0;
      let reachedCap = false;
      let scorePromise = Promise.resolve(null);

      // 普通分享且有成员关联时自动加分，每周上限 WEEKLY_SHARE_CAP（匿名和公告不加积分）
      if (!is_announcement && member_id) {
        // 注意：因为在 lock 内，不会出现「同 member 同周并发插入的同时读」问题
        const currentWeekPts = getWeeklySharePoints(member_id, week);
        if (currentWeekPts < WEEKLY_SHARE_CAP) {
          scorePromise = _insert('score_records', {
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
          pointsAwarded = 1;
          reachedCap = currentWeekPts + 1 >= WEEKLY_SHARE_CAP;
        } else {
          reachedCap = true;
        }
      }

      // 等 shares + score_records 真实 id 都 resolve 再释放锁，保证后续任务读到的已在缓存内
      return Promise.all([sharePromise, scorePromise]).then(([share, score]) => {
        return {
          shareId: share.id,
          scoreId: score ? score.id : null,
          pointsAwarded,
          reachedCap,
          weeklyCap: WEEKLY_SHARE_CAP,
        };
      });
    }).then(result => {
      lock.release();
      return result;
    }, err => {
      lock.release();
      throw err;
    });
  }

  /**
   * H-1：删除分享 → 同步删除分享板自动生成的 category=3 积分记录（严格通过 recorded_by='分享板自动' 匹配，不误删手动录入的分享类嘉奖）
   */
  function deleteShare(id) {
    const share = _cache.shares.find(s => s.id === id);
    // 先记下来，因为删除 share 后 find 会找不到
    const match = share ? {
      member_id: share.member_id,
      group_id: share.group_id,
      week: share.week,
      descPrefix: '群分享：' + (share.title || (share.content || '').slice(0, 20)),
      created_at: share.created_at,
    } : null;
    _delete('shares', id);

    if (match && match.member_id && !share.is_announcement) {
      // H-1 关键：只删 recorded_by === '分享板自动' 的，不误伤群主手动嘉奖的额外分享积分
      const prefixSlice = match.descPrefix.slice(0, 10);
      const toDelete = _cache.score_records.filter(r =>
        r.category === 3 &&
        r.member_id === match.member_id &&
        r.week === match.week &&
        r.recorded_by === '分享板自动' &&
        (r.description || '').startsWith(prefixSlice)
      );
      toDelete.forEach(r => _delete('score_records', r.id));
    }
    // M-2：如果 image_data 指向本 Supabase Storage 的 shares/docs bucket，异步清掉原文件
    if (share && share.image_data && typeof share.image_data === 'string' && supabase && supabase.storage) {
      try {
        const mDoc = String(share.image_data).match(/\/storage\\/v1\\/object\\/public\\/(docs|shares)\\/([^?#]+)/);
        if (mDoc && mDoc[1] && mDoc[2]) {
          const bucket = mDoc[1];
          const fileName = decodeURIComponent(mDoc[2]);
          supabase.storage.from(bucket).remove([fileName]).catch(err =>
            console.warn('[DB] M-2 storage 清理失败（share / ' + bucket + '）：', err.message || err)
          );
        }
      } catch (e) { /* 清理失败不阻塞主流程 */ }
    }
    return Promise.resolve(true);
  }

  /** ========== 文档 CRUD ========== */
  function listDocs({ category = '' } = {}) {
    let docs = _cache.docs.slice();
    if (category) docs = docs.filter(d => d.category === category);
    return docs;
  }
  function addDoc({ title, content, link, category, is_pinned }) {
    const now = _now();
    return _insert('docs', {
      title: title || '',
      content: content || '',
      link: link || '',
      category: category || '学习资料',
      is_pinned: is_pinned ? 1 : 0,
      created_at: now,
    }).then(item => item.id);
  }
  function deleteDoc(id) {
    const doc = _cache.docs.find(d => d.id === id);
    _delete('docs', id);
    // M-2：如果文档里的 link 指向本 Supabase Storage 的 docs bucket，也异步删掉 storage 文件
    if (doc && doc.link && supabase && supabase.storage) {
      try {
        const urlStr = String(doc.link);
        const m = urlStr.match(/\/storage\\/v1\\/object\\/public\\/docs\\/([^?#]+)/);
        if (m && m[1]) {
          const fileName = decodeURIComponent(m[1]);
          supabase.storage.from('docs').remove([fileName]).catch(err =>
            console.warn('[DB] M-2 storage 清理失败（docs）：', err.message || err)
          );
        }
      } catch (e) { /* 清理失败不阻塞 */ }
    }
    return Promise.resolve(true);
  }

  /**
   * 上传文件到 Supabase Storage，返回公开 URL 字符串。
   *  用法 A（File/Blob）  ：uploadFile(file) → Promise<string>
   *  用法 B（base64 补传）：uploadFile({name, type?}, dataUrl) → Promise<string>
   *
   * bucket 路由：
   *  - 文件名以 share_ 开头 → 'shares' bucket
   *  - 其它                 → 'docs' bucket（原文档默认）
   */
  async function uploadFile(file, base64DataUrl) {
    if (!file || !file.name) throw new Error('缺少文件名，无法上传');
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const bucket = /^share_/.test(file.name) ? 'shares' : 'docs';
    const random = Math.random().toString(36).slice(2, 8);
    const fileName = file.name.replace(/^((share|doc)_)?/, (_m, p) => (p || 'doc_') + Date.now() + '_')
      .replace(/\.[^.]*$/, '') + '_' + random + '.' + ext;

    let uploadPayload;
    if (base64DataUrl && typeof base64DataUrl === 'string' && base64DataUrl.startsWith('data:')) {
      // 解码 data:image/xxx;base64,xxxx → Uint8Array 作为 Blob 上传
      const meta = base64DataUrl.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.*)$/s);
      if (!meta) throw new Error('图片 base64 格式非法');
      const mime = meta[1];
      const bin = atob(meta[2]);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      uploadPayload = new Blob([u8.buffer], { type: mime });
    } else if (typeof Blob !== 'undefined' && file instanceof Blob) {
      uploadPayload = file;
    } else {
      throw new Error('uploadFile 需要 Blob/File 或第二个参数传入 dataURL');
    }
    if (!supabase || !supabase.storage) throw new Error('当前环境没有可用的 Storage API');
    const { error } = await supabase.storage.from(bucket).upload(fileName, uploadPayload, { upsert: false });
    if (error) throw new Error('上传失败（' + bucket + '）：' + error.message);
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return (urlData && urlData.publicUrl) ? urlData.publicUrl : null;
  }

  /** ========== 统计 ========== */
  function computeStatistics() {
    const records = _cache.score_records;
    const overall = {
      total_records: records.length,
      total_individual: Utils.round(records.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
      total_group: Utils.round(records.reduce((s, r) => s + (Number(r.group_points) || 0), 0)),
      total_all: Utils.round(records.reduce((s, r) => s + (Number(r.individual_points) || 0) + (Number(r.group_points) || 0), 0)),
    };
    const byGroup = _cache.groups.map(g => {
      const gr = records.filter(r => r.group_id === g.id);
      return {
        id: g.id, name: g.name, leader_name: g.leader_name,
        record_count: gr.length,
        indiv_pts: Utils.round(gr.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
        group_pts: Utils.round(gr.reduce((s, r) => s + (Number(r.group_points) || 0), 0)),
        total_pts: Utils.round(gr.reduce((s, r) => s + (Number(r.individual_points) || 0) + (Number(r.group_points) || 0), 0)),
      };
    }).sort((a, b) => b.total_pts - a.total_pts);
    const byCategory = [1, 2, 3, 4, 5].map(cat => {
      const cr = records.filter(r => r.category === cat);
      return {
        category: cat,
        record_count: cr.length,
        indiv_pts: Utils.round(cr.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
        group_pts: Utils.round(cr.reduce((s, r) => s + (Number(r.group_points) || 0), 0)),
        total_pts: Utils.round(cr.reduce((s, r) => s + (Number(r.individual_points) || 0) + (Number(r.group_points) || 0), 0)),
      };
    });
    return { overall, by_group: byGroup, by_category: byCategory };
  }

  /** ========== 排名 ========== */
  function getGroupRanking() {
    const sorted = _cache.groups.map(g => {
      const members = _cache.members.filter(m => m.group_id === g.id);
      const records = _cache.score_records.filter(r => r.group_id === g.id);
      const group_pts = Utils.round(records.reduce((s, r) => s + (Number(r.group_points) || 0), 0));
      const indiv_pts = Utils.round(records.reduce((s, r) => s + (Number(r.individual_points) || 0), 0));
      return {
        id: g.id, name: g.name, leader_name: g.leader_name,
        member_count: members.length,
        group_pts, indiv_pts,
        total_pts: Utils.round(group_pts + indiv_pts),
      };
    }).sort((a, b) => b.total_pts - a.total_pts);
    let lastPts = null, lastRank = 0;
    return sorted.map((r, i) => {
      if (r.total_pts !== lastPts) { lastRank = i + 1; lastPts = r.total_pts; }
      return { ...r, rank: lastRank };
    });
  }

  function getIndividualRanking() {
    const rows = _cache.members.map(m => {
      const g = _cache.groups.find(g => g.id === m.group_id);
      const records = _cache.score_records.filter(r => r.member_id === m.id);
      return {
        id: m.id, name: m.name, group_id: m.group_id,
        group_name: g?.name || '',
        group_leader: g?.leader_name || '',
        indiv_pts: Utils.round(records.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
        record_count: records.length,
      };
    }).sort((a, b) => b.indiv_pts - a.indiv_pts);
    let lastPts = null, lastRank = 0;
    return rows.map((r, i) => {
      if (r.indiv_pts !== lastPts) { lastRank = i + 1; lastPts = r.indiv_pts; }
      return { ...r, rank: lastRank };
    });
  }

  /** 单个小组详细统计（成员排名 / 各类别构成 / 周积分趋势），用于可视化 */
  function getGroupStatistics(group_id) {
    const group = _cache.groups.find(g => g.id === group_id);
    if (!group) return null;
    const members = _cache.members.filter(m => m.group_id === group_id);
    const records = _cache.score_records.filter(r => r.group_id === group_id);

    // 成员个人排名
    const memberRanking = members.map(m => {
      const mr = records.filter(r => r.member_id === m.id);
      return {
        id: m.id, name: m.name,
        indiv_pts: Utils.round(mr.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
        record_count: mr.length,
      };
    }).sort((a, b) => b.indiv_pts - a.indiv_pts);

    // 各类别积分构成（过滤掉没有数据的类别）
    const byCategory = [1, 2, 3, 4, 5].map(cat => {
      const cr = records.filter(r => r.category === cat);
      const c = CATEGORIES[cat] || { icon: '📝', short: '其他', color: '#6b7280' };
      return {
        category: cat,
        label: c.icon + ' ' + c.short,
        color: c.color,
        indiv_pts: Utils.round(cr.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
        group_pts: Utils.round(cr.reduce((s, r) => s + (Number(r.group_points) || 0), 0)),
        total_pts: Utils.round(cr.reduce((s, r) => s + (Number(r.individual_points) || 0) + (Number(r.group_points) || 0), 0)),
      };
    }).filter(c => c.total_pts > 0);

    // 各周积分趋势
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
      indiv_pts: Utils.round(records.reduce((s, r) => s + (Number(r.individual_points) || 0), 0)),
      group_pts: Utils.round(records.reduce((s, r) => s + (Number(r.group_points) || 0), 0)),
      total_pts: Utils.round(records.reduce((s, r) => s + (Number(r.individual_points) || 0) + (Number(r.group_points) || 0), 0)),
      member_ranking: memberRanking,
      by_category: byCategory,
      week_trend: weekTrend,
    };
  }

  /** ========== 设置（密码管理） ========== */
  function getSetting(key, defaultVal = '') {
    return _cache.settings[key] !== undefined ? _cache.settings[key] : defaultVal;
  }
  function setSetting(key, value) {
    _cache.settings[key] = value;
    // upsert 到 Supabase
    supabase.from('settings').upsert({ key, value }).then(({ error }) => {
      if (error) console.error('Supabase setSetting:', error.message);
    });
    return true;
  }
  function getPassword() {
    const v = getSetting('admin_password', '');
    if (!v) return 'admin123';
    try { return atob(v); } catch { return 'admin123'; }
  }
  function setPassword(newPwd) {
    return setSetting('admin_password', btoa(newPwd));
  }
  function checkPassword(pwd) {
    return pwd === getPassword();
  }

  /** ========== 导入导出 ========== */
  function exportJSON() {
    return {
      _meta: { app: 'score-system', version: 1, exported_at: _now() },
      groups: _cache.groups.map(g => ({ id: g.id, name: g.name, leader_name: g.leader_name, created_at: g.created_at })),
      members: _cache.members.map(m => ({ id: m.id, name: m.name, group_id: m.group_id, created_at: m.created_at })),
      score_records: _cache.score_records.map(r => ({
        id: r.id, member_id: r.member_id, group_id: r.group_id, category: r.category,
        description: r.description, individual_points: r.individual_points,
        group_points: r.group_points, week: r.week, created_at: r.created_at, recorded_by: r.recorded_by,
      })),
      shares: _cache.shares.map(s => ({
        id: s.id, member_id: s.member_id, group_id: s.group_id, title: s.title,
        content: s.content, link: s.link, image_data: s.image_data, week: s.week,
        created_at: s.created_at, is_announcement: s.is_announcement,
      })),
      settings: Object.entries(_cache.settings).map(([key, value]) => ({ key, value })),
    };
  }

  /** 从 JSON 导入（覆盖当前数据），异步写入 Supabase */
  async function importJSON(data) {
    if (!data || !Array.isArray(data.groups)) throw new Error('JSON 数据格式无效');
    // 清空 Supabase（按依赖顺序删除）
    await supabase.from('score_records').delete().neq('id', 0);
    await supabase.from('shares').delete().neq('id', 0);
    await supabase.from('members').delete().neq('id', 0);
    await supabase.from('groups').delete().neq('id', 0);
    await supabase.from('settings').delete().neq('key', '');
    // 批量插入
    if (data.groups?.length) await supabase.from('groups').insert(data.groups.map(({ id, ...g }) => g));
    if (data.members?.length) await supabase.from('members').insert(data.members.map(({ id, ...m }) => m));
    if (data.score_records?.length) {
      const records = data.score_records.map(({ id, ...r }) => r);
      // 分批插入（Supabase 限制每批最多 1000 行）
      for (let i = 0; i < records.length; i += 500) {
        await supabase.from('score_records').insert(records.slice(i, i + 500));
      }
    }
    if (data.shares?.length) await supabase.from('shares').insert(data.shares.map(({ id, ...s }) => s));
    if (data.settings?.length) await supabase.from('settings').insert(data.settings);
    // 重新加载到内存
    await _loadAllFromSupabase();
    return true;
  }

  /** ========== 周次工具（L-1 跨年修复版）========== */
  /**
   * L-1 严格 ISO 周：返回 `${Year}-W${NN}`。
   * 关键修复：week 对应的是「ISO 周四所在年份」，不是 d.getFullYear()。
   *   例：2024-12-31 (周二) 应属于 2025-W01，不是 2024-W01
   */
  function _isoWeek(d) {
    // 用 UTC 化日期避免本地时区差异（中国 UTC+8 不会跨年差1天）
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // ISO 周：周一=1, 周日=7
    const dayNum = date.getUTCDay() || 7;
    // 把 date 调到本周四（ISO 周的锚点：本年 1/4 所在的周是 W01）
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    // 注意：周对应的 YEAR 是「锚点周四所在的 UTC 年份」不是原日期的年份
    const weekYear = date.getUTCFullYear();
    const yearStart = new Date(Date.UTC(weekYear, 0, 1));
    const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return `${weekYear}-W${String(weekNo).padStart(2, '0')}`;
  }
  function getCurrentWeek() {
    return _isoWeek(new Date());
  }
  /**
   * L-1 getRecentWeeks 修复：逐次「锚点周四 -= 7天」生成，不会跨年失真。
   * 原来的 `setDate(d.getDate() - i*7)` 在元旦附近会错一周。
   */
  function getRecentWeeks(count = 12) {
    const weeks = [];
    const now = new Date();
    // 先对齐到「当前 ISO 周的周四 UTC」作为锚点
    const anchor = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = anchor.getUTCDay() || 7;
    anchor.setUTCDate(anchor.getUTCDate() + 4 - dayNum);
    for (let i = 0; i < count; i++) {
      weeks.push(_isoWeek(new Date(anchor)));
      anchor.setUTCDate(anchor.getUTCDate() - 7);
    }
    return weeks;
  }

  /** ========== 种子数据 ========== */
  function seedIfEmpty() {
    if (_cache.groups.length > 0) return false;
    const demo = [
      { name: '胡楚睿组', leader: '胡楚睿' },
      { name: '李明轩组', leader: '李明轩' },
      { name: '王思涵组', leader: '王思涵' },
    ];
    demo.forEach(g => addGroup({ name: g.name, leader_name: g.leader }));
    return true;
  }

  global.DB = {
    init, reload, CATEGORIES,
    // groups
    listGroups, getGroup, addGroup, updateGroup, deleteGroup,
    // members
    listMembers, listMembersWithGroup, getMember, addMember, updateMember, deleteMember,
    // records
    listRecords, addRecord, updateRecord, deleteRecord, clearAllRecords,
    // search
    searchRecords,
    // shares
    listShares, addShare, deleteShare,
    // docs
    listDocs, addDoc, deleteDoc, uploadFile,
    // statistics & ranking
    computeStatistics, getGroupRanking, getIndividualRanking, getGroupStatistics, getWeeklySharePoints, WEEKLY_SHARE_CAP,
    // settings
    getSetting, setSetting, getPassword, setPassword, checkPassword,
    // persistence
    exportJSON, importJSON,
    // week utils
    getCurrentWeek, getRecentWeeks,
    // seed
    seedIfEmpty,
  };
})(window);
