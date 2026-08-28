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

  /** 异步插入到 Supabase（不阻塞 UI），返回内存中的临时记录 */
  function _insert(table, row) {
    const tempId = _nextTempId();
    const item = { ...row, id: tempId };
    _cache[table].push(item);
    // 异步写入 Supabase
    supabase.from(table).insert(row).select().then(({ data, error }) => {
      if (error) {
        console.error(`Supabase insert ${table}:`, error.message);
        Utils.toast('同步到云端失败，请检查网络', 'error');
        return;
      }
      if (data && data[0]) {
        // 更新内存中的 id 为真实 id
        item.id = data[0].id;
      }
    }).catch(err => console.error(`Supabase insert ${table} failed:`, err));
    return item;
  }

  /** 异步更新 Supabase */
  function _update(table, id, updates) {
    const item = _cache[table].find(r => r.id === id);
    if (item) Object.assign(item, updates);
    if (id > 0) {
      supabase.from(table).update(updates).eq('id', id).then(({ error }) => {
        if (error) console.error(`Supabase update ${table}:`, error.message);
      });
    }
  }

  /** 异步删除 Supabase */
  function _delete(table, id) {
    const idx = _cache[table].findIndex(r => r.id === id);
    if (idx >= 0) _cache[table].splice(idx, 1);
    if (id > 0) {
      supabase.from(table).delete().eq('id', id).then(({ error }) => {
        if (error) console.error(`Supabase delete ${table}:`, error.message);
      });
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
    const item = _insert('groups', row);
    return item;
  }
  function updateGroup(id, { name, leader_name }) {
    _update('groups', id, { name, leader_name });
    return getGroup(id);
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
    }
    return true;
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
    const item = _insert('members', row);
    return item;
  }
  function updateMember(id, { name, group_id }) {
    _update('members', id, { name, group_id });
    return getMember(id);
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
    }
    return true;
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
  function addRecord({ member_id, group_id, category, description, individual_points, group_points, week }) {
    const row = {
      member_id: member_id || null,
      group_id,
      category,
      description: description || '',
      individual_points: Number(individual_points) || 0,
      group_points: Number(group_points) || 0,
      week: week || '',
      created_at: _now(),
      recorded_by: '管理员',
    };
    const item = _insert('score_records', row);
    return item.id;
  }
  function updateRecord(id, { member_id, group_id, category, description, individual_points, group_points, week }) {
    _update('score_records', id, {
      member_id: member_id || null,
      group_id,
      category,
      description: description || '',
      individual_points: Number(individual_points) || 0,
      group_points: Number(group_points) || 0,
      week: week || '',
    });
    return true;
  }
  function deleteRecord(id) {
    _delete('score_records', id);
    return true;
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
      if (a.week < b.week) return 1;
      if (a.week > b.week) return -1;
      if (a.created_at < b.created_at) return 1;
      if (a.created_at > b.created_at) return -1;
      return 0;
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
    // 普通分享且有成员关联时自动加1分（公告和匿名不加积分）
    if (!is_announcement && member_id) {
      _insert('score_records', {
        member_id: member_id || null,
        group_id,
        category: 3,
        description: '群分享：' + (title || (content || '').slice(0, 20)),
        individual_points: 1,
        group_points: 0,
        week: week || '',
        created_at: now,
        recorded_by: '分享板自动',
      });
    }
    return share.id;
  }
  function deleteShare(id) {
    _delete('shares', id);
    return true;
  }

  /** ========== 文档 CRUD ========== */
  function listDocs({ category = '' } = {}) {
    let docs = _cache.docs.slice();
    if (category) docs = docs.filter(d => d.category === category);
    return docs;
  }
  function addDoc({ title, content, link, category, is_pinned }) {
    const now = _now();
    const doc = _insert('docs', {
      title: title || '',
      content: content || '',
      link: link || '',
      category: category || '学习资料',
      is_pinned: is_pinned ? 1 : 0,
      created_at: now,
    });
    return doc.id;
  }
  function deleteDoc(id) {
    _delete('docs', id);
    return true;
  }

  /** 上传文件到 Supabase Storage，返回公开 URL */
  async function uploadFile(file) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const fileName = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('docs').upload(fileName, file, { upsert: false });
    if (error) throw new Error('上传失败: ' + error.message);
    const { data: urlData } = supabase.storage.from('docs').getPublicUrl(fileName);
    return { url: urlData.publicUrl, name: file.name, type: file.type, ext };
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

  /** ========== 周次工具 ========== */
  function _isoWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  function getCurrentWeek() {
    return _isoWeek(new Date());
  }
  function getRecentWeeks(count = 12) {
    const weeks = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      weeks.push(_isoWeek(d));
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
    computeStatistics, getGroupRanking, getIndividualRanking,
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
