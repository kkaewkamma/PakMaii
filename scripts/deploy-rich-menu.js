/**
 * Deploy PakMaii Rich Menu to LINE Official Account via LINE Messaging API
 */

import fs from 'node:fs';
import path from 'node:path';
import { fetchChannelAccessToken } from '../shared/line-messaging.js';

let channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
let channelId = process.env.LINE_MESSAGING_CHANNEL_ID;
let liffId = process.env.LIFF_ID;

// Fallback to reading wrangler.pakmaii.jsonc if exists (local dev)
if (!channelSecret || !channelId) {
  try {
    const configPath = path.join(process.cwd(), 'wrangler.pakmaii.jsonc');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const secMatch = content.match(/LINE_MESSAGING_CHANNEL_SECRET":\s*"([^"]+)"/);
      const idMatch = content.match(/LINE_MESSAGING_CHANNEL_ID":\s*"([^"]+)"/);
      const liffMatch = content.match(/LIFF_ID":\s*"([^"]+)"/);
      if (secMatch) channelSecret = secMatch[1];
      if (idMatch) channelId = idMatch[1];
      if (liffMatch && !liffId) liffId = liffMatch[1];
    }
  } catch (err) {
    // Ignore error
  }
}

const CHANNEL_ID = channelId || '2012021215';
const CHANNEL_SECRET = channelSecret;
const LIFF_ID = liffId || '2012022503-PE16sYjU';

const IMAGE_PATH = path.join(process.cwd(), 'assets', 'line-oa', 'pakmaii-rich-menu-2500x1686.png');

async function main() {
  console.log('1. Fetching Channel Access Token (OAuth v2.1)...');
  const token = await fetchChannelAccessToken({
    channelId: CHANNEL_ID,
    channelSecret: CHANNEL_SECRET
  });
  if (!token) throw new Error('Failed to obtain channel access token');
  console.log('Token obtained successfully.');

  console.log('2. Defining Rich Menu structure...');
  const richMenuObj = {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'PakMaii Farmer Menu',
    chatBarText: 'เมนูหลัก ปลูกของดี',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: {
          type: 'uri',
          label: 'แปลงของฉัน',
          uri: `https://liff.line.me/${LIFF_ID}?tab=plots`
        }
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: {
          type: 'uri',
          label: 'บันทึกแปลง',
          uri: `https://liff.line.me/${LIFF_ID}?tab=record`
        }
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: {
          type: 'uri',
          label: 'ขอใช้ปัจจัย',
          uri: `https://liff.line.me/${LIFF_ID}?tab=approval`
        }
      },
      {
        bounds: { x: 0, y: 843, width: 833, height: 843 },
        action: {
          type: 'uri',
          label: 'ผลตรวจแปลง',
          uri: `https://liff.line.me/${LIFF_ID}?tab=reviews`
        }
      },
      {
        bounds: { x: 833, y: 843, width: 834, height: 843 },
        action: {
          type: 'message',
          label: 'ถามสถานะ',
          text: 'แปลง'
        }
      },
      {
        bounds: { x: 1667, y: 843, width: 833, height: 843 },
        action: {
          type: 'message',
          label: 'ติดต่อ ICS',
          text: 'ติดต่อเจ้าหน้าที่ ICS'
        }
      }
    ]
  };

  console.log('3. Creating Rich Menu on LINE API...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(richMenuObj)
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create rich menu: ${createRes.status} ${errText}`);
  }
  const createData = await createRes.json();
  const richMenuId = createData.richMenuId;
  console.log(`Rich Menu created! ID: ${richMenuId}`);

  console.log('4. Uploading Rich Menu image artwork...');
  const imageBuf = fs.readFileSync(IMAGE_PATH);
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/png'
    },
    body: imageBuf
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Failed to upload rich menu image: ${uploadRes.status} ${errText}`);
  }
  console.log('Image uploaded successfully.');

  console.log('5. Setting as default Rich Menu for all users...');
  const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!defaultRes.ok) {
    const errText = await defaultRes.text();
    throw new Error(`Failed to set default rich menu: ${defaultRes.status} ${errText}`);
  }
  console.log('Default Rich Menu set successfully!');
  console.log(`Rich Menu is now LIVE for all users! ID: ${richMenuId}`);
}

main().catch(err => {
  console.error('Error deploying rich menu:', err);
  process.exit(1);
});
