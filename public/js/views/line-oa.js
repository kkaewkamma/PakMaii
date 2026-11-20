// LINE Official Account (LINE OA) Notifications & Chat Shortcuts
import { el } from '../core/dom.js';
import { icon } from '../core/icons.js';

let notifications = [];
let unreadCount = 0;
let onUnreadChangeCallbacks = [];

export function onNotificationCountChange(cb) {
  if (typeof cb === 'function') onUnreadChangeCallbacks.push(cb);
}

function notifyCountChange() {
  onUnreadChangeCallbacks.forEach(cb => {
    try { cb(unreadCount); } catch { /* ignore */ }
  });
}

export function initLineNotifications(user) {
  const userId = user?.id || 'demo';
  const storageKey = `pakmaii_line_notifs_${userId}`;
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      notifications = JSON.parse(saved);
      unreadCount = notifications.filter(n => !n.read).length;
      notifyCountChange();
      return;
    }
  } catch { /* fallback to default */ }

  // Default seed notifications for demo experience
  notifications = [
    {
      id: 'notif-1',
      title: 'ยินดีต้อนรับสู่ LINE OA ผักไหม',
      body: 'ผูกบัญชีเกษตรกรสำเร็จ พร้อมรับการแจ้งเตือนสถานะแปลงและคำขอผ่าน LINE อัตโนมัติ',
      type: 'info',
      time: '1 วันที่แล้ว',
      read: true,
      targetTab: 'home'
    },
    {
      id: 'notif-2',
      title: 'แจ้งเตือนรอบบันทึกกิจกรรมแปลง',
      body: 'ช่วยให้ประวัติการดูแลแปลงสม่ำเสมอตามเกณฑ์ PGS แตะเพื่อบันทึกกิจกรรมวันนี้',
      type: 'warn',
      time: 'เมื่อวานนี้',
      read: false,
      targetTab: 'record'
    }
  ];
  unreadCount = notifications.filter(n => !n.read).length;
  notifyCountChange();
}

function saveNotifications(userId) {
  try {
    sessionStorage.setItem(`pakmaii_line_notifs_${userId || 'demo'}`, JSON.stringify(notifications));
  } catch { /* ignore */ }
}

export function getLineNotifications() {
  return [...notifications];
}

export function pushLineNotification({ title, body, type = 'info', targetTab = 'home', user = null }) {
  const notif = {
    id: `notif-${Date.now()}`,
    title,
    body,
    type,
    time: 'เมื่อสักครู่',
    read: false,
    targetTab
  };
  notifications.unshift(notif);
  unreadCount = notifications.filter(n => !n.read).length;
  saveNotifications(user?.id);
  notifyCountChange();

  // Show rich LINE Toast notification banner
  showLinePushToast(notif);
  return notif;
}

export function markAllNotificationsRead(userId) {
  notifications.forEach(n => { n.read = true; });
  unreadCount = 0;
  saveNotifications(userId);
  notifyCountChange();
}

function showLinePushToast(notif) {
  const existing = document.getElementById('linePushToast');
  if (existing) existing.remove();

  const iconName = notif.type === 'approved' || notif.type === 'success' ? 'check'
    : notif.type === 'rejected' || notif.type === 'danger' ? 'x'
    : notif.type === 'pending' || notif.type === 'warn' ? 'clock' : 'bell';

  const toast = el('div', { id: 'linePushToast', className: `line-push-toast tone-${notif.type || 'info'}` },
    el('div', { className: 'line-toast-header' },
      el('span', { className: 'line-badge-pill' }, 'LINE OA แจ้งเตือน'),
      el('span', { className: 'line-toast-time' }, 'เมื่อสักครู่')
    ),
    el('div', { className: 'line-toast-body' },
      el('div', { className: 'line-toast-icon' }, icon(iconName, 16)),
      el('div', { className: 'line-toast-text' },
        el('strong', {}, notif.title),
        el('p', {}, notif.body)
      )
    )
  );

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

export function openLineNotificationModal({ onNavigate, user }) {
  const existing = document.getElementById('lineNotifModal');
  if (existing) existing.remove();

  markAllNotificationsRead(user?.id);

  const closeBtn = el('button', {
    type: 'button',
    className: 'line-modal-close-btn',
    'aria-label': 'ปิด',
    onclick: () => modal.remove()
  }, icon('x', 18));

  const items = notifications.map(n => {
    const iconName = n.type === 'approved' || n.type === 'success' ? 'check'
      : n.type === 'rejected' || n.type === 'danger' ? 'x'
      : n.type === 'pending' || n.type === 'warn' ? 'clock' : 'bell';

    return el('div', { className: `line-notif-item tone-${n.type || 'info'}` },
      el('div', { className: 'line-notif-item-top' },
        el('span', { className: 'line-notif-tag' }, icon(iconName, 12), ` ${n.title}`),
        el('span', { className: 'line-notif-time' }, n.time)
      ),
      el('p', { className: 'line-notif-desc' }, n.body),
      n.targetTab ? el('div', { className: 'line-notif-action' },
        el('button', {
          type: 'button',
          className: 'line-notif-link-btn',
          onclick: () => {
            modal.remove();
            if (typeof onNavigate === 'function') onNavigate(n.targetTab);
          }
        }, 'เปิดดูในระบบ (LIFF) →')
      ) : null
    );
  });

  const modal = el('div', { id: 'lineNotifModal', className: 'line-modal-overlay' },
    el('div', { className: 'line-modal-card' },
      el('div', { className: 'line-modal-header' },
        el('div', { className: 'line-modal-title-row' },
          el('div', { className: 'line-logo-badge' }, icon('bell', 18)),
          el('div', {},
            el('h3', { className: 'line-modal-title' }, 'การแจ้งเตือน LINE'),
            el('p', { className: 'line-modal-sub' }, 'ข้อความแจ้งเตือนที่ส่งเข้าบัญชี LINE ของคุณ')
          )
        ),
        closeBtn
      ),
      el('div', { className: 'line-notif-list' },
        items.length ? items : el('p', { className: 'muted text-center py-20' }, 'ยังไม่มีประวัติการแจ้งเตือน')
      )
    )
  );

  document.body.appendChild(modal);
}

export function generateLineBotReply(rawText, { me, plots = [], approvals = [], activities = [] }) {
  const text = (rawText || '').trim().toLowerCase();
  const sortedApprovals = [...approvals].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  const latestApproval = sortedApprovals[0] || null;
  const myPlot = plots[0] || null;

  if (text.includes('คำขอ') || text.includes('approval') || text.includes('ปัจจัย')) {
    if (!latestApproval) {
      return {
        reply: '🌱 ขณะนี้คุณยังไม่มีรายการคำขอใช้ปัจจัยการผลิตในระบบ สามารถแตะปุ่มด้านล่างเพื่อส่งคำขอใหม่ผ่าน LINE LIFF ได้ทันทีครับ',
        actionLabel: 'ส่งคำขอใช้ปัจจัย (LIFF)',
        targetTab: 'approval'
      };
    }
    const isApproved = latestApproval.status === 'approved';
    const isPending = latestApproval.status === 'pending';
    const statusText = isApproved ? 'ผ่านการอนุมัติแล้ว ✅' : isPending ? 'รอการพิจารณา ⏳' : 'ไม่ผ่านการอนุมัติ ❌';
    const advice = latestApproval.comment ? `\n• ข้อแนะนำจากเจ้าหน้าที่: ${latestApproval.comment}` : '';
    return {
      reply: `🌱 สถานะคำขอใช้ปัจจัยล่าสุด:\n\n• แผน: ${latestApproval.input_name}\n• สถานะ: ${statusText}\n• รายละเอียด: ${latestApproval.details || '-'}${advice}\n\nคุณสามารถติดตามหรือส่งคำขอใหม่ผ่านระบบได้ตลอดเวลาครับ`,
      actionLabel: 'ดูประวัติคำขอทั้งหมด (LIFF)',
      targetTab: 'approval'
    };
  }

  if (text.includes('แปลง') || text.includes('plot') || text.includes('สถานะ')) {
    if (!plots.length) {
      return {
        reply: '🌾 ขณะนี้ยังไม่พบแปลงปลูกที่ลงทะเบียนไว้ในบัญชีของคุณ สามารถติดต่อเจ้าหน้าที่ ICS เพื่อบันทึกข้อมูลแปลงครับ',
        actionLabel: 'ดูแปลงปลูก (LIFF)',
        targetTab: 'plots'
      };
    }
    const plotLines = plots.slice(0, 3).map(p => `• แปลง ${p.plot_code || p.name}: ${p.crop || 'พืชผสมผสาน'} (${p.conversion_year || 'ระยะปรับเปลี่ยน'})`).join('\n');
    return {
      reply: `🌾 สรุปสถานะแปลงปลูกของคุณ:\n\n${plotLines}\n\n• มาตรฐาน: เกษตรอินทรีย์แบบมีส่วนร่วม (PGS)\n• สถานะจังหวะ 14 วัน: มีการบันทึกสม่ำเสมอตามเกณฑ์`,
      actionLabel: 'จัดการแปลงปลูก (LIFF)',
      targetTab: 'plots'
    };
  }

  if (text.includes('บันทึก') || text.includes('กิจกรรม') || text.includes('record')) {
    return {
      reply: '📝 พร้อมบันทึกกิจกรรมแปลงวันนี้!\n\nคุณสามารถบันทึกกิจกรรม เช่น รดน้ำ, ใส่ปุ๋ยหมัก, กำจัดวัชพืช หรือเก็บเกี่ยว พร้อมแนบภาพถ่ายแปลงได้ทันทีผ่าน LINE LIFF ครับ',
      actionLabel: 'เปิดหน้าบันทึกกิจกรรม (LIFF)',
      targetTab: 'record'
    };
  }

  if (text.includes('ตรวจ') || text.includes('ผลตรวจ') || text.includes('review') || text.includes('pgs')) {
    return {
      reply: '🛡️ ผลการตรวจประเมินแปลงล่าสุด:\n\n• มาตรฐาน: เกษตรอินทรีย์แบบมีส่วนร่วม (PGS)\n• ผลการประเมิน: ผ่านเกณฑ์การรับรอง\n• ข้อแนะนำ: ให้รักษาความต่อเนื่องของการบันทึกสมุดแปลงและคงแนวกันชนธรรมชาติ',
      actionLabel: 'ดูผลการตรวจประเมิน (LIFF)',
      targetTab: 'reviews'
    };
  }

  if (text.includes('ics') || text.includes('ติดต่อ') || text.includes('เจ้าหน้าที่') || text.includes('เบอร์')) {
    return {
      reply: '🧑‍🌾 ข้อมูลเจ้าหน้าที่ ICS ผู้รับผิดชอบแปลง:\n\n• เจ้าหน้าที่: คุณวิชัย ผักไหม\n• กลุ่ม: วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม\n• โทรศัพท์: 081-234-5678\n• พื้นที่ดูแล: ต.ผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ',
      actionLabel: 'โทรติดต่อเจ้าหน้าที่',
      tel: '081-234-5678'
    };
  }

  return {
    reply: `สวัสดีครับคุณ ${me?.thai_name || me?.name || 'สมาชิกผักไหม'} 👋\nระบบบริหารมาตรฐานเกษตรอินทรีย์ผักไหมพร้อมให้บริการ คุณสามารถแตะปุ่มคีย์ลัดด้านล่างเพื่อถามสถานะได้ทันทีครับ`,
    actionLabel: 'เปิดหน้าหลัก (LIFF)',
    targetTab: 'home'
  };
}

export function openLineOaChatModal({ me, plots = [], approvals = [], activities = [], onNavigate }) {
  const existing = document.getElementById('lineOaChatModal');
  if (existing) existing.remove();

  const messagesContainer = el('div', { className: 'line-chat-messages' });

  const appendBotMessage = ({ reply, actionLabel, targetTab, tel }) => {
    const bubble = el('div', { className: 'line-chat-bubble bot' },
      el('div', { className: 'line-bubble-content' },
        el('p', { className: 'line-bubble-text' }, reply)
      )
    );
    if (actionLabel && (targetTab || tel)) {
      const actionBtn = el('button', {
        type: 'button',
        className: 'line-bubble-action-btn',
        onclick: () => {
          if (tel) {
            window.location.href = `tel:${tel}`;
          } else if (targetTab) {
            modal.remove();
            if (typeof onNavigate === 'function') onNavigate(targetTab);
          }
        }
      }, actionLabel);
      bubble.querySelector('.line-bubble-content').appendChild(actionBtn);
    }
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  };

  const appendUserMessage = (text) => {
    const bubble = el('div', { className: 'line-chat-bubble user' },
      el('div', { className: 'line-bubble-content' },
        el('p', { className: 'line-bubble-text' }, text)
      )
    );
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  };

  const handleShortcut = (cmd) => {
    appendUserMessage(cmd);
    setTimeout(() => {
      const res = generateLineBotReply(cmd, { me, plots, approvals, activities });
      appendBotMessage(res);
    }, 280);
  };

  // Initial greeting
  appendBotMessage({
    reply: `สวัสดีครับคุณ ${me?.thai_name || me?.name || 'สมาชิก'} 👋\nยินดีต้อนรับสู่ LINE Official Account ของกลุ่มเกษตรอินทรีย์ผักไหม\n\nสามารถแตะปุ่มคีย์ลัดด้านล่างเพื่อถามสถานะคำขอ ตรวจสอบแปลง หรือเปิดแอปบันทึกแปลงได้ทันทีครับ`,
    actionLabel: 'เปิดแอปบันทึกแปลง (LIFF)',
    targetTab: 'home'
  });

  const shortcuts = [
    { label: '🔍 เช็คสถานะคำขอ', cmd: 'เช็คสถานะคำขอ' },
    { label: '🌾 สรุปสถานะแปลง', cmd: 'สรุปสถานะแปลง' },
    { label: '📝 บันทึกแปลง (LIFF)', cmd: 'บันทึกแปลง' },
    { label: '🛡️ เช็คผลตรวจแปลง', cmd: 'เช็คผลตรวจแปลง' },
    { label: '📞 ติดต่อเจ้าหน้าที่ ICS', cmd: 'ติดต่อ ics' }
  ];

  const quickReplyBar = el('div', { className: 'line-quick-reply-bar' },
    ...shortcuts.map(s => el('button', {
      type: 'button',
      className: 'line-quick-chip',
      onclick: () => handleShortcut(s.cmd)
    }, s.label))
  );

  const inputEl = el('input', {
    type: 'text',
    className: 'line-chat-input',
    placeholder: 'พิมพ์ข้อความถามสถานะ...'
  });

  const sendBtn = el('button', {
    type: 'button',
    className: 'line-chat-send-btn',
    'aria-label': 'ส่งข้อความ',
    onclick: () => {
      const val = inputEl.value.trim();
      if (!val) return;
      inputEl.value = '';
      handleShortcut(val);
    }
  }, icon('send', 16));

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendBtn.click();
    }
  });

  const closeBtn = el('button', {
    type: 'button',
    className: 'line-modal-close-btn',
    'aria-label': 'ปิด',
    onclick: () => modal.remove()
  }, icon('x', 18));

  const modal = el('div', { id: 'lineOaChatModal', className: 'line-modal-overlay' },
    el('div', { className: 'line-chat-modal-card' },
      el('div', { className: 'line-chat-header' },
        el('div', { className: 'line-chat-header-profile' },
          el('div', { className: 'line-chat-avatar' }, '🌱'),
          el('div', {},
            el('h3', { className: 'line-chat-name' }, 'ผักไหม Official Account ✅'),
            el('span', { className: 'line-chat-status' }, '• ระบบตอบกลับอัตโนมัติ 24 ชม.')
          )
        ),
        closeBtn
      ),
      messagesContainer,
      quickReplyBar,
      el('div', { className: 'line-chat-input-row' },
        inputEl,
        sendBtn
      )
    )
  );

  document.body.appendChild(modal);
  setTimeout(() => inputEl.focus(), 150);
}
