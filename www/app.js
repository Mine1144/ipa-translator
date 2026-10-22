/* แอปแปลไฟล์เป็นภาษาไทย — ตรรกะหลัก
   นำเข้าไฟล์ → parse → แปลเป็นชุด (มีบริบทก่อนหน้า + glossary + จำชื่อ) → แก้ไข → บันทึก/แชร์ */
(() => {
  const SETTINGS_KEY = 'thai-translator-settings-v1';
  const SESSIONS_KEY = 'thai-translator-sessions-v1';
  const NAMES_KEY = 'thai-translator-names-v1';

  const DEFAULTS = {
    apiKey: '',
    baseUrl: 'https://api.opentyphoon.ai/v1',
    model: 'typhoon-v2.5-30b-a3b-instruct',
    register: 'auto',
    keepTone: true,
    contextLines: 2,
    batchSize: 15,
    glossary: '',
  };

  const LOCAL = (window.LOCAL_CONFIG && typeof window.LOCAL_CONFIG === 'object') ? window.LOCAL_CONFIG : {};
  let settings = { ...DEFAULTS, ...(LOCAL.settings || {}) };
  if (LOCAL.apiKey) settings.apiKey = LOCAL.apiKey;

  let sessions = [];        // { id, name, type, content, units[], updatedAt }
  let currentId = null;
  let knownNames = [];      // ชื่อที่จำไว้ข้ามไฟล์
  let translating = false;
  let cancelFlag = false;

  const $ = (id) => document.getElementById(id);
  const FT = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FileToolsPlugin) || null;

  /* ---------------- ตั้งค่า / ที่เก็บข้อมูล ---------------- */
  function loadAll() {
    try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) {}
    try { knownNames = JSON.parse(localStorage.getItem(NAMES_KEY) || '[]'); } catch (e) {}
    try {
      const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
      sessions = raw.map((s) => rebuild(s)).filter(Boolean);
    } catch (e) { sessions = []; }
  }

  function rebuild(s) {
    try {
      const parsed = Parsers.parse(s.type, s.content);
      const byId = {};
      (s.units || []).forEach((u) => { byId[u.id] = u; });
      parsed.units.forEach((u) => {
        const old = byId[u.id];
        if (old) { u.target = old.target || ''; u.edited = !!old.edited; u.error = old.error || ''; }
      });
      return { ...s, parsed, units: parsed.units };
    } catch (e) { return null; }
  }

  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }
  function saveNames() { try { localStorage.setItem(NAMES_KEY, JSON.stringify(knownNames)); } catch (e) {} }

  function saveSessions() {
    try {
      const light = sessions.map((s) => ({
        id: s.id, name: s.name, type: s.type, content: s.content, updatedAt: s.updatedAt,
        units: s.units.map((u) => ({ id: u.id, target: u.target, edited: u.edited, error: u.error })),
      }));
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(light));
    } catch (e) {
      log('พื้นที่เก็บข้อมูลเต็ม — ลองลบงานเก่า', 'err');
    }
  }

  /* ---------------- UI helpers ---------------- */
  function setStatus(text, kind = '') {
    $('statusText').textContent = text;
    $('statusDot').className = 'dot' + (kind ? ' is-' + kind : '');
  }

  function log(msg, kind = '') {
    const el = $('log');
    if (!el) return;
    const d = document.createElement('div');
    if (kind) d.className = kind;
    d.textContent = msg;
    el.appendChild(d);
    while (el.childElementCount > 100) el.removeChild(el.firstChild);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const current = () => sessions.find((s) => s.id === currentId) || null;

  /* ---------------- ไฟล์ในเครื่อง (native) ---------------- */
  async function listDeviceFiles() {
    const ft = FT();
    if (!ft) return;
    try {
      const res = await ft.listFiles();
      const files = res.files || [];
      $('fileList').innerHTML = files.length
        ? files.map((f) => `
          <div class="file-item">
            <div class="file-main">
              <div class="file-name">${esc(f.name)}</div>
              <div class="file-sub">${(f.size / 1024).toFixed(1)} KB</div>
            </div>
            <div class="file-actions">
              <button class="mini" data-open="${esc(f.name)}">เปิด</button>
              <button class="mini is-danger" data-del="${esc(f.name)}">ลบ</button>
            </div>
          </div>`).join('')
        : '<p class="muted">ยังไม่มีไฟล์ในโฟลเดอร์ Translations</p>';
    } catch (e) {
      $('fileList').innerHTML = '<p class="muted">อ่านรายการไฟล์ไม่สำเร็จ</p>';
    }
  }

  /* ---------------- เพิ่มงาน ---------------- */
  function addSession(name, content) {
    const type = Parsers.detect(name, content);
    const parsed = Parsers.parse(type, content);
    if (!parsed.units.length) { log('ไฟล์นี้ไม่มีข้อความให้แปล', 'warn'); return null; }
    const session = {
      id: 'f' + Date.now() + Math.random().toString(36).slice(2, 7),
      name, type, content, parsed, units: parsed.units, updatedAt: Date.now(),
    };
    sessions.unshift(session);
    saveSessions();
    currentId = session.id;
    renderAll();
    return session;
  }

  async function importFiles() {
    const ft = FT();
    if (ft) {
      try {
        const res = await ft.pickFiles();
        (res.files || []).forEach((f) => addSession(f.name, f.content));
        if ((res.files || []).length) { log(`นำเข้า ${res.files.length} ไฟล์`, 'ok'); await listDeviceFiles(); return; }
      } catch (e) { log('เปิดตัวเลือกไฟล์ไม่สำเร็จ: ' + e.message, 'err'); }
    }
    $('fileInput').click();  // fallback: input type=file
  }

  async function onFilePicked(e) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const content = await f.text();
      addSession(f.name, content);
    }
    if (files.length) log(`นำเข้า ${files.length} ไฟล์`, 'ok');
    e.target.value = '';
  }

  async function openDeviceFile(name) {
    const ft = FT();
    if (!ft) return;
    try {
      const res = await ft.readFile({ name });
      addSession(res.name, res.content);
      log('เปิดไฟล์: ' + res.name, 'ok');
    } catch (e) { log('เปิดไฟล์ไม่สำเร็จ', 'err'); }
  }

  async function deleteDeviceFile(name) {
    const ft = FT();
    if (!ft) return;
    try { await ft.deleteFile({ name }); await listDeviceFiles(); } catch (e) {}
  }

  /* ---------------- แปล ---------------- */
  async function translateSession(session, onlyPending) {
    if (!session || translating) return;
    if (!settings.apiKey) { setStatus('ยังไม่ได้ใส่ API key', 'error'); return; }

    const pending = session.units.filter((u) => (onlyPending ? (!u.target || u.error) : !u.target));
    if (!pending.length) { log('ไม่มีอะไรต้องแปล', 'warn'); return; }

    translating = true;
    cancelFlag = false;
    $('btnTranslate').disabled = true;
    $('btnCancel').disabled = false;

    const batchSize = Math.max(3, Number(settings.batchSize) || 15);
    const contextLines = Math.max(0, Number(settings.contextLines) || 0);
    const glossary = (settings.glossary || '').split('\n').map((s) => s.trim()).filter(Boolean);

    let done = 0;
    const total = pending.length;
    try {
      for (let i = 0; i < pending.length; i += batchSize) {
        if (cancelFlag) { log('หยุดแล้ว', 'warn'); break; }
        const batch = pending.slice(i, i + batchSize);
        const items = batch.map((u) => u.source);

        // บริบท = ยูนิตก่อนหน้าที่แปลแล้ว
        const idxOfFirst = session.units.indexOf(batch[0]);
        const context = [];
        for (let k = idxOfFirst - 1; k >= 0 && context.length < contextLines; k--) {
          const prev = session.units[k];
          if (prev && prev.source) context.unshift({ source: prev.source, target: prev.target || '' });
        }

        try {
          const res = await AI.translateBatch(items, {
            register: settings.register,
            keepTone: settings.keepTone,
            glossary,
            characterNames: knownNames,
            context,
            fileType: session.parsed.label,
          });
          batch.forEach((u, k) => { u.target = res.texts[k] || u.source; u.error = ''; });
          (res.names || []).forEach((n) => {
            const name = String(n).trim();
            if (name && !knownNames.includes(name) && knownNames.length < 200) knownNames.push(name);
          });
          if ((res.names || []).length) saveNames();
        } catch (err) {
          batch.forEach((u) => { u.error = err.message.slice(0, 120); });
          log('แปลชุดนี้ไม่สำเร็จ: ' + err.message.slice(0, 90), 'err');
        }

        done += batch.length;
        session.updatedAt = Date.now();
        saveSessions();
        renderUnits();
        renderProgress(done, total);
        renderNames();
      }
    } finally {
      translating = false;
      $('btnTranslate').disabled = false;
      $('btnCancel').disabled = true;
      setStatus('พร้อม');
    }
  }

  function renderProgress(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('progress').style.width = pct + '%';
    $('workMeta').textContent = `${done}/${total} (${pct}%)`;
  }

  /* ---------------- บันทึก / แชร์ ---------------- */
  function outputName(session) {
    const ext = session.name.includes('.') ? session.name.slice(session.name.lastIndexOf('.')) : '.txt';
    const base = session.name.slice(0, session.name.length - ext.length);
    return base + '.th' + ext;
  }

  async function saveFile(session) {
    if (!session) return;
    const ft = FT();
    const content = Parsers.serialize(session.parsed, session.units);
    if (!ft) {
      // fallback: ดาวน์โหลดผ่านเบราว์เซอร์
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = outputName(session);
      a.click();
      $('saveHint').textContent = 'ดาวน์โหลดแล้ว';
      return;
    }
    try {
      const res = await ft.saveFile({ name: outputName(session), content });
      $('saveHint').textContent = 'บันทึกแล้ว: ' + res.name;
      log('บันทึกไฟล์: ' + res.name, 'ok');
      await listDeviceFiles();
    } catch (e) { log('บันทึกไม่สำเร็จ: ' + e.message, 'err'); }
  }

  async function shareFile(session) {
    if (!session) return;
    const ft = FT();
    const content = Parsers.serialize(session.parsed, session.units);
    if (!ft) { saveFile(session); return; }
    try {
      await ft.shareFile({ name: outputName(session), content });
      log('เปิด Share Sheet แล้ว', 'ok');
    } catch (e) { log('แชร์ไม่สำเร็จ: ' + e.message, 'err'); }
  }

  /* ---------------- การแสดงผล ---------------- */
  function renderSessions() {
    const box = $('sessionList');
    if (!sessions.length) { box.innerHTML = '<p class="muted">ยังไม่มี</p>'; return; }
    box.innerHTML = sessions.map((s) => {
      const done = s.units.filter((u) => u.target).length;
      const pct = s.units.length ? Math.round((done / s.units.length) * 100) : 0;
      return `
      <div class="file-item">
        <div class="file-main">
          <div class="file-name">${esc(s.name)}</div>
          <div class="file-sub">${esc(s.parsed.label)} · ${done}/${s.units.length} ข้อความ (${pct}%)</div>
        </div>
        <div class="file-actions">
          <button class="mini is-primary" data-open-session="${s.id}">เปิด</button>
          <button class="mini is-danger" data-del-session="${s.id}">ลบ</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderUnits() {
    const session = current();
    const box = $('unitList');
    if (!session) {
      $('workTitle').textContent = 'ยังไม่ได้เลือกไฟล์';
      box.innerHTML = '<p class="muted">เลือกไฟล์จากแท็บ “ไฟล์” ก่อน</p>';
      return;
    }
    $('workTitle').textContent = session.name;
    const done = session.units.filter((u) => u.target).length;
    $('workMeta').textContent = `${session.parsed.label} · ${done}/${session.units.length} ข้อความ`;

    box.innerHTML = session.units.map((u, i) => `
      <div class="unit ${u.target ? 'done' : ''} ${u.error ? 'error' : ''}">
        <div class="unit-top">
          <span class="unit-no">${i + 1}</span>
          ${u.timecode ? `<span class="unit-time">${esc(u.timecode)}</span>` : ''}
        </div>
        <div class="unit-src">${esc(u.source)}</div>
        <textarea class="unit-target" data-unit="${u.id}" placeholder="ยังไม่ได้แปล…">${esc(u.target || '')}</textarea>
        ${u.error ? `<div class="unit-status" style="color:var(--danger)">${esc(u.error)}</div>` : ''}
      </div>`).join('');
  }

  function renderNames() {
    const box = $('namesBox');
    if (!box) return;
    box.innerHTML = knownNames.length
      ? knownNames.map((n, i) => `<span class="chip">${esc(n)}<button data-rm-name="${i}">×</button></span>`).join('')
      : '<p class="muted">ยังไม่มีชื่อที่จำไว้</p>';
  }

  function renderAll() {
    renderSessions();
    renderUnits();
    renderNames();
    listDeviceFiles();
  }

  /* ---------------- ผูกปุ่ม ---------------- */
  function bind() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
        document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.id === 'panel-' + tab.dataset.tab));
      });
    });
    $('btnQuickSettings').addEventListener('click', () => document.querySelector('.tab[data-tab="settings"]').click());

    // settings
    const map = {
      apiKey: 'apiKey', baseUrl: 'baseUrl', model: 'model', register: 'register',
      keepTone: 'keepTone', contextLines: 'contextLines', batchSize: 'batchSize', glossary: 'glossary',
    };
    for (const [id, key] of Object.entries(map)) {
      const el = $(id); if (!el) continue;
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
        settings[key] = el.type === 'checkbox' ? el.checked : el.value;
        if (key === 'contextLines') settings.contextLines = Math.max(0, Number(el.value) || 0);
        if (key === 'batchSize') settings.batchSize = Math.max(3, Number(el.value) || 15);
        saveSettings();
        if (key === 'apiKey' || key === 'baseUrl' || key === 'model') AI.apply({ baseUrl: settings.baseUrl, key: settings.apiKey, model: settings.model });
      });
    }

    $('btnTestApi').addEventListener('click', async () => {
      const out = $('apiTestResult');
      out.textContent = 'กำลังทดสอบ…';
      try { const r = await AI.test(); out.textContent = 'ผ่าน: ' + String(r).slice(0, 30); }
      catch (e) { out.textContent = 'ไม่ผ่าน: ' + e.message.slice(0, 70); }
    });

    // ไฟล์
    $('btnImport').addEventListener('click', importFiles);
    $('fileInput').addEventListener('change', onFilePicked);
    $('btnPaste').addEventListener('click', () => {
      document.querySelector('details[open]') || [...document.querySelectorAll('details')].forEach((d) => { if (d.querySelector('#pasteArea')) d.open = true; });
      $('pasteArea').focus();
    });
    $('btnAddPaste').addEventListener('click', () => {
      const text = $('pasteArea').value.trim();
      if (!text) { log('ยังไม่ได้วางข้อความ', 'warn'); return; }
      const name = ($('pasteName').value.trim() || 'ข้อความ') + '.txt';
      addSession(name, text);
      $('pasteArea').value = '';
      $('pasteName').value = '';
    });

    document.addEventListener('click', async (e) => {
      const t = e.target;
      const openSession = t.dataset && t.dataset.openSession;
      const delSession = t.dataset && t.dataset.delSession;
      const openFile = t.dataset && t.dataset.open;
      const delFile = t.dataset && t.dataset.del;
      const rmName = t.dataset && t.dataset.rmName;
      if (openSession) { currentId = openSession; renderUnits(); document.querySelector('.tab[data-tab="work"]').click(); }
      if (delSession) {
        sessions = sessions.filter((s) => s.id !== delSession);
        if (currentId === delSession) currentId = null;
        saveSessions(); renderAll();
      }
      if (openFile) await openDeviceFile(openFile);
      if (delFile) await deleteDeviceFile(delFile);
      if (rmName !== undefined && rmName !== null) { knownNames.splice(Number(rmName), 1); saveNames(); renderNames(); }
    });

    // แก้ไขคำแปล
    $('unitList').addEventListener('input', (e) => {
      const id = e.target.dataset && e.target.dataset.unit;
      if (!id) return;
      const session = current(); if (!session) return;
      const unit = session.units.find((u) => u.id === id); if (!unit) return;
      unit.target = e.target.value;
      unit.edited = true;
      unit.error = '';
      session.updatedAt = Date.now();
      saveSessions();
    });

    // ปุ่มแปล
    $('btnTranslate').addEventListener('click', () => translateSession(current(), false));
    $('btnRetry').addEventListener('click', () => translateSession(current(), true));
    $('btnCancel').addEventListener('click', () => { cancelFlag = true; log('กำลังหยุด…', 'warn'); });
    $('btnSaveFile').addEventListener('click', () => saveFile(current()));
    $('btnShareFile').addEventListener('click', () => shareFile(current()));

    $('btnClearSessions').addEventListener('click', () => {
      sessions = []; currentId = null; saveSessions(); renderAll();
    });
    $('btnExportSession').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'translations.json';
      a.click();
    });
    $('btnReset').addEventListener('click', () => {
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem(SESSIONS_KEY);
      location.reload();
    });
  }

  /* ---------------- boot ---------------- */
  function applyUI() {
    $('apiKey').value = settings.apiKey || '';
    $('baseUrl').value = settings.baseUrl;
    $('model').value = settings.model;
    $('register').value = settings.register;
    $('keepTone').checked = !!settings.keepTone;
    $('contextLines').value = settings.contextLines;
    $('batchSize').value = settings.batchSize;
    $('glossary').value = settings.glossary || '';
    AI.apply({ baseUrl: settings.baseUrl, key: settings.apiKey, model: settings.model });
  }

  function boot() {
    loadAll();
    applyUI();
    bind();
    renderAll();
    setStatus(settings.apiKey ? 'พร้อม' : 'ยังไม่ได้ใส่ API key', settings.apiKey ? '' : 'error');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
