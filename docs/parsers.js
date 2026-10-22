/* ตัวแยก/รวมไฟล์สำหรับการแปล
   รองรับ: .srt .vtt .txt .md .json
   ทุกฟอร์แมตตอนเป็น unit: { id, source, target, ...ข้อมูลเฉพาะรูปแบบ } */
const Parsers = (() => {

  /* ---------------- SRT ---------------- */
  function parseSRT(content) {
    const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = text.split(/\n{2,}/);
    const units = [];
    blocks.forEach((block, i) => {
      const lines = block.split('\n').filter((l, idx, arr) => !(l.trim() === '' && idx === arr.length - 1));
      if (!lines.length) return;
      let idx = 0;
      let index = null;
      if (/^\d+$/.test(lines[0].trim())) { index = lines[0].trim(); idx = 1; }
      const timecode = lines[idx] !== undefined ? lines[idx] : '';
      const body = lines.slice(idx + 1).join('\n');
      if (!body.trim() && !timecode.trim()) return;
      units.push({
        id: `srt-${i}`,
        index,
        timecode,
        source: body,
        target: '',
      });
    });
    return { type: 'srt', label: 'ซับรูปเคารือ (SRT)', units };
  }

  function serializeSRT(units) {
    return units.map((u) => {
      const parts = [];
      if (u.index !== null && u.index !== undefined && u.index !== '') parts.push(String(u.index));
      if (u.timecode) parts.push(u.timecode);
      parts.push(u.target || u.source);
      return parts.join('\n');
    }).join('\n\n') + '\n';
  }

  /* ---------------- VTT ---------------- */
  function parseVTT(content) {
    const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = text.split(/\n{2,}/);
    const units = [];
    let header = '';
    blocks.forEach((block, i) => {
      const lines = block.split('\n');
      if (i === 0 && /^WEBVTT/.test(lines[0])) {
        header = lines.join('\n');
        return;
      }
      let idx = 0;
      let index = null;
      if (/^\d+$/.test(lines[0].trim())) { index = lines[0].trim(); idx = 1; }
      const timecode = lines[idx] !== undefined ? lines[idx] : '';
      const body = lines.slice(idx + 1).join('\n');
      if (!body.trim() && !timecode.trim()) return;
      units.push({ id: `vtt-${i}`, index, timecode, source: body, target: '' });
    });
    return { type: 'vtt', label: 'ซับเว็บ (VTT)', units, header };
  }

  function serializeVTT(units, header) {
    const head = header || 'WEBVTT';
    const body = units.map((u) => {
      const parts = [];
      if (u.index) parts.push(String(u.index));
      if (u.timecode) parts.push(u.timecode);
      parts.push(u.target || u.source);
      return parts.join('\n');
    }).join('\n\n');
    return `${head}\n\n${body}\n`;
  }

  /* ---------------- ข้อความธรรมดา / Markdown ---------------- */
  function parseLines(content) {
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const units = [];
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      units.push({ id: `txt-${i}`, line: i, source: line, target: '' });
    });
    return { type: 'txt', label: 'ไฟล์ข้อความ', units, raw: lines };
  }

  function serializeLines(parsed, units) {
    const out = parsed.raw.slice();
    units.forEach((u) => { if (typeof u.line === 'number') out[u.line] = u.target || u.source; });
    return out.join('\n');
  }

  /* ---------------- JSON ---------------- */
  function walkJSON(obj, path, out) {
    if (typeof obj === 'string') {
      if (obj.trim()) out.push({ path: path.slice(), source: obj, target: '' });
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => walkJSON(v, path.concat([i]), out));
      return;
    }
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach((k) => walkJSON(obj[k], path.concat([k]), out));
    }
  }

  function parseJSON(content) {
    let data;
    try { data = JSON.parse(content); }
    catch (e) { throw new Error('JSON ไม่ถูกต้อง: ' + e.message); }
    const units = [];
    walkJSON(data, [], units);
    units.forEach((u, i) => { u.id = `json-${i}`; });
    return { type: 'json', label: 'JSON', units, data };
  }

  function serializeJSON(parsed, units) {
    const data = parsed.data;
    units.forEach((u) => {
      let node = data;
      for (let i = 0; i < u.path.length - 1; i++) {
        if (node == null) return;
        node = node[u.path[i]];
      }
      if (node != null && typeof node === 'object') {
        node[u.path[u.path.length - 1]] = u.target || u.source;
      }
    });
    return JSON.stringify(data, null, 2);
  }

  /* ---------------- ตรวจจับชนิดไฟล์ ---------------- */
  function detect(filename, content) {
    const ext = (filename || '').toLowerCase().split('.').pop();
    if (ext === 'srt') return 'srt';
    if (ext === 'vtt') return 'vtt';
    if (ext === 'json') return 'json';
    if (ext === 'md' || ext === 'markdown') return 'md';
    const head = (content || '').trimStart();
    if (/^WEBVTT/.test(head)) return 'vtt';
    if (/^\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(head)) return 'srt';
    if (/^[[{]/.test(head)) {
      try { JSON.parse(content); return 'json'; } catch (e) { /* ไม่ใช่ JSON */ }
    }
    return 'txt';
  }

  function parse(type, content) {
    switch (type) {
      case 'srt': return parseSRT(content);
      case 'vtt': return parseVTT(content);
      case 'json': return parseJSON(content);
      case 'md': return parseLines(content);
      default: return parseLines(content);
    }
  }

  function serialize(parsed, units) {
    switch (parsed.type) {
      case 'srt': return serializeSRT(units);
      case 'vtt': return serializeVTT(units, parsed.header);
      case 'json': return serializeJSON(parsed, units);
      default: return serializeLines(parsed, units);
    }
  }

  return { detect, parse, serialize };
})();
