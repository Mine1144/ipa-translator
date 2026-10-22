# แปลไฟล์เป็นไทย (ThaiFileTranslator)

แอป iPhone ที่ **นำเข้าไฟล์ → แปลเป็นภาษาไทย → บันทึก/แชร์** ด้วย Opentyphoon (typhoon-v2.5)
รองรับ **SRT / VTT / TXT / MD / JSON** และรักษาโครงสร้างไฟล์เดิมไว้ครบ (timecode, index, path ของ JSON)

ทำงานใน **LiveContainer** ได้ (ไม่ต้อง jailbreak) และติดตั้งแยกแบบ standalone ก็ได้

---

## ความสามารถ

| ฟีเจอร์ | รายละเอียด |
|---|---|
| นำเข้าไฟล์ | เลือกผ่าน document picker ของ iOS หรือ paste ข้อความเอง |
| ตรวจจับชนิดไฟล์ | อัตโนมัติจากนามสกุล/เนื้อหา (`.srt` `.vtt` `.txt` `.md` `.json`) |
| แปลเป็นชุด | ส่งทีละ 5–40 ข้อความ พร้อม **บริบทของข้อความก่อนหน้า** → ภาษาไทยไหลลื่นข้ามบรรทัด |
| รักษาน้ำเสียง | โกรธยังโกรธ / เศร้ายังเศร้า + เลือกระดับภาษาได้ (สุภาพ/กลาง/เถาะ/เป็นทางการ/อัตโนมัติ) |
| **glossary** | คำเฉพาะที่ห้ามแปล (ชื่อเกม/ตัวละคร/เทคนิค) → ใช้กับทุกไฟล์ |
| **จำชื่อตัวละคร** | โมเดลคืนชื่อที่เจอ → แอปจำไว้ → ไฟล์ถัดไปใช้ชื่อเดิมให้อัตโนมัติ (ข้ามไฟล์/ข้ามฉาก) |
| แก้ไขเอง | ทุกบรรทัดแก้ได้ในตารางเทียบ ต้นฉบับ → คำแปล |
| แปลใหม่เฉพาะที่พลาด | ปุ่ม "แปลใหม่ที่พลาด" (ข้อความที่ error หรือยังว่าง) |
| บันทึก/แชร์ | เขียนลง Documents ของแอป (เห็นใน Files.app) + Share Sheet (AirDrop / Save to Files) |
| งานค้าง | เก็บงาน + คีย์ + ความจำชื่อไว้ในเครื่อง ปิดแอปแล้วกลับมาทำต่อได้ |

ไฟล์ที่บันทึกจะได้ชื่อแบบ `ชื่อเดิม.th.นามสกุล` (เช่น `episode01.th.srt`)

---

## โครงสร้างโปรเจกต์

```
ipa-translator/
├── www/
│   ├── index.html          UI 3 แท็บ: ไฟล์ / แปล / ตั้งค่า
│   ├── style.css
│   ├── ai.js               ตัวคุย Typhoon + translateBatch (บริบท + glossary + จำชื่อ)
│   ├── parsers.js          parse/serialize สำหรับ SRT, VTT, TXT, MD, JSON
│   ├── app.js              ตรรกะ: นำเข้า → คิวแปล → แก้ไข → บันทึก
│   └── local-config.js     ค่าเฉพาะเครื่อง (gitignored — มี API key)
├── plugins/file-tools/     native: saveFile / shareFile / listFiles / readFile / deleteFile / pickFiles
├── ios/                    โปรเจกต์ Xcode (สร้างอัตโนมัติ)
├── test/translate.test.js  ทดสอบ parse → แปล → serialize
└── .github/workflows/      CI build .ipa
```

---

## Build เป็น .ipa

```bash
npm install
npm run sync
```

ตรวจว่า native plugin ถูกผูก:
```bash
grep FileToolsPlugin ios/App/App/capacitor.config.json   # packageClassList
grep FileToolsPlugin ios/App/CapApp-SPM/Package.swift
```

### ผ่าน GitHub Actions (Windows ได้)
1. push โฟลเดอร์ `ipa-translator` ขึ้น repo (branch `main`)
2. tab **Actions** → `Build IPA (iOS)` → **Run workflow**
3. ดาวน์โหลด artifact `ios-ipa` → ได้ `ThaiFileTranslator-unsigned.ipa`

runner = `macos-26` (Xcode 26 — Capacitor 8 บังคับ Xcode 26+)

### ถ้ามี Mac
```bash
npm install && npx cap sync ios && npx cap open ios
# Product → Archive → Distribute App → Debugging (Any iOS Device)
```

---

## ติดตั้งใน LiveContainer

1. ติดตั้ง LiveContainer จาก [GitHub Releases ทางการ](https://github.com/LiveContainer/LiveContainer/releases)
2. **Settings → Import Certificate from AltStore/SideStore** → Export ใน SideStore/AltStore
3. **Settings → JIT-Less Mode Diagnose → Test JIT-Less Mode** → ต้องขึ้น *"JIT-Less Mode Test Passed"*
4. หน้าแรก → **+** → เลือก `ThaiFileTranslator-unsigned.ipa`
5. เปิดแอป → แท็บ **ตั้งค่า** → ใส่ API key (ถ้า build จาก CI จะไม่มี `local-config.js` ติดไป)

ไฟล์ที่บันทึกจะอยู่ใน **Files > แปลไฟล์ > Translations**

---

## ทดสอบ

```bash
$env:TYPHOON_KEY = "sk-xxx"
node test/translate.test.js
```
ตรวจ: parse SRT → แปลด้วย Typhoon → serialize → timecode/index ครบ → JSON/MD ด้วย

---

## ข้อจำกัด

- **คีย์ API อยู่บนเครื่อง** — ถ้าวางใน `www/local-config.js` ห้าม commit
- **คำแปลไม่ได้แก้ความหมายต้นฉบับ** — ถ้าไฟล์ต้องการคำแปล "ตรงตัว" (เช่น กฎเกม) ให้ใส่ใน glossary
- **JSON**: แปลเฉพาะค่าที่เป็น string (ตัวเลข/boolean ไม่แตะ) และคงโครงสร้าง/ลำดับคีย์เดิม
- **SRT**: คง index และ timecode ไว้ตามเดิม แต่ข้อความหลายบรรทัดในบล็อกเดียวถูกรวมเป็นชิ้นเดียวตอนแปล (ถ้าต้องการแยกบรรทัดให้แปลทีละบรรทัด ต้องปรับเพิ่ม)
- **ความเร็ว**: ประมาณ 1 คำขอต่อ 15 ข้อความ (default) — ลด batch ถ้าตอบกลับไม่ครบจำนวน
- แอปนี้ยังไม่เคยถูก compile (ต้องมี macOS) — CI เป็นครั้งแรก ถ้า Swift error ให้ส่ง log มาแก้ได้
