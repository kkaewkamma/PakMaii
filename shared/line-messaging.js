/**
 * PakMaii - Real LINE Messaging API Push Notifications & Message Builders
 *
 * Implements server-side notification generation for:
 * 1. New input approval request -> Assigned ICS officer
 * 2. Request approved -> Requesting Farmer
 * 3. Request rejected -> Requesting Farmer with rejection reason
 * 4. 14-day rhythm overdue -> Farmer
 * 5. CAPA deadline approaching -> Responsible user
 */

export const LINE_EVENT_TYPES = Object.freeze({
  INPUT_SUBMITTED: 'input_request_submitted',
  APPROVAL_APPROVED: 'approval_approved',
  APPROVAL_REJECTED: 'approval_rejected',
  RHYTHM_OVERDUE: 'rhythm_overdue_14d',
  CAPA_DEADLINE: 'capa_deadline'
});

/**
 * Standard Quick Reply chips for LINE OA chat conversations.
 * Enables quick one-tap agricultural guidance for farmers and ICS officers
 * without touching or modifying the Rich Menu.
 */
export const PAKMAII_QUICK_REPLIES = Object.freeze({
  items: [
    { type: 'action', action: { type: 'message', label: '🌾 สถานะแปลง', text: 'สถานะแปลง' } },
    { type: 'action', action: { type: 'message', label: '🧪 สูตรปุ๋ยหมัก', text: 'สูตรปุ๋ย' } },
    { type: 'action', action: { type: 'message', label: '⚠️ ข้อห้าม PGS', text: 'ข้อห้าม' } },
    { type: 'action', action: { type: 'message', label: '💧 ธนาคารน้ำ', text: 'ธนาคารน้ำ' } },
    { type: 'action', action: { type: 'message', label: '🎙️ บันทึกด้วยเสียง', text: 'บันทึกด้วยเสียง' } },
    { type: 'action', action: { type: 'message', label: '📞 ติดต่อ ICS', text: 'ติดต่อเจ้าหน้าที่' } }
  ]
});

/**
 * Builds rich, domain-specific chat auto-replies for Tambon Phak Mai organic agriculture.
 * Provides answers for recipes, PGS standards, groundwater banking, voice input, and plot status.
 */
export function buildChatAutoReply(userMsg, { liffId = '', lineUserId = '' } = {}) {
  const msg = (userMsg || '').trim();
  const liffUrl = liffId ? `https://liff.line.me/${liffId}` : '';

  // 1. Technical / Account Binding & IDs
  if (/^ไอดี$|^myid$|^id$/i.test(msg)) {
    return {
      type: 'id_query',
      text: [
        '🆔 รหัส LINE User ID ของคุณคือ:',
        lineUserId || 'ไม่พบ ID',
        '',
        '💡 วิธีเปิดรับแจ้งเตือน Realtime:',
        '• พิมพ์ "ผูก ics" เพื่อรับแจ้งเตือนเมื่อมีคำขอใหม่',
        '• พิมพ์ "ผูก เกษตรกร" เพื่อรับแจ้งเตือนผลการอนุมัติ'
      ].join('\n')
    };
  }

  if (/^ผูก\s*ics$|^ผูกบัญชี\s*ics$/i.test(msg)) {
    return {
      type: 'bind_ics',
      text: [
        '✅ ผูกบัญชี LINE กับ "คุณวิชัย ผักไหม (เจ้าหน้าที่ ICS)" สำเร็จแล้ว!',
        '',
        'จากนี้เมื่อเกษตรกรส่งคำขอใช้ปุ๋ย/ปัจจัยการผลิต ระบบจะส่งข้อความแจ้งเตือนมาที่นี่แบบ Real-time ทันทีครับ 🔔'
      ].join('\n')
    };
  }

  if (/^ผูก\s*เกษตรกร$|^ผูกบัญชี\s*เกษตรกร$/i.test(msg)) {
    return {
      type: 'bind_farmer',
      text: [
        '✅ ผูกบัญชี LINE กับ "คุณสมปอง คำภา (เกษตรกร)" สำเร็จแล้ว!',
        '',
        'จากนี้เมื่อเจ้าหน้าที่ ICS อนุมัติหรือปฏิเสธคำขอ ระบบจะส่งข้อความแจ้งเตือนผลมาที่นี่แบบ Real-time ทันทีครับ 🔔'
      ].join('\n')
    };
  }

  if (/เตือนแปลง|เตือนบันทึก|เตือนเกษตรกร|ลืมบันทึก|remind/i.test(msg)) {
    return {
      type: 'scan_remind',
      text: '' // dynamic scan result will be populated by server/worker
    };
  }

  // 2. New Rich Agricultural Topics:
  // Topic A: สูตรปุ๋ยอินทรีย์ & น้ำหมักชีวภาพ PGS
  if (/สูตร|ปุ๋ยหมัก|น้ำหมัก|แหนแดง|สะเดา|ปุ๋ยชีวภาพ|ฮอร์โมนไข่/i.test(msg)) {
    return {
      type: 'recipe',
      text: [
        '🌿 สูตรปุ๋ยหมัก & น้ำหมักชีวภาพ (มาตรฐาน PGS ผักไหม)',
        '────────────────────────',
        '1️⃣ ปุ๋ยหมักแหนแดง (ไนโตรเจนสูง เร่งการแตกกอ):',
        '• แหนแดงสด 3 ส่วน + มูลสัตว์แห้ง 1 ส่วน + แกลบดิบ 1 ส่วน',
        '• ผสมน้ำหมักชีวภาพ พด.1 หมักกลับกอง 15-21 วัน',
        '• ใช้บำรุงข้าวช่วงอายุ 20-45 วัน อัตรา 50 กก./ไร่',
        '',
        '2️⃣ น้ำหมักสะเดาไล่แมลง (ป้องกันเพลี้ย/หนอนกอ):',
        '• ใบ/เมล็ดสะเดาแก่ 3 กก. + ข่าแก่ 1 กก. + ตะไคร้หอม 1 กก. + กากน้ำตาล 1 กก. + น้ำ 20 ลิตร',
        '• หมักในที่ร่ม 7 วัน อัตราใช้: 50-100 ซีซี ต่อน้ำ 20 ลิตร ฉีดพ่นช่วงเย็น',
        '────────────────────────',
        '💡 ทำเสร็จแล้วอย่าลืมถ่ายรูปและยื่นคำขอรับรองในระบบก่อนใช้นะครับ'
      ].join('\n')
    };
  }

  // Topic B: สารต้องห้าม & ข้อกำหนดมาตรฐาน PGS
  if (/สารต้องห้าม|ข้อห้าม|ยาฆ่าหญ้า|เคมี|ทำไมไม่ผ่าน|สารเคมี|เกณฑ์/i.test(msg)) {
    return {
      type: 'prohibited_standards',
      text: [
        '⚠️ 5 ข้อห้ามเด็ดขาดตามมาตรฐาน PGS ผักไหม',
        '────────────────────────',
        '1. ห้ามใช้ยาฆ่าหญ้า/สารกำจัดวัชพืชเคมีทุกชนิด (เช่น พาราควอต, ไกลโฟเสต)',
        '2. ห้ามใช้ปุ๋ยเคมีสังเคราะห์ทุกสูตร (ยูเรีย, 16-20-0, 15-15-15 ฯลฯ)',
        '3. ห้ามใช้สารเคมีสังเคราะห์กำจัดแมลงและโรคพืช',
        '4. ห้ามเผาตอซังหรือฟางข้าวในแปลง (ต้องไถกลบหรือหมักย่อยสลาย)',
        '5. แปลงต้องมีแนวกันชน (Buffer Zone) ห่างจากแปลงเคมีอย่างน้อย 1-3 เมตร',
        '────────────────────────',
        '🛡️ รักษาความบริสุทธิ์ของแปลงเพื่อคงสถานะรับรองมาตรฐานอินทรีย์'
      ].join('\n')
    };
  }

  // Topic C: ธนาคารน้ำใต้ดิน & ปฏิทินรอบปลูกข้าว
  if (/ธนาคารน้ำ|น้ำใต้ดิน|ปฏิทิน|รอบปลูก|น้ำแล้ง|ระบบน้ำ/i.test(msg)) {
    return {
      type: 'water_bank_calendar',
      text: [
        '💧 ธนาคารน้ำใต้ดิน & ปฏิทินเกษตรอินทรีย์ผักไหม',
        '────────────────────────',
        '🌧️ ระบบธนาคารน้ำใต้ดิน (ระบบปิด):',
        '• ขุดบ่อดักน้ำลึก 1.5-2 เมตร ใส่หิน/ยางรถยนต์ เพื่อเติมน้ำฝนลงชั้นบาดาล',
        '• ช่วยแก้ปัญหาน้ำท่วมขังในฤดูฝน และกักเก็บความชื้นในดินช่วงหน้าแล้ง',
        '',
        '📅 รอบปฏิทินปลูกข้าวหอมมะลิ 105 อินทรีย์:',
        '• พ.ค.-มิ.ย. : ไถกลบตอซัง + หว่านปอเทืองปรับปรุงโครงสร้างดิน',
        '• ก.ค.-ส.ค. : ดำ/หว่านข้าว เติมปุ๋ยหมักแหนแดงรองพื้น',
        '• ก.ย.-ต.ค. : รักษาระดับน้ำ ฉีดพ่นน้ำหมักสมุนไพรไล่แมลง',
        '• พ.ย.-ธ.ค. : ระบายน้ำออกก่อนเกี่ยว 10-15 วัน เก็บเกี่ยวข้าวคุณภาพสูง'
      ].join('\n')
    };
  }

  // Topic D: ระบบบันทึกแปลงด้วยเสียง Smart Voice Assistant
  if (/เสียง|พูด|พิมพ์ด้วยเสียง|voice/i.test(msg)) {
    return {
      type: 'voice_guide',
      text: [
        '🎙️ ระบบบันทึกแปลงด้วยเสียง (Smart Voice Assistant)',
        '────────────────────────',
        'ใช้งานง่าย ไม่ต้องพิมพ์ เพียงกดปุ่มไมโครโฟนสีทอง 🎙️ ในแอปแล้วพูด:',
        '',
        '🗣️ ตัวอย่างประโยคที่พูดได้ทันที:',
        '• "วันนี้ใส่ปุ๋ยหมักแหนแดง 50 กิโลกรัม ที่แปลง A-03"',
        '• "พรวนดินกำจัดวัชพืชและเติมน้ำจากธนาคารน้ำ 100 ลิตร"',
        '• "ฉีดพ่นน้ำหมักสะเดาไล่เพลี้ย 20 ลิตร ที่แปลง B-01"',
        '• "หว่านปอเทือง 10 กิโลกรัม เพื่อปรับปรุงดิน"',
        '────────────────────────',
        '⚡ ระบบจะแยกแยะ แปลง, กิจกรรม, ปัจจัย และปริมาณลงฟิลด์ให้ทันที!'
      ].join('\n')
    };
  }

  // Topic E: คู่มือการใช้งานระบบ
  if (/คู่มือ|วิธีใช้งาน|help|เริ่มต้น|สอนใช้/i.test(msg)) {
    return {
      type: 'user_guide',
      text: [
        '📖 5 ขั้นตอนง่ายๆ ในการใช้งานระบบผักไหม',
        '────────────────────────',
        '1. แตะเมนู "บันทึกแปลง" บนเมนูด้านล่างของแชท',
        '2. เลือกแปลง หรือแตะไอคอน 🎙️ เพื่อพูดบันทึกกิจกรรม',
        '3. แนบรูปถ่ายการทำงานจริงเป็นหลักฐานตรวจสอบย้อนกลับ',
        '4. ยื่นคำขออนุมัติล่วงหน้าก่อนนำปัจจัยการผลิตใหม่มาใช้',
        '5. ตรวจสอบสถานะแปลงและผลตรวจประเมิน PGS ได้ตลอด 24 ชม.',
        '────────────────────────',
        liffUrl ? `🔗 เข้าสู่ระบบได้ที่: ${liffUrl}` : '💡 แตะเมนูลัดด้านล่างเพื่อเริ่มใช้งาน'
      ].join('\n')
    };
  }

  // Topic F: คำขอใช้ปัจจัย
  if (/คำขอ|approval|ปัจจัย/i.test(msg)) {
    return {
      type: 'approval_status',
      text: [
        '🌱 ตรวจสอบสถานะคำขอใช้ปัจจัยการผลิต:',
        '────────────────────────',
        '• คุณมีคำขอใช้ปัจจัยรอพิจารณาในระบบ',
        '• เจ้าหน้าที่ ICS กำลังตรวจสอบความสอดคล้องตามเกณฑ์อินทรีย์',
        liffUrl ? `\n🔗 ตรวจสอบรายละเอียด: ${liffUrl}?tab=approval` : ''
      ].filter(Boolean).join('\n')
    };
  }

  // Topic G: แปลง / สถานะ
  if (/แปลง|สถานะ|plot/i.test(msg)) {
    return {
      type: 'plot_summary',
      text: [
        '🌾 สรุปสถานะแปลงเกษตรอินทรีย์ ผักไหม:',
        '────────────────────────',
        '• แปลง A-03 ข้าวหอมมะลิ 105 (ระยะปรับเปลี่ยนปีที่ 2)',
        '• บันทึกสม่ำเสมอตามเกณฑ์ PGS ทุก 14 วัน',
        '• ดินมีความอุดมสมบูรณ์และมีการจัดการแนวกันชนเรียบร้อย',
        liffUrl ? `\n🔗 ดูประวัติแปลง: ${liffUrl}?tab=record` : ''
      ].filter(Boolean).join('\n')
    };
  }

  // Topic H: บันทึกกิจกรรม
  if (/บันทึก|กิจกรรม/i.test(msg)) {
    return {
      type: 'record_link',
      text: [
        '📝 บันทึกกิจกรรมแปลงเกษตรอินทรีย์:',
        '────────────────────────',
        '• รองรับการบันทึกทั้งการพิมพ์และการพูดด้วยเสียง 🎙️',
        '• บันทึกได้แม้ไม่มีสัญญาณอินเทอร์เน็ต (Offline-First)',
        liffUrl ? `\n🔗 แตะเพื่อเปิดหน้าบันทึก: ${liffUrl}?tab=record` : ''
      ].filter(Boolean).join('\n')
    };
  }

  // Topic I: ผลตรวจแปลง PGS
  if (/ตรวจ|ผลตรวจ|pgs/i.test(msg)) {
    return {
      type: 'inspection_status',
      text: [
        '🛡️ ผลตรวจประเมินแปลงล่าสุด:',
        '────────────────────────',
        '• ผลการประเมิน: ผ่านเกณฑ์มาตรฐานเกษตรอินทรีย์แบบมีส่วนร่วม (PGS ผักไหม)',
        '• สถานะเอกสาร: ครบถ้วน ไม่พบข้อบกพร่องวิกฤต',
        liffUrl ? `\n🔗 ดูรายงานการตรวจ: ${liffUrl}?tab=reviews` : ''
      ].filter(Boolean).join('\n')
    };
  }

  // Topic J: ติดต่อเจ้าหน้าที่ ICS
  if (/ics|เจ้าหน้าที่|ติดต่อ/i.test(msg)) {
    return {
      type: 'contact_ics',
      text: [
        '🧑‍🌾 ข้อมูลติดต่อเจ้าหน้าที่ ICS ประจำกลุ่มผักไหม:',
        '────────────────────────',
        '• เจ้าหน้าที่ผู้รับผิดชอบ: คุณวิชัย ผักไหม (หัวหน้าทีม ICS)',
        '• เบอร์โทรศัพท์: 081-234-5678',
        '• ที่ทำการ: วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ',
        '• เวลาทำการ: จันทร์ - ศุกร์ 08:30 - 16:30 น.'
      ].join('\n')
    };
  }

  // Default welcome message
  return {
    type: 'default_welcome',
    text: [
      '🌱 ระบบบริหารมาตรฐานเกษตรอินทรีย์ตำบลผักไหม ยินดีให้บริการครับ',
      '────────────────────────',
      'ท่านสามารถพิมพ์คำถามหรือแตะเมนูด่วนด้านล่างได้ทันที เช่น:',
      '• "สูตรปุ๋ย" - ดูสูตรปุ๋ยหมักแหนแดง & น้ำหมักสะเดา',
      '• "ข้อห้าม" - ดู 5 สารต้องห้ามตามเกณฑ์ PGS',
      '• "ธนาคารน้ำ" - ดูเทคนิคธนาคารน้ำใต้ดิน & ปฏิทินปลูก',
      '• "บันทึกด้วยเสียง" - ดูวิธีพูดบันทึกแปลงอัจฉริยะ',
      '• "สถานะแปลง" - เช็คสถานะการรับรองแปลง'
    ].join('\n')
  };
}

/**
 * 1. Build notification for assigned ICS officer when farmer submits an input request
 */
export function buildInputSubmittedMessage({ farmerName, plotName, inputName, details, liffId }) {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=approval` : '';
  const lines = [
    '📋 มีคำขอใช้ปัจจัยการผลิตใหม่ (รอการพิจารณา)',
    '────────────────────────',
    `เกษตรกร: ${farmerName || 'เกษตรกรในความดูแล'}`,
    `แปลง: ${plotName || '-'}`,
    `ปัจจัยการผลิต: ${inputName}`,
    `รายละเอียด: ${details || '-'}`,
    '────────────────────────',
    'กรุณาตรวจสอบความสอดคล้องตามเกณฑ์มาตรฐานอินทรีย์ และบันทึกผลการพิจารณาในระบบ ICS'
  ];
  if (liffUrl) lines.push(`\n🔗 แตะเพื่อพิจารณาคำขอ: ${liffUrl}`);

  return [{
    type: 'text',
    text: lines.join('\n')
  }];
}

/**
 * 2. Build notification for farmer when input request is approved
 */
export function buildApprovalApprovedMessage({ plotName, inputName, comment, liffId }) {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=approval` : '';
  const lines = [
    '✅ คำขอใช้ปัจจัยการผลิตได้รับการอนุมัติ',
    '────────────────────────',
    `แปลง: ${plotName || '-'}`,
    `ปัจจัยการผลิต: ${inputName}`,
    `สถานะ: อนุมัติแล้ว (ผ่านเกณฑ์มาตรฐานอินทรีย์)`
  ];
  if (comment) {
    lines.push(`ความเห็นเจ้าหน้าที่: ${comment}`);
  }
  lines.push('────────────────────────');
  lines.push('ท่านสามารถนำปัจจัยการผลิตนี้ไปใช้ในแปลง และอย่าลืมบันทึกกิจกรรมหลังใช้งานครับ');
  if (liffUrl) lines.push(`\n🔗 ตรวจสอบรายละเอียด: ${liffUrl}`);

  return [{
    type: 'text',
    text: lines.join('\n')
  }];
}

/**
 * 3. Build notification for farmer when input request is rejected with reason
 */
export function buildApprovalRejectedMessage({ plotName, inputName, reason, liffId }) {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=approval` : '';
  const lines = [
    '❌ คำขอใช้ปัจจัยการผลิตไม่ผ่านการอนุมัติ',
    '────────────────────────',
    `แปลง: ${plotName || '-'}`,
    `ปัจจัยการผลิต: ${inputName}`,
    `สถานะ: ไม่อนุมัติ`,
    `เหตุผล: ${reason || 'ส่วนประกอบไม่สอดคล้องกับมาตรฐานเกษตรอินทรีย์'}`,
    '────────────────────────',
    'คำแนะนำ: ท่านสามารถปรับปรุงสูตรหรือสอบถามแนวทางแก้ไขจากเจ้าหน้าที่ ICS ประจำกลุ่มได้ครับ'
  ];
  if (liffUrl) lines.push(`\n🔗 ส่งคำขอใหม่: ${liffUrl}`);

  return [{
    type: 'text',
    text: lines.join('\n')
  }];
}

/**
 * 4. Build notification for farmer when plot has no activity recorded for > 14 days
 */
export function buildRhythmOverdueMessage({ farmerName, plotName, daysInactive = 14, liffId }) {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=record` : '';
  const lines = [
    '⏰ แจ้งเตือนรอบบันทึกกิจกรรมแปลง 14 วัน',
    '────────────────────────',
    `สวัสดีครับ คุณ${farmerName || 'สมาชิกเกษตรกร'}`,
    `แปลง: ${plotName || '-'}`,
    `สถานะ: ไม่พบบันทึกกิจกรรมเกิน ${daysInactive} วัน`,
    '────────────────────────',
    'การบันทึกการดูแลแปลงสม่ำเสมอเป็นข้อกำหนดสำคัญตามมาตรฐาน PGS ผักไหม',
    'กรุณาบันทึกกิจกรรมล่าสุดเพื่อรักษาความต่อเนื่องของประวัติแปลงครับ'
  ];
  if (liffUrl) lines.push(`\n📝 แตะเพื่อบันทึกแปลงทันที: ${liffUrl}`);

  return [{
    type: 'text',
    text: lines.join('\n')
  }];
}

/**
 * 5. Build notification for responsible user when CAPA corrective action deadline is approaching
 */
export function buildCapaDeadlineMessage({ responsibleName, plotName, standardCode = 'PGS', finding, actionRequired, dueDate, liffId }) {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=reviews` : '';
  const lines = [
    '⚠️ แจ้งเตือนกำหนดส่งงานแก้ไขปรับปรุง (CAPA)',
    '────────────────────────',
    `ผู้รับผิดชอบ: ${responsibleName || 'สมาชิกที่ได้รับมอบหมาย'}`,
    `แปลง: ${plotName || '-'} (มาตรฐาน ${standardCode})`,
    `ข้อบกพร่อง: ${finding || '-'}`,
    `สิ่งที่ต้องดำเนินการ: ${actionRequired || '-'}`,
    `วันครบกำหนด: ${dueDate}`,
    '────────────────────────',
    'กรุณาดำเนินการแก้ไขและประสานเจ้าหน้าที่ ICS เพื่อตรวจประเมินซ้ำตามกำหนดเวลาครับ'
  ];
  if (liffUrl) lines.push(`\n📋 ตรวจสอบรายการ CAPA: ${liffUrl}`);

  return [{
    type: 'text',
    text: lines.join('\n')
  }];
}

/**
 * Issue a Channel Access Token (v2.1) dynamically using Channel ID & Channel Secret
 * Endpoint: POST https://api.line.me/v2/oauth/accessToken
 */
let cachedTokenInfo = { token: null, expiresAt: 0 };

export async function fetchChannelAccessToken({
  channelId,
  channelSecret,
  fetchImpl = globalThis.fetch
}) {
  if (!channelId || !channelSecret) return null;

  // Check cached token validity (with 5-minute safety buffer)
  const now = Date.now();
  if (cachedTokenInfo.token && cachedTokenInfo.expiresAt > now + 300000) {
    return cachedTokenInfo.token;
  }

  // Dry-run mode for tests
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test' && !process.env?.FORCE_LINE_REAL_PUSH;
  const isCustomFetch = fetchImpl && fetchImpl !== globalThis.fetch;
  if (isTest && !isCustomFetch) {
    return 'mock-auto-generated-access-token';
  }

  try {
    const response = await fetchImpl('https://api.line.me/v2/oauth/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: String(channelId),
        client_secret: String(channelSecret)
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Failed to issue LINE access token:', response.status, err);
      return null;
    }

    const data = await response.json();
    if (data.access_token) {
      cachedTokenInfo = {
        token: data.access_token,
        expiresAt: now + (Number(data.expires_in) || 2592000) * 1000
      };
      return data.access_token;
    }
    return null;
  } catch (error) {
    console.error('Error fetching LINE channel access token:', error);
    return null;
  }
}

/**
 * Send reply message via official LINE Messaging API
 * Endpoint: POST https://api.line.me/v2/bot/message/reply
 */
export async function sendLineReplyMessage({
  channelAccessToken,
  replyToken,
  messages,
  fetchImpl = globalThis.fetch
}) {
  if (!replyToken || !Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'INVALID_ARGUMENTS' };
  }
  if (!channelAccessToken) {
    return { ok: true, status: 'skipped_no_token' };
  }

  const endpoint = 'https://api.line.me/v2/bot/message/reply';
  const payload = JSON.stringify({ replyToken, messages });

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`
      },
      body: payload
    });

    if (response.ok) {
      return { ok: true, status: 'replied' };
    }
    const errText = await response.text().catch(() => '');
    console.error('LINE reply error:', response.status, errText);
    return { ok: false, status: 'failed', error: errText };
  } catch (err) {
    console.error('LINE reply network error:', err);
    return { ok: false, status: 'error', error: err.message };
  }
}
export async function sendLinePushMessage({
  channelAccessToken,
  to,
  messages,
  fetchImpl,
  maxRetries = 2
}) {
  if (!to || !Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'INVALID_ARGUMENTS', details: 'Missing recipient "to" or empty "messages"' };
  }

  // Dry-run mode if no token or running in local automated test environment without custom mock fetchImpl
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test' && !process.env?.FORCE_LINE_REAL_PUSH;
  const isCustomFetch = fetchImpl && fetchImpl !== globalThis.fetch;
  const isMockToken = !channelAccessToken || (typeof channelAccessToken === 'string' && channelAccessToken.startsWith('mock-'));

  if (isMockToken && !isCustomFetch) {
    return {
      ok: true,
      status: !channelAccessToken ? 'skipped_missing_token' : 'mock_delivered',
      to,
      messagesCount: messages.length,
      messages
    };
  }
  if (isTest && !isCustomFetch) {
    return {
      ok: true,
      status: 'mock_delivered',
      to,
      messagesCount: messages.length,
      messages
    };
  }

  const endpoint = 'https://api.line.me/v2/bot/message/push';
  const payload = JSON.stringify({ to, messages });
  const fetcher = fetchImpl || globalThis.fetch;

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${channelAccessToken}`
        },
        body: payload
      });

      if (response.ok) {
        return {
          ok: true,
          status: 'sent',
          statusCode: response.status
        };
      }

      const status = response.status;
      // Retry on 429 (Rate Limit) or 5xx server errors
      if ((status === 429 || status >= 500) && attempt < maxRetries) {
        attempt++;
        const delayMs = attempt * 300;
        await new Promise(res => setTimeout(res, delayMs));
        continue;
      }

      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {}

      return {
        ok: false,
        status: 'failed',
        statusCode: status,
        error: errorBody || `HTTP ${status}`
      };
    } catch (err) {
      if (attempt < maxRetries) {
        attempt++;
        await new Promise(res => setTimeout(res, attempt * 300));
        continue;
      }
      return {
        ok: false,
        status: 'error',
        error: err.message
      };
    }
  }

  return { ok: false, status: 'max_retries_exceeded' };
}
