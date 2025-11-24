// =======================================
// 🔔 ODBIÓR PUSH
// =======================================
self.addEventListener("push", (event) => {
    console.log("[SW] Push odebrany:", event.data?.text());

    let data = {};

    try {
        data = event.data.json();
    } catch (e) {
        data = { title: "Powiadomienie", body: event.data.text() };
    }

    const title = data.title || "Nowe powiadomienie";
    const options = {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: {
            url: data.url || "/"
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});


// =======================================
// 🔔 KLIKNIĘCIE POWIADOMIENIA
// =======================================
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data?.url || "/";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {

            // 🔥 1) Aplikacja JEST już otwarta → wysyłamy event do SPA
            for (const client of clientList) {
                // sprawdzamy tylko okna naszego hosta
                if (client.url.startsWith(self.location.origin)) {
                    // pokazujemy okno
                    client.focus();

                    // wysyłamy wiadomość do React'a
                    client.postMessage({
                        type: "OPEN_NOTIFICATION_URL",
                        url: urlToOpen
                    });

                    return; // nie otwieramy nowej karty
                }
            }

            // 🔥 2) Jeśli aplikacja NIE jest otwarta → otwieramy nową kartę/tab
            return clients.openWindow(urlToOpen);
        })
    );
});
