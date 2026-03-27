const admin = require('firebase-admin');

// Firebase service account loaded from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const messaging = admin.messaging();

console.log('🔔 SPC IT Club notification server started');

// ── ANNOUNCEMENTS ──
let annReady = false;
db.collection('announcements')
  .orderBy('date', 'desc')
  .limit(20)
  .onSnapshot(async snapshot => {
    if (!annReady) {
      // First snapshot — just learn existing IDs, don't notify
      annReady = true;
      console.log(`[Ann] Loaded ${snapshot.size} existing announcements`);
      return;
    }

    for (const change of snapshot.docChanges()) {
      if (change.type !== 'added') continue;
      const ann = change.doc.data();
      console.log(`[Ann] New announcement: "${ann.title}"`);
      await sendToAll({
        title: '📢 ' + (ann.title || 'New Announcement'),
        body:  (ann.content || '').slice(0, 100),
      }, 'ann');
    }
  }, err => console.error('[Ann] Snapshot error:', err));

// ── CHAT MESSAGES ──
let chatReady = false;
db.collection('messages')
  .orderBy('ts', 'desc')
  .limit(30)
  .onSnapshot(async snapshot => {
    if (!chatReady) {
      chatReady = true;
      console.log(`[Chat] Loaded ${snapshot.size} existing messages`);
      return;
    }

    for (const change of snapshot.docChanges()) {
      if (change.type !== 'added') continue;
      const msg = change.doc.data();
      // Skip GIF-only messages with no text
      const body = (msg.text || '').slice(0, 100) || (msg.gif ? '(sent a GIF)' : '');
      console.log(`[Chat] New message from ${msg.name}: "${body}"`);
      await sendToAll({
        title: '💬 ' + (msg.name || msg.username || 'Someone'),
        body,
      }, 'chat');
    }
  }, err => console.error('[Chat] Snapshot error:', err));

// ── SEND TO ALL USERS WITH A TOKEN ──
async function sendToAll(notification, type) {
  try {
    const usersSnap = await db.collection('users').get();
    const tokens = [];

    usersSnap.forEach(doc => {
      const u = doc.data();
      // Only send to users who have a token and haven't disabled notifications
      // (token presence implies they granted permission)
      if (u.fcmToken && u.status !== 'disabled') {
        tokens.push(u.fcmToken);
      }
    });

    if (!tokens.length) {
      console.log(`[FCM] No tokens found, skipping`);
      return;
    }

    console.log(`[FCM] Sending "${notification.title}" to ${tokens.length} device(s)`);

    // FCM allows max 500 tokens per multicast
    const chunks = chunkArray(tokens, 500);
    for (const chunk of chunks) {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: notification.title,
          body:  notification.body,
        },
        webpush: {
          notification: {
            icon: 'https://github.com/SPC-IT-CLUB/SPCITCLUB-app/blob/main/spc.jpg?raw=true',
            badge: 'https://github.com/SPC-IT-CLUB/SPCITCLUB-app/blob/main/spc.jpg?raw=true',
            vibrate: [200, 100, 200],
          },
          fcmOptions: {
            link: '/',
          },
        },
      });

      console.log(`[FCM] Success: ${response.successCount}, Failed: ${response.failureCount}`);

      // Clean up invalid/expired tokens
      response.responses.forEach(async (res, i) => {
        if (!res.success) {
          const code = res.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            // Find and remove stale token from Firestore
            const staleToken = chunk[i];
            const staleSnap = await db.collection('users')
              .where('fcmToken', '==', staleToken)
              .get();
            staleSnap.forEach(d => {
              d.ref.update({ fcmToken: admin.firestore.FieldValue.delete() });
              console.log(`[FCM] Removed stale token for user ${d.id}`);
            });
          }
        }
      });
    }
  } catch (err) {
    console.error('[FCM] Send error:', err);
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// Keep process alive
process.on('uncaughtException', err => console.error('Uncaught:', err));
process.on('unhandledRejection', err => console.error('Unhandled:', err));
