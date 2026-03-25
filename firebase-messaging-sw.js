importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyDiN7DkL1KwVsntRjDkU3dHAnOp1zmwNoI",
  authDomain:        "spcitapp.firebaseapp.com",
  projectId:         "spcitapp",
  storageBucket:     "spcitapp.firebasestorage.app",
  messagingSenderId: "713788616271",
  appId:             "1:713788616271:web:e44c20b347a680c1a5043a"
});

const messaging = firebase.messaging();

// Handle background messages (site is closed or tab not focused)
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || 'SPC IT Club';
  const body  = payload.notification?.body  || '';
  self.registration.showNotification(title, {
    body,
    icon: 'https://github.com/SPC-IT-CLUB/SPCITCLUB-app/blob/main/spc.jpg?raw=true',
    badge: 'https://github.com/SPC-IT-CLUB/SPCITCLUB-app/blob/main/spc.jpg?raw=true',
    vibrate: [200, 100, 200],
  });
});

// Clicking the notification opens/focuses the site
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
