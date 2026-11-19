export const migration004 = {
  version: 4,
  name: '004_ics_audit_assistant',
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS inspection_checklists(
      id INTEGER PRIMARY KEY,
      standard_code TEXT NOT NULL CHECK(standard_code IN ('PGS','EU_ORGANIC','FAIRTRADE')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL,
      validation_status TEXT NOT NULL DEFAULT 'draft_unvalidated' CHECK(validation_status IN ('draft_unvalidated','validated')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_inspection_checklists_std ON inspection_checklists(standard_code, is_active);

    CREATE TABLE IF NOT EXISTS review_assessments(
      review_id INTEGER PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
      standard_code TEXT NOT NULL CHECK(standard_code IN ('PGS','EU_ORGANIC','FAIRTRADE')),
      checklist_id INTEGER REFERENCES inspection_checklists(id),
      checklist_results_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_review_assessments_std ON review_assessments(standard_code);

    CREATE TABLE IF NOT EXISTS corrective_actions(
      id INTEGER PRIMARY KEY,
      plot_id INTEGER NOT NULL REFERENCES plots(id),
      review_id INTEGER REFERENCES reviews(id) ON DELETE SET NULL,
      standard_code TEXT NOT NULL DEFAULT 'PGS' CHECK(standard_code IN ('PGS','EU_ORGANIC','FAIRTRADE')),
      severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high')),
      finding TEXT NOT NULL,
      action_required TEXT NOT NULL,
      responsible_user_id INTEGER NOT NULL REFERENCES users(id),
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
      resolution_note TEXT NOT NULL DEFAULT '',
      resolved_at TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_corrective_actions_plot ON corrective_actions(plot_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_corrective_actions_review ON corrective_actions(review_id);
    CREATE INDEX IF NOT EXISTS idx_corrective_actions_due ON corrective_actions(status, due_date);

    INSERT INTO inspection_checklists(standard_code, title, description, items_json, validation_status)
    SELECT
      'PGS',
      'รายการตรวจภายใน PGS (ร่างโครงสร้าง — รอการยืนยันเกณฑ์)',
      'โครงสร้างรายการตรวจภายในกลุ่ม PGS สำหรับติดตามการปฏิบัติงานในแปลง ไม่ใช่การรับรองมาตรฐานอย่างเป็นทางการ',
      '[{"key":"pgs_buffer_zone","label":"ตรวจแนวกันชนรอบแปลงและป้องกันการปนเปื้อนจากแปลงข้างเคียง","required":true},{"key":"pgs_no_synthetic","label":"ไม่พบการใช้สารเคมีสังเคราะห์หรือสารต้องห้ามในแปลง","required":true},{"key":"pgs_input_approved","label":"ปัจจัยการผลิตที่ใช้ผ่านการอนุมัติล่วงหน้าจาก ICS แล้ว","required":true},{"key":"pgs_activity_log","label":"เกษตรกรบันทึกกิจกรรมสม่ำเสมอและสอดคล้องกับสภาพแปลงจริง","required":false}]',
      'draft_unvalidated'
    WHERE NOT EXISTS (SELECT 1 FROM inspection_checklists WHERE standard_code='PGS');

    INSERT INTO inspection_checklists(standard_code, title, description, items_json, validation_status)
    SELECT
      'EU_ORGANIC',
      'รายการตรวจภายใน EU Organic (ร่างโครงสร้าง — รอการยืนยันเกณฑ์)',
      'โครงสร้างรายการตรวจภายในแยกตามหมวดหมู่ EU Organic อยู่ระหว่างรอการยืนยันเกณฑ์จากผู้ตรวจรับรองภายนอก',
      '[{"key":"eu_conversion_period","label":"ตรวจบันทึกประวัติระยะปรับเปลี่ยนและการแยกพื้นที่ปลูกตามรอบการผลิต","required":true},{"key":"eu_segregation","label":"การแยกจัดเก็บผลผลิตและเครื่องมือไม่ปะปนกับผลผลิตเคมี","required":true},{"key":"eu_traceable_inputs","label":"เอกสารที่มาและสัดส่วนปัจจัยการผลิตสามารถตรวจสอบย้อนกลับได้","required":true},{"key":"eu_evidence_records","label":"มีภาพหลักฐานและบันทึกกิจกรรมรองรับรอบการตรวจ","required":false}]',
      'draft_unvalidated'
    WHERE NOT EXISTS (SELECT 1 FROM inspection_checklists WHERE standard_code='EU_ORGANIC');

    INSERT INTO inspection_checklists(standard_code, title, description, items_json, validation_status)
    SELECT
      'FAIRTRADE',
      'รายการตรวจภายใน Fairtrade (ร่างโครงสร้าง — รอการยืนยันเกณฑ์)',
      'โครงสร้างรายการตรวจภายในแยกตามหมวดหมู่ Fairtrade อยู่ระหว่างรอการยืนยันเกณฑ์จากผู้ตรวจรับรองภายนอก',
      '[{"key":"ft_member_consent","label":"บันทึกความโปร่งใสและการมีส่วนร่วมของสมาชิกในกลุ่ม","required":true},{"key":"ft_labor_safety","label":"สภาพการทำงานและความปลอดภัยของแรงงานในแปลงเป็นไปตามข้อตกลงกลุ่ม","required":true},{"key":"ft_premium_record","label":"บันทึกปริมาณผลผลิตและการส่งมอบเพื่อตรวจย้อนกลับระดับกลุ่ม","required":false}]',
      'draft_unvalidated'
    WHERE NOT EXISTS (SELECT 1 FROM inspection_checklists WHERE standard_code='FAIRTRADE');`);
  },
};
