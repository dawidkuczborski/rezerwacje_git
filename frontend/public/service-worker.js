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
        clients.matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {

                for (const client of clientList) {
                    // Jeśli PWA/karta jest już otwarta:
                    if (client.url.startsWith(self.location.origin)) {

                        // 🔥 Wysyłamy POST MESSAGE do aplikacji
                        client.focus();
                        client.postMessage({
                            type: "OPEN_NOTIFICATION",
                            url: urlToOpen
                        });

                        return;
                    }
                }

                // Jeśli nie ma otwartego okna → nowa karta
                return clients.openWindow(urlToOpen);
            })
    );
});
