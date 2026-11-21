import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseThaiVoiceActivity, SAMPLE_VOICE_SCENARIOS } from '../public/js/core/voice-parser.js';

const mockPlots = [
  { id: 'plot_a01', name: 'แปลง A-01', crop: 'ข้าวหอมมะลิ 105 อินทรีย์' },
  { id: 'plot_a03', name: 'แปลง A-03', crop: 'ข้าวหอมมะลิ 105' },
  { id: 'plot_b01', name: 'แปลง B-01', crop: 'ถั่วเหลืองอินทรีย์แฟร์เทรด' },
  { id: 'plot_c12', name: 'แปลง C-12', crop: 'ปอเทือง (Sunn Hemp)' }
];

test('parseThaiVoiceActivity correctly extracts fertilizing, input, amount, and plot', () => {
  const result = parseThaiVoiceActivity('วันนี้ใส่ปุ๋ยหมักแหนแดง 50 กิโล ในแปลง A-03 ดินชุ่มดี', mockPlots);
  assert.equal(result.kind, 'ใส่ปุ๋ย');
  assert.equal(result.inputUsed, 'ปุ๋ยหมักแหนแดง');
  assert.equal(result.amountQty, '50 กิโลกรัม');
  assert.equal(result.plotId, 'plot_a03');
  assert.match(result.plotName, /A-03/);
  assert.equal(result.activityDate, new Date().toISOString().slice(0, 10));
});

test('parseThaiVoiceActivity correctly extracts groundwater bank watering with hours', () => {
  const result = parseThaiVoiceActivity('สูบน้ำจากธนาคารน้ำใต้ดิน แปลง A-01 ปริมาณ 3 ชั่วโมง', mockPlots);
  assert.equal(result.kind, 'ให้น้ำ');
  assert.equal(result.amountQty, '3 ชั่วโมง');
  assert.equal(result.plotId, 'plot_a01');
  assert.match(result.plotName, /A-01/);
});

test('parseThaiVoiceActivity correctly extracts planting and soil prep with Sunn hemp', () => {
  const result = parseThaiVoiceActivity('ไถกลบตอซังข้าวและหว่านปอเทือง แปลง B-01 วันนี้', mockPlots);
  assert.equal(result.kind, 'ปลูก');
  assert.equal(result.inputUsed, 'ปอเทือง');
  assert.equal(result.plotId, 'plot_b01');
});

test('parseThaiVoiceActivity correctly extracts herbal pest control and liters', () => {
  const result = parseThaiVoiceActivity('ฉีดพ่นน้ำหมักสมุนไพรสะเดา 20 ลิตร ป้องกันเพลี้ย แปลง C-12', mockPlots);
  assert.equal(result.kind, 'กำจัดวัชพืช');
  assert.equal(result.inputUsed, 'น้ำหมักสมุนไพรสะเดา');
  assert.equal(result.amountQty, '20 ลิตร');
  assert.equal(result.plotId, 'plot_c12');
});

test('parseThaiVoiceActivity adjusts date when speaking about yesterday', () => {
  const result = parseThaiVoiceActivity('เมื่อวานนี้ใส่ปุ๋ยคอก 100 กิโล แปลง A-01', mockPlots);
  const expectedYesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal(result.activityDate, expectedYesterday);
  assert.equal(result.kind, 'ใส่ปุ๋ย');
  assert.equal(result.inputUsed, 'ปุ๋ยคอก');
  assert.equal(result.amountQty, '100 กิโลกรัม');
});

test('SAMPLE_VOICE_SCENARIOS provides 4 agricultural presets', () => {
  assert.equal(SAMPLE_VOICE_SCENARIOS.length, 4);
  for (const sc of SAMPLE_VOICE_SCENARIOS) {
    assert.ok(sc.title && sc.speech && sc.summary);
    const parsed = parseThaiVoiceActivity(sc.speech, mockPlots);
    assert.ok(parsed.kind && parsed.plotId);
  }
});

test('voice-parser code maintains strict security invariant (zero localStorage)', () => {
  const code = fs.readFileSync(new URL('../public/js/core/voice-parser.js', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /localStorage/);
  assert.doesNotMatch(code, /\.innerHTML|\.outerHTML|eval\s*\(/);
});
