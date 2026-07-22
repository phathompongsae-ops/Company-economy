# God Brave — Vertical Slice Architecture v1

## ขอบเขตที่เล่นได้

- จัดปาร์ตี้ 4 คนจาก 6 อาชีพ: ผู้พิทักษ์, นักรบ, เรนเจอร์, จอมโจร, จอมเวท, นักบวช
- เปลี่ยน formation แนวหน้า/แนวหลังที่จุดวางแผน
- ต่อสู้อัตโนมัติด้านข้าง 20 ชั้น จุดวางแผนหลังชั้น 5, 10 และ 15
- Mini Boss ชั้น 5/10/15 และ Final Boss ชั้น 20 ที่สุ่มแบบ deterministic จาก 3 ตัว
- Tactical Auto 4 แผน, Full Auto, ความเร็ว ×1/×2/×4, auto-run และหน้าต่างต่อสู้ย่อ/เต็ม
- Break Gauge, สถานะ Break, Brave generation ตามบทบาท และ Brave Arts เฉพาะอาชีพ
- loot อุปกรณ์ 3 ช่อง, auto-equip ตาม role score, progression 4 tiers
- แต้มสกิล 3 สายต่อฮีโร่และพรชั่วคราว 6 แบบ
- save/load ผ่าน localStorage รวมถึงสถานะกลางการต่อสู้
- victory, defeat, retreat และ replay ด้วย seed เดิม
- secret registry แยก class/item/encounter พร้อมเงื่อนไขและสถานะ unlock

## การแบ่งชั้น

- `src/data.js`: ข้อมูลอาชีพ, แผน, พร, ไอเทม, encounter และ secret registry
- `src/core.js`: deterministic state machine และ combat simulation ไม่มี DOM/Canvas
- `src/app.js`: UI, local save, auto-run orchestration และ Canvas renderer
- `tests/game.test.mjs`: contract และ regression tests
- `scripts/balance.mjs`: simulation matrix หลาย seed/party/mode

## VFX toolkit

renderer ใช้ส่วนประกอบวาดด้วยโค้ดที่นำกลับมาใช้ซ้ำ: slash arc, impact ring, shockwave, pixel body, damage label, Weak/Critical/Break label, hit flash, hit-stop-like event emphasis, camera shake และ brief Brave tint โดยไม่คัดลอก sprite, UI, ชื่อสกิล, effect หรือเสียงจากเกมเชิงพาณิชย์

## Save contract

บันทึกมี `version: 1`, seed, RNG state, party, formation, progression, inventory, blessings, battle snapshot, statistics และ unlocks การโหลดตรวจ version และปาร์ตี้ก่อนคืน state
