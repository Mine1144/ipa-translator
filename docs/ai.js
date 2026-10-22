/* ตัวคุยกับ Opentyphoon API (OpenAI-compatible) + ตัวช่วยแปลเป็นชุด */
const AI = (() => {
  const cfg = {
    baseUrl: 'https://api.opentyphoon.ai/v1',
    key: '',
    model: 'typhoon-v2.5-30b-a3b-instruct',
  };

  function apply(patch) { Object.assign(cfg, patch || {}); }

  function authHeaders() {
    if (!cfg.key) throw new Error('ยังไม่ได้ใส่ API key');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` };
  }

  async function chat(messages, opts = {}) {
    const body = {
      model: opts.model || cfg.model,
      messages,
      temperature: opts.temperature ?? 0.3,
      top_p: opts.top_p ?? 0.95,
      max_tokens: opts.max_tokens ?? 4000,
      repetition_penalty: opts.repetition_penalty ?? 1.05,
      stream: false,
    };
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text.slice(0, 220)}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? '';
    return { content, raw: json };
  }

  async function chatJSON(messages, opts = {}) {
    const { content } = await chat(messages, opts);
    const parsed = extractJSON(content);
    if (!parsed) throw new Error('โมเดลไม่ได้ตอบเป็น JSON: ' + content.slice(0, 160));
    return parsed;
  }

  function extractJSON(text) {
    if (!text) return null;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fence ? fence[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch (_) { return null; }
  }

  function extractJSONArray(text) {
    if (!text) return null;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fence ? fence[1] : text;
    const start = candidate.indexOf('[');
    const end = candidate.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return null;
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch (_) { return null; }
  }

  /* ---------------- ตัวช่วยแปลเป็นชุด ---------------- */

  /**
   * แปลข้อความเป็นชุด
   * @param {string[]} items      ข้อความต้นฉบับ
   * @param {object} opts         { register, keepTone, glossary, contextBefore, contextAfter, fileType, characterNames }
   * @returns {Promise<{texts:string[], meta:object}>}
   */
  async function translateBatch(items, opts = {}) {
    const {
      register = 'auto',
      keepTone = true,
      glossary = [],
      contextBefore = 2,
      contextAfter = 0,
      fileType = 'ข้อความ',
      characterNames = [],
      context = [],
    } = opts;

    const glossaryText = (glossary || []).length
      ? '\nคำเฉพาะที่ต้องใช้ตามนี้ (ห้ามแปลคำเหล่านี้):\n' + glossary.map((g) => `- ${g}`).join('\n')
      : '';
    const namesText = (characterNames || []).length
      ? `\nชื่อตัวละครที่ต้องใช้ให้ตรงเดิม: ${characterNames.join(', ')}`
      : '';

    const system = `คุณคือนักแปลไฟล์เป็นภาษาไทยมืออาชีพ แปล${fileType}จากภาษาอื่น (อังกฤษ/ญี่ปุ่น/จีน) ให้เป็นภาษาไทยที่อ่านลื่นและใช้ได้จริง

กฎเหล็ก
1. แปลให้ครบทุกชิ้น เรียงลำดับเดียวกับที่ให้มา ห้ามตัด ห้ามเพิ่มข้อความใหม่
2. ${keepTone ? 'รักษาน้ำเสียงและอารมณ์ของต้นฉบับให้ชัดเจน (โกรธ/เศร้า/ตลก/เย็นชา/เป็นทางการ)' : 'ทำให้อ่านง่ายเป็นธรรมชาติ'}
3. เลือกระดับภาษาตามตัวละครและบริบท:
   - register ที่ผู้ใช้ตั้งไว้คือ "${register}" (ถ้าเป็น auto ให้เลือกเองตามวัยและความสัมพันธ์ของตัวละคร)
   - ผู้ใหญ่/คนสูงวัย → สุภาพ, วัยรุ่น → เถาะ, ทางการ → เป็นทางการ
4. ชื่อเฉพาะ/คำที่ไม่ต้องแปล ให้คงเดิม
5. ถ้าข้อความมีตัวแปรแบบ {name} ให้คงไว้ครบ
6. ถ้าข้อความว่างเปล่า ให้คืนค่าว่าง
${glossaryText}${namesText}
ตอบเป็น JSON object เท่านั้น:
{ "texts": ["คำแปล 1", "คำแปล 2"], "names": ["ชื่อตัวละคร/คำเฉพาะที่เจอครั้งแรก"] }
- texts ต้องมีจำนวนเท่ากับที่ให้มา เรียงลำดับเดียวกัน
- names ใส่เฉพาะชื่อที่เพิ่งเจอครั้งแรก (ถ้าไม่มีให้เป็น array ว่าง) เพื่อให้จำชื่อได้ตรงกันข้ามไฟล์`;

    const numbered = items.map((t, i) => `${i + 1}. ${JSON.stringify(t)}`).join('\n');
    const contextText = (context || []).length
      ? '\nบริบทก่อนหน้า (อ่านเพื่อความต่อเนื่อง ห้ามแปลซ้ำ):\n' +
        context.map((c) => `- ${c.source}${c.target ? ' → ' + c.target : ''}`).join('\n') + '\n'
      : '';
    const user = `แปลข้อความเหล่านี้เป็นภาษาไทย (ตอบ JSON object ตามรูปแบบ):${contextText}\n${numbered}`;

    const { content } = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], {
      temperature: 0.25, max_tokens: 4000,
    });

    // รองรับทั้งแบบ object และ array เปล่า
    let texts = null;
    let names = [];
    const obj = extractJSON(content);
    if (obj && Array.isArray(obj.texts)) { texts = obj.texts; names = Array.isArray(obj.names) ? obj.names : []; }
    if (!texts) {
      const arr = extractJSONArray(content);
      if (arr) texts = arr;
    }
    if (!texts || texts.length !== items.length) {
      throw new Error('โมเดลตอบจำนวนไม่ตรง (' + (texts ? texts.length : 'ไม่มี JSON') + '/' + items.length + ')');
    }
    return { texts: texts.map((s) => String(s ?? '')), names, raw: content };
  }

  async function test() {
    const { content } = await chat([{ role: 'user', content: 'ตอบว่า "ต่อมา" เท่านั้น' }], { max_tokens: 20, temperature: 0.1 });
    return content;
  }

  return { cfg, apply, chat, chatJSON, chatStream: null, translateBatch, test, extractJSON, extractJSONArray };
})();
