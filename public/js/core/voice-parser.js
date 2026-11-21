'use strict';

/**
 * Smart Agricultural Thai Voice Parser for PakMaii (Ready to Grow)
 * Parses spoken Thai sentences into structured form fields for Tambon Phak Mai farmers.
 * Strict Security: No innerHTML, no eval.
 */

export function parseThaiVoiceActivity(text = '', plots = []) {
  const clean = String(text || '').trim();
  if (!clean) return null;

  // 1. Detect Date
  let activityDate = new Date().toISOString().slice(0, 10);
  if (/เมื่อวาน|วานนี้|เมื่อวานนี้/.test(clean)) {
    const yesterday = new Date(Date.now() - 86400000);
    activityDate = yesterday.toISOString().slice(0, 10);
  }

  // 2. Detect Activity Kind
  let detectedKind = 'ปลูก';
  if (/ปุ๋ย|แหนแดง|ปุ๋ยหมัก|ปุ๋ยคอก|ปุ๋ยชีวภาพ|ขี้วัว|ขี้ไก่|น้ำหมักมูล|ปรับปรุงดิน/i.test(clean)) {
    detectedKind = 'ใส่ปุ๋ย';
  } else if (/ให้น้ำ|รดน้ำ|สูบน้ำ|ธนาคารน้ำ|ปล่อยน้ำ|เปิดน้ำ|สปริงเกอร์/i.test(clean)) {
    detectedKind = 'ให้น้ำ';
  } else if (/หญ้า|วัชพืช|ถอนหญ้า|ดายหญ้า|ตัดหญ้า|คลุมฟาง/i.test(clean)) {
    detectedKind = 'กำจัดวัชพืช';
  } else if (/เกี่ยว|เก็บเกี่ยว|ตัดผล|นวดข้าว|บรรจุ|ชั่ง/i.test(clean)) {
    detectedKind = 'เก็บเกี่ยว';
  } else if (/ฉีด|พ่น|น้ำหมัก|สะเดา|แมลง|หนอน|เพลี้ย|เชื้อรา|ไตรโคเดอร์มา|สมุนไพร/i.test(clean)) {
    detectedKind = 'กำจัดวัชพืช';
  } else if (/ไถ|ไถกลบ|เตรียมดิน|หว่าน|ปลูก|ดำนา|ยกร่อง|หยอดเมล็ด|ปอเทือง|ถั่วเหลือง/i.test(clean)) {
    detectedKind = 'ปลูก';
  }

  // 3. Detect Plot from Spoken Text
  let matchedPlot = null;
  // Match alphanumeric plot codes like A-01, A01, A-02, A-03, B-01, C-12
  const codeMatch = clean.match(/([A-Ca-c])\s*[-_]?\s*0?([1-9]|1[0-2])/);
  if (codeMatch) {
    const letter = codeMatch[1].toUpperCase();
    const num = codeMatch[2].padStart(2, '0');
    const targetCode = `${letter}-${num}`;
    matchedPlot = plots.find(p =>
      (p.name && p.name.toUpperCase().includes(targetCode)) ||
      (p.id && p.id.toUpperCase().includes(targetCode))
    );
  }

  // Match by crop name or ordinal if code didn't match
  if (!matchedPlot && plots.length > 0) {
    if (/แปลง\s*(1|หนึ่ง|แรก)/i.test(clean)) {
      matchedPlot = plots[0];
    } else if (/แปลง\s*(2|สอง)/i.test(clean) && plots[1]) {
      matchedPlot = plots[1];
    } else if (/แปลง\s*(3|สาม)/i.test(clean) && plots[2]) {
      matchedPlot = plots[2];
    } else {
      for (const p of plots) {
        if (p.crop && clean.includes(p.crop)) {
          matchedPlot = p;
          break;
        }
        if (p.name && clean.includes(p.name)) {
          matchedPlot = p;
          break;
        }
      }
    }
  }

  // Default to first plot if none matched
  if (!matchedPlot && plots.length > 0) {
    matchedPlot = plots[0];
  }

  // 4. Detect Quantity & Unit (50 กิโล, 20 ลิตร, 3 ชั่วโมง, 2 ถัง, 5 ไร่)
  let amountQty = '';
  const qtyMatch = clean.match(/(\d+(?:\.\d+)?)\s*(กิโลกรัม|กิโล|กก\.?|ลิตร|ถัง|กระสอบ|ไร่|งาน|ชั่วโมง|ชม\.?)/);
  if (qtyMatch) {
    let unit = qtyMatch[2];
    if (unit === 'กิโล' || unit === 'กก' || unit === 'กก.') unit = 'กิโลกรัม';
    if (unit === 'ชม' || unit === 'ชม.') unit = 'ชั่วโมง';
    amountQty = `${qtyMatch[1]} ${unit}`;
  }

  // 5. Detect Input Used (ปัจจัยที่ใช้)
  let inputUsed = '';
  const inputKeywords = [
    'ปุ๋ยหมักแหนแดง',
    'แหนแดง',
    'ปุ๋ยหมักชีวภาพ',
    'ปุ๋ยหมักอินทรีย์',
    'ปุ๋ยคอก',
    'น้ำหมักมูลสุกร',
    'น้ำหมักมูลค้างคาว',
    'น้ำหมักสมุนไพรสะเดา',
    'น้ำหมักสะเดา',
    'น้ำหมักชีวภาพ',
    'ธนาคารน้ำใต้ดิน',
    'ปอเทือง',
    'เมล็ดพันธุ์ข้าวหอมมะลิ 105',
    'เมล็ดพันธุ์ถั่วเหลือง',
    'ไตรโคเดอร์มา',
    'ขี้วัว',
    'ฟางข้าว'
  ];
  for (const kw of inputKeywords) {
    if (clean.includes(kw)) {
      inputUsed = kw;
      break;
    }
  }

  return {
    rawTranscript: clean,
    plotId: matchedPlot?.id || '',
    plotName: matchedPlot ? `${matchedPlot.name} — ${matchedPlot.crop || ''}`.trim() : '',
    kind: detectedKind,
    activityDate,
    inputUsed,
    amountQty,
    details: clean
  };
}

export const SAMPLE_VOICE_SCENARIOS = [
  {
    title: 'ใส่ปุ๋ยแหนแดง',
    speech: 'วันนี้ใส่ปุ๋ยหมักแหนแดง 50 กิโล ในแปลง A-03 ดินชุ่มดี',
    summary: 'แปลง A-03 • ใส่ปุ๋ย • 50 กก.'
  },
  {
    title: 'ให้น้ำธนาคารใต้ดิน',
    speech: 'สูบน้ำจากธนาคารน้ำใต้ดิน แปลง A-01 ปริมาณ 3 ชั่วโมง',
    summary: 'แปลง A-01 • ให้น้ำ • 3 ชม.'
  },
  {
    title: 'ไถกลบหว่านปอเทือง',
    speech: 'ไถกลบตอซังข้าวและหว่านปอเทือง แปลง B-01 วันนี้',
    summary: 'แปลง B-01 • ปลูก/ปรับดิน'
  },
  {
    title: 'ฉีดสมุนไพรไล่แมลง',
    speech: 'ฉีดพ่นน้ำหมักสมุนไพรสะเดา 20 ลิตร ป้องกันเพลี้ย แปลง C-12',
    summary: 'แปลง C-12 • กำจัดวัชพืช/แมลง • 20 ลิตร'
  }
];
