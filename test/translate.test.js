/* ทดสอบแอปแปลไฟล์: parser → แปลด้วย Typhoon → serialize (ต้องคงโครงสร้างไฟล์เดิม)
   ใช้: node test/translate.test.js
   ต้องมี env TYPHOON_KEY */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const www = path.join(__dirname, '..', 'www');
const sandbox = { console, fetch, FormData, Blob, Date, JSON, Math, String, Number, Object, Array, Promise, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['ai.js', 'parsers.js']) {
  vm.runInContext(fs.readFileSync(path.join(www, f), 'utf8'), sandbox, { filename: f });
}
const { AI, Parsers } = vm.runInContext('({ AI, Parsers })', sandbox);

const KEY = process.env.TYPHOON_KEY || '';
if (!KEY) { console.error('ตั้ง env TYPHOON_KEY ก่อน'); process.exit(2); }
AI.apply({ baseUrl: 'https://api.opentyphoon.ai/v1', key: KEY });

/* ---------- ตัวอย่าง SRT ---------- */
const SRT = `1
00:00:01,000 --> 00:00:03,500
Have you eaten yet, child?

2
00:00:04,000 --> 00:00:07,000
I'm not angry with you.

3
00:00:08,000 --> 00:00:11,000
You have no idea what you've done!
`;

(async () => {
  console.log('=== 1. parse SRT ===');
  const type = Parsers.detect('demo.srt', SRT);
  const parsed = Parsers.parse(type, SRT);
  console.log('ชนิด:', type, '| จำนวนยูนิต:', parsed.units.length);
  parsed.units.forEach((u, i) => console.log(`  [${i + 1}] ${u.index} ${u.timecode} :: ${JSON.stringify(u.source)}`));

  console.log('\n=== 2. แปลเป็นชุด (พร้อมบริบท) ===');
  const batch = parsed.units.slice(0, 2).map((u) => u.source);
  const res = await AI.translateBatch(batch, {
    register: 'auto', keepTone: true,
    glossary: [], characterNames: [],
    context: [{ source: 'Earlier line of context', target: 'บรรทัดก่อนหน้า' }],
    fileType: 'ซับรูปเคารือ (SRT)',
  });
  res.texts.forEach((t, i) => console.log(`  ${i + 1}. ${JSON.stringify(t)}`));
  if (res.names && res.names.length) console.log('  ชื่อที่จับได้:', res.names.join(', '));

  console.log('\n=== 3. ใส่คำแปลกลับ + serialize ===');
  res.texts.forEach((t, i) => { parsed.units[i].target = t; });
  const out = Parsers.serialize(parsed, parsed.units);
  console.log(out);

  console.log('=== 4. ตรวจว่าโครงสร้าง SRT ยังถูก ===');
  const okIndex = /1\n00:00:01,000 --> 00:00:03,500/.test(out);
  const okTc = out.includes('00:00:08,000 --> 00:00:11,000');
  const okCount = (out.match(/-->/g) || []).length === 3;
  console.log('  index+timecode ของบล็อกแรก:', okIndex ? 'ผ่าน' : 'ไม่ผ่าน');
  console.log('  timecode บล็อกที่ 3:', okTc ? 'ผ่าน' : 'ไม่ผ่าน');
  console.log('  จำนวน timecode ครบ 3:', okCount ? 'ผ่าน' : 'ไม่ผ่าน');

  console.log('\n=== 5. ทดสอบรูปแบบอื่น ===');
  const md = '# หัวข้อ\n\nบรรทัดแรก\nบรรทัดที่สอง\n';
  const pmd = Parsers.parse(Parsers.detect('a.md', md), md);
  console.log('  md units:', pmd.units.length);
  const js = JSON.stringify({ title: 'Hello', items: ['One', 'Two'] });
  const pjs = Parsers.parse(Parsers.detect('a.json', js), js);
  console.log('  json units:', pjs.units.length, '->', pjs.units.map((u) => u.source).join(' | '));
  pjs.units[0].target = 'สวัสดี';
  console.log('  json serialize:', Parsers.serialize(pjs, pjs.units).replace(/\s+/g, ' '));

  const allOk = okIndex && okTc && okCount;
  console.log('\nผลรวม: ' + (allOk ? 'ผ่านทั้งหมด' : 'มีบางส่วนไม่ผ่าน'));
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
