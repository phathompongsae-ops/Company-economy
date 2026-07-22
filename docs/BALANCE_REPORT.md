# God Brave — Balance Checkpoints v1

วันที่ตรวจ: 22 กรกฎาคม 2026

เครื่องมือ: deterministic simulation จาก `src/core.js` เรียกด้วย `scripts/balance.mjs` ทุกค่าด้านล่างมาจาก logic เดียวกับ browser game ไม่มี combat model แยก

## Checkpoint 1 — Basic combat playable

รอบแรก 50 seeds ชนะ 100% ทุก composition และปาร์ตี้โจมตีล้วนจบเร็วกว่าทีมสมดุลมาก จัดเป็น balance issue ไม่ใช่ bug แก้เฉพาะ HP ศัตรูประมาณ +11% และ attack curve ประมาณ +15% แล้วทดสอบใหม่ ระบบโจมตี, heal, KO, victory และ defeat ทำงานครบ

## Checkpoint 2 — Six classes

ทดสอบทั้ง 6 อาชีพผ่าน 5 presets ไม่พบ class ที่ไม่ทำงาน ผู้พิทักษ์รับ Brave จากการโดนโจมตี, นักรบจาก attack/break, เรนเจอร์และจอมโจรจาก critical/evasion, จอมเวทจาก skill damage, นักบวชจาก healing

- Priest ไม่บังคับ: ชุดจู่โจมเกจเบรกและบุกเร็วที่ไม่มี Priest ยังผ่านได้
- Guardian ไม่อมตะและไม่บังคับ: ชุดบุกเร็วไม่มี Guardian มีโอกาสแพ้บอสสุดท้าย 10–13%
- Mage ไม่ครองเกม: ชุดเวทระเบิดใช้เวลาเฉลี่ย 127.0 วินาที ช้ากว่าชุด break/rush
- Rogue มีความเร็วสูงแต่แลกกับความเสี่ยงของทีมที่ไม่มีแทงก์/ฮีล

## Checkpoint 3 — Equipment and skill points

loot เดิมตกทุกชั้นจึงเร็วเกินสำหรับ run สั้น แก้เป็นโอกาส 70% ในชั้นปกติและการันตี boss floor อุปกรณ์มี 4 tiers, 3 slots และ role-weighted auto-equip แต้มสกิลได้ที่ทุก checkpoint และจำกัด 3 rank/branch

## Checkpoint 4 — Floors 1–10

หลาย seed ผ่าน flow ชั้นปกติ → Mini Boss 5 → checkpoint → Mini Boss 10 พร้อมการฟื้น HP แบบบางส่วน ไม่พบ save corruption, floor skip หรือ checkpoint ซ้ำ

## Checkpoint 5 — Full 20-floor dungeon

Regression test ยืนยัน 20 battles, 3 strategy checkpoints หลังชั้น 5/10/15 และจบที่ชั้น 20 เสมอ ไม่มีชั้น 21

## Checkpoint 6 — Boss randomization

Final Boss เลือกจาก controlled pool เท่านั้น: มังกรเพลิงคราม, พยากรณ์แห่งสุญญะ และโกเลมแกนโลก seed เดิมให้ผลเดิม และชุดทดสอบหลาย seed พบมากกว่าหนึ่งบอส

## Checkpoint 7 — Auto-run and Tactical Auto

ทดสอบ Tactical Auto เทียบ Full Auto 100 seeds × 5 compositions ต่อ mode รวม 1,000 runs ทั้งสอง mode เล่นจบได้ ไม่พบ Break-lock และ Brave Arts ไม่ยิงถี่ไม่จำกัด Tactical Auto ของทีมบุกเร็วชนะ 90/100 เทียบ Full Auto 87/100 จึงให้ความปลอดภัยเพิ่มเล็กน้อย แต่ Full Auto ยังใช้งานได้

## Checkpoint 8 — Final vertical slice matrix

| Mode | Party | Wins | Avg time | Avg Break | Avg Brave Arts |
|---|---|---:|---:|---:|---:|
| Tactical | สมดุล | 100/100 | 128.2s | 30.6 | 11.8 |
| Tactical | จู่โจมเกจเบรก | 100/100 | 97.7s | 27.7 | 8.9 |
| Tactical | เวทระเบิด | 100/100 | 127.0s | 7.1 | 10.0 |
| Tactical | บุกเร็ว | 90/100 | 84.8s | 16.8 | 4.6 |
| Tactical | แนวรับ | 100/100 | 130.3s | 30.2 | 11.4 |
| Full Auto | สมดุล | 100/100 | 127.6s | 31.9 | 13.5 |
| Full Auto | จู่โจมเกจเบรก | 100/100 | 97.1s | 28.5 | 9.3 |
| Full Auto | เวทระเบิด | 100/100 | 125.9s | 6.8 | 11.3 |
| Full Auto | บุกเร็ว | 87/100 | 84.6s | 16.7 | 4.7 |
| Full Auto | แนวรับ | 100/100 | 128.1s | 31.4 | 13.1 |

ผล: ไม่มีองค์ประกอบต้องเลือกแบบบังคับ ไม่มี boss roll นอก pool และทุก strategy มี trade-off ที่มองเห็นได้ ชุด break/rush เร็วกว่าชัดเจน แต่ rush เสี่ยงพ่ายแพ้ ส่วนชุดสมดุล/แนวรับช้ากว่าแต่เสถียร Vertical slice ตั้งใจให้ผ่านได้ค่อนข้างสูงเพื่อแสดงระบบครบ 20 ชั้น; difficulty mode ระยะยาวอยู่นอก scope v1
