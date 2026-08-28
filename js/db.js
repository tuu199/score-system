/* ============================================================
 * db.js - 学习积分系统 数据访问层（基于 sql.js 浏览器内 SQLite）
 * 5 类积分：出勤打卡 / 单词背诵 / 群分享 / 期末考试 / 单科拔尖
 * ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'learning-points:db:v1';
  const OLD_KEY = 'score-system:db:v1'; // 旧系统 key，需清理

  let SQL = null;
  let db = null;

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

  const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      leader_name TEXT NOT NULL,
      created_at  TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      group_id    INTEGER NOT NULL,
      created_at  TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS score_records (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id         INTEGER,
      group_id          INTEGER NOT NULL,
      category          INTEGER NOT NULL,
      description       TEXT,
      individual_points REAL DEFAULT 0,
      group_points      REAL DEFAULT 0,
      week              TEXT,
      created_at        TEXT NOT NULL,
      recorded_by       TEXT,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_records_group ON score_records(group_id)`,
    `CREATE INDEX IF NOT EXISTS idx_records_member ON score_records(member_id)`,
    `CREATE INDEX IF NOT EXISTS idx_records_category ON score_records(category)`,
    `CREATE INDEX IF NOT EXISTS idx_records_week ON score_records(week)`,
    `CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  ];

  /** ========== 初始化 ========== */
  async function init() {
    if (db) return db;
    if (typeof global.initSqlJs !== 'function') {
      throw new Error('sql.js 未加载，请检查网络连接');
    }
    SQL = await global.initSqlJs({
      locateFile: (f) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`,
    });
    // 清理旧系统数据
    global.localStorage.removeItem(OLD_KEY);
    db = _loadFromStorage() || new SQL.Database();
    _exec(SCHEMA);
    db.run('PRAGMA foreign_keys = ON');
    _saveToStorage();
    return db;
  }

  /** ========== 内部工具 ========== */
  function _exec(sql, params = []) {
    if (Array.isArray(sql)) return sql.map((s) => _exec(s, params));
    return db.run(sql, params);
  }
  function _queryAll(sql, params = []) {
    const res = db.exec(sql, params);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map((row) => {
      const obj = {};
      columns.forEach((c, i) => (obj[c] = row[i]));
      return obj;
    });
  }
  function _queryOne(sql, params = []) {
    return _queryAll(sql, params)[0] || null;
  }
  function _lastId() {
    return Number(_queryOne('SELECT last_insert_rowid() AS id').id);
  }
  function _saveToStorage() {
    try {
      const arr = db.export();
      let binary = '';
      const bytes = new Uint8Array(arr);
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      global.localStorage.setItem(STORAGE_KEY, btoa(binary));
    } catch (e) { console.warn('保存失败：', e); }
  }
  function _loadFromStorage() {
    const b64 = global.localStorage.getItem(STORAGE_KEY);
    if (!b64) return null;
    try {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new SQL.Database(bytes);
    } catch (e) { console.warn('恢复失败，新建库：', e); return null; }
  }
  function _mutate(fn) {
    if (!db) throw new Error('数据库未初始化');
    try {
      const ret = fn();
      _saveToStorage();
      return ret;
    } catch (e) { console.error(e); throw e; }
  }

  /** ========== 小组 CRUD ========== */
  function listGroups() {
    return _queryAll(
      `SELECT g.*,
        (SELECT COUNT(*) FROM members m WHERE m.group_id = g.id) AS member_count,
        (SELECT COALESCE(SUM(group_points),0) FROM score_records sr WHERE sr.group_id = g.id) AS group_pts,
        (SELECT COALESCE(SUM(individual_points),0) FROM score_records sr
         WHERE sr.group_id = g.id AND sr.member_id IS NOT NULL) AS member_indiv_pts,
        (SELECT COALESCE(SUM(individual_points),0) FROM score_records sr
         WHERE sr.group_id = g.id AND sr.member_id IS NULL) AS group_indiv_pts
       FROM groups g ORDER BY g.name`
    );
  }
  function getGroup(id) {
    return _queryOne('SELECT * FROM groups WHERE id = ?', [id]);
  }
  function addGroup({ name, leader_name }) {
    return _mutate(() => {
      _exec('INSERT INTO groups (name, leader_name, created_at) VALUES (?,?,?)',
        [name, leader_name, Utils.formatDate()]);
      return getGroup(_lastId());
    });
  }
  function updateGroup(id, { name, leader_name }) {
    return _mutate(() => {
      _exec('UPDATE groups SET name=?, leader_name=? WHERE id=?', [name, leader_name, id]);
      return getGroup(id);
    });
  }
  function deleteGroup(id) {
    return _mutate(() => { _exec('DELETE FROM groups WHERE id = ?', [id]); return true; });
  }

  /** ========== 组员 CRUD ========== */
  function listMembers(groupId) {
    if (groupId) {
      return _queryAll('SELECT * FROM members WHERE group_id = ? ORDER BY name', [groupId]);
    }
    return _queryAll('SELECT * FROM members ORDER BY group_id, name');
  }
  function listMembersWithGroup() {
    return _queryAll(
      `SELECT m.*, g.name AS group_name, g.leader_name AS group_leader
       FROM members m JOIN groups g ON g.id = m.group_id
       ORDER BY g.name, m.name`
    );
  }
  function getMember(id) {
    return _queryOne('SELECT * FROM members WHERE id = ?', [id]);
  }
  function addMember({ name, group_id }) {
    return _mutate(() => {
      _exec('INSERT INTO members (name, group_id, created_at) VALUES (?,?,?)',
        [name, group_id, Utils.formatDate()]);
      return getMember(_lastId());
    });
  }
  function updateMember(id, { name, group_id }) {
    return _mutate(() => {
      _exec('UPDATE members SET name=?, group_id=? WHERE id=?', [name, group_id, id]);
      return getMember(id);
    });
  }
  function deleteMember(id) {
    return _mutate(() => { _exec('DELETE FROM members WHERE id = ?', [id]); return true; });
  }

  /** ========== 积分记录 CRUD ========== */
  function listRecords({ groupId = 0, memberId = 0, category = 0, week = '' } = {}) {
    const params = [];
    const where = [];
    if (groupId) { where.push('sr.group_id = ?'); params.push(groupId); }
    if (memberId) { where.push('sr.member_id = ?'); params.push(memberId); }
    if (category) { where.push('sr.category = ?'); params.push(category); }
    if (week) { where.push('sr.week = ?'); params.push(week); }
    const sql = `SELECT sr.*,
                   g.name AS group_name, g.leader_name AS group_leader,
                   m.name AS member_name
                 FROM score_records sr
                 JOIN groups g ON g.id = sr.group_id
                 LEFT JOIN members m ON m.id = sr.member_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY sr.created_at DESC, sr.id DESC`;
    return _queryAll(sql, params);
  }
  function addRecord({ member_id, group_id, category, description, individual_points, group_points, week }) {
    return _mutate(() => {
      _exec(
        `INSERT INTO score_records
         (member_id, group_id, category, description, individual_points, group_points, week, created_at, recorded_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [member_id || null, group_id, category, description || '',
         Number(individual_points) || 0, Number(group_points) || 0, week || '',
         Utils.formatDate(), '管理员']
      );
      return _lastId();
    });
  }
  function updateRecord(id, { member_id, group_id, category, description, individual_points, group_points, week }) {
    return _mutate(() => {
      _exec(
        `UPDATE score_records SET member_id=?, group_id=?, category=?, description=?,
         individual_points=?, group_points=?, week=? WHERE id=?`,
        [member_id || null, group_id, category, description || '',
         Number(individual_points) || 0, Number(group_points) || 0, week || '', id]
      );
      return true;
    });
  }
  function deleteRecord(id) {
    return _mutate(() => { _exec('DELETE FROM score_records WHERE id = ?', [id]); return true; });
  }

  /** ========== 搜索 ========== */
  function searchRecords({ keyword = '', groupId = 0, category = 0, week = '' } = {}) {
    const params = [];
    const where = [];
    if (keyword) {
      where.push('(m.name LIKE ? OR g.name LIKE ? OR sr.description LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (groupId) { where.push('sr.group_id = ?'); params.push(groupId); }
    if (category) { where.push('sr.category = ?'); params.push(category); }
    if (week) { where.push('sr.week = ?'); params.push(week); }
    const sql = `SELECT sr.*, g.name AS group_name, g.leader_name AS group_leader, m.name AS member_name
                 FROM score_records sr
                 JOIN groups g ON g.id = sr.group_id
                 LEFT JOIN members m ON m.id = sr.member_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY sr.week DESC, sr.created_at DESC`;
    return _queryAll(sql, params);
  }

  /** ========== 统计 ========== */
  function computeStatistics() {
    const overall = _queryOne(
      `SELECT COUNT(*) AS total_records,
              COALESCE(SUM(individual_points),0) AS total_individual,
              COALESCE(SUM(group_points),0) AS total_group,
              COALESCE(SUM(individual_points + group_points),0) AS total_all
       FROM score_records`
    ) || { total_records: 0, total_individual: 0, total_group: 0, total_all: 0 };

    const byGroup = _queryAll(
      `SELECT g.id, g.name, g.leader_name,
              COUNT(sr.id) AS record_count,
              COALESCE(SUM(sr.individual_points),0) AS indiv_pts,
              COALESCE(SUM(sr.group_points),0) AS group_pts,
              COALESCE(SUM(sr.individual_points + sr.group_points),0) AS total_pts
       FROM groups g
       LEFT JOIN score_records sr ON sr.group_id = g.id
       GROUP BY g.id ORDER BY total_pts DESC`
    );

    const byCategory = _queryAll(
      `SELECT category,
              COUNT(*) AS record_count,
              COALESCE(SUM(individual_points),0) AS indiv_pts,
              COALESCE(SUM(group_points),0) AS group_pts,
              COALESCE(SUM(individual_points + group_points),0) AS total_pts
       FROM score_records GROUP BY category ORDER BY category`
    );

    return {
      overall: { ...overall,
        total_individual: Utils.round(overall.total_individual),
        total_group: Utils.round(overall.total_group),
        total_all: Utils.round(overall.total_all),
      },
      by_group: byGroup.map(r => ({ ...r,
        indiv_pts: Utils.round(r.indiv_pts),
        group_pts: Utils.round(r.group_pts),
        total_pts: Utils.round(r.total_pts),
      })),
      by_category: byCategory.map(r => ({ ...r,
        indiv_pts: Utils.round(r.indiv_pts),
        group_pts: Utils.round(r.group_pts),
        total_pts: Utils.round(r.total_pts),
      })),
    };
  }

  /** ========== 排名 ========== */
  function getGroupRanking() {
    return _queryAll(
      `SELECT g.id, g.name, g.leader_name,
              (SELECT COUNT(*) FROM members m WHERE m.group_id = g.id) AS member_count,
              COALESCE(SUM(sr.group_points),0) AS group_pts,
              COALESCE(SUM(sr.individual_points),0) AS indiv_pts,
              COALESCE(SUM(sr.individual_points + sr.group_points),0) AS total_pts
       FROM groups g
       LEFT JOIN score_records sr ON sr.group_id = g.id
       GROUP BY g.id ORDER BY total_pts DESC`
    ).map((r, i) => ({ ...r,
      group_pts: Utils.round(r.group_pts),
      indiv_pts: Utils.round(r.indiv_pts),
      total_pts: Utils.round(r.total_pts),
      rank: i + 1,
    }));
  }

  function getIndividualRanking() {
    const rows = _queryAll(
      `SELECT m.id, m.name, m.group_id, g.name AS group_name, g.leader_name AS group_leader,
              COALESCE(SUM(sr.individual_points),0) AS indiv_pts,
              COUNT(sr.id) AS record_count
       FROM members m
       JOIN groups g ON g.id = m.group_id
       LEFT JOIN score_records sr ON sr.member_id = m.id
       GROUP BY m.id ORDER BY indiv_pts DESC`
    );
    let lastPts = null, lastRank = 0;
    return rows.map((r, i) => {
      const pts = Utils.round(r.indiv_pts);
      if (pts !== lastPts) { lastRank = i + 1; lastPts = pts; }
      return { ...r, indiv_pts: pts, rank: lastRank };
    });
  }

  /** ========== 设置（密码管理） ========== */
  function getSetting(key, defaultVal = '') {
    const r = _queryOne('SELECT value FROM settings WHERE key = ?', [key]);
    return r ? r.value : defaultVal;
  }
  function setSetting(key, value) {
    return _mutate(() => {
      _exec('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', [key, value]);
      return true;
    });
  }
  function getPassword() {
    const v = getSetting('admin_password', '');
    if (!v) return 'admin123'; // 默认密码
    try { return atob(v); } catch { return 'admin123'; }
  }
  function setPassword(newPwd) {
    return setSetting('admin_password', btoa(newPwd));
  }
  function checkPassword(pwd) {
    return pwd === getPassword();
  }

  /** ========== 导入导出 ========== */
  function exportDatabase() {
    if (!db) throw new Error('数据库未初始化');
    return db.export();
  }
  function importDatabase(buffer) {
    return _mutate(() => {
      const newDb = new SQL.Database(new Uint8Array(buffer));
      const t = newDb.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('groups','members','score_records')`);
      const names = t[0] ? t[0].values.flat() : [];
      if (!names.includes('groups') || !names.includes('score_records')) {
        throw new Error('不是有效的学习积分数据库文件');
      }
      db.close();
      db = newDb;
      db.run('PRAGMA foreign_keys = ON');
      return true;
    });
  }

  /** 导出为 JSON（用于公网共享，学生端可直接 fetch 加载） */
  function exportJSON() {
    if (!db) throw new Error('数据库未初始化');
    const groups = _queryAll('SELECT id, name, leader_name, created_at FROM groups ORDER BY id');
    const members = _queryAll('SELECT id, name, group_id, created_at FROM members ORDER BY id');
    const records = _queryAll(`SELECT id, member_id, group_id, category, description,
                               individual_points, group_points, week, created_at, recorded_by
                               FROM score_records ORDER BY id`);
    const settings = _queryAll('SELECT key, value FROM settings');
    return {
      _meta: { app: 'score-system', version: 1, exported_at: Utils.formatDate() },
      groups, members, score_records: records, settings,
    };
  }

  /** 从 JSON 对象导入（覆盖当前数据），用于学生端加载共享数据 */
  function importJSON(data) {
    if (!data || !Array.isArray(data.groups) || !Array.isArray(data.score_records)) {
      throw new Error('JSON 数据格式无效');
    }
    return _mutate(() => {
      // 清空现有数据
      _exec('DELETE FROM score_records');
      _exec('DELETE FROM members');
      _exec('DELETE FROM groups');
      _exec('DELETE FROM settings');
      // 重新插入
      (data.groups || []).forEach(g => {
        _exec('INSERT INTO groups (id, name, leader_name, created_at) VALUES (?,?,?,?)',
          [g.id, g.name, g.leader_name, g.created_at]);
      });
      (data.members || []).forEach(m => {
        _exec('INSERT INTO members (id, name, group_id, created_at) VALUES (?,?,?,?)',
          [m.id, m.name, m.group_id, m.created_at]);
      });
      (data.score_records || []).forEach(r => {
        _exec(`INSERT INTO score_records (id, member_id, group_id, category, description,
               individual_points, group_points, week, created_at, recorded_by)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [r.id, r.member_id, r.group_id, r.category, r.description,
           r.individual_points, r.group_points, r.week, r.created_at, r.recorded_by]);
      });
      (data.settings || []).forEach(s => {
        _exec('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', [s.key, s.value]);
      });
      // 重置自增序列，避免下次插入冲突
      try {
        _exec("UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM groups) WHERE name='groups'");
        _exec("UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM members) WHERE name='members'");
        _exec("UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM score_records) WHERE name='score_records'");
      } catch (e) { /* sqlite_sequence 可能不存在，忽略 */ }
      return true;
    });
  }

  /** 从 URL 加载 JSON 数据（学生端用），返回 Promise */
  async function loadFromURL(url) {
    // 添加时间戳防止浏览器缓存旧数据
    const bustUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const res = await fetch(bustUrl);
    if (!res.ok) throw new Error(`加载数据失败：HTTP ${res.status}`);
    const data = await res.json();
    importJSON(data);
    return data;
  }

  /** ========== 周次工具 ========== */
  function getCurrentWeek() {
    const d = new Date();
    const year = d.getFullYear();
    const start = new Date(year, 0, 1);
    const week = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  function getRecentWeeks(count = 12) {
    const weeks = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const year = d.getFullYear();
      const start = new Date(year, 0, 1);
      const week = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
      weeks.push(`${year}-W${String(week).padStart(2, '0')}`);
    }
    return weeks;
  }

  /** ========== 种子数据（仅示例小组，不预填成员与积分，全部由用户自行录入）========== */
  function seedIfEmpty() {
    if (!db) return false;
    const c = _queryOne('SELECT COUNT(*) AS c FROM groups').c;
    if (c > 0) return false;
    // 仅创建示例小组（不含成员、不含积分），方便用户参考命名规则
    const demo = [
      { name: '胡楚睿组', leader: '胡楚睿' },
      { name: '李明轩组', leader: '李明轩' },
      { name: '王思涵组', leader: '王思涵' },
    ];
    return _mutate(() => {
      demo.forEach(g => {
        _exec('INSERT INTO groups (name, leader_name, created_at) VALUES (?,?,?)',
          [g.name, g.leader, Utils.formatDate()]);
      });
      return true;
    });
  }

  global.DB = {
    init, CATEGORIES,
    // groups
    listGroups, getGroup, addGroup, updateGroup, deleteGroup,
    // members
    listMembers, listMembersWithGroup, getMember, addMember, updateMember, deleteMember,
    // records
    listRecords, addRecord, updateRecord, deleteRecord,
    // search
    searchRecords,
    // statistics & ranking
    computeStatistics, getGroupRanking, getIndividualRanking,
    // settings
    getSetting, setSetting, getPassword, setPassword, checkPassword,
    // persistence
    exportDatabase, importDatabase, exportJSON, importJSON, loadFromURL,
    // week utils
    getCurrentWeek, getRecentWeeks,
    // seed
    seedIfEmpty,
  };
})(window);
