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
                    // 🔥 DZIAŁA W KAŻDYM PWA I KAŻDEJ PRZEGLĄDARCE
                    if (client.visibilityState === "visible") {
                        client.focus();
                        client.postMessage({
                            type: "OPEN_NOTIFICATION_URL",
                            url: urlToOpen
                        });
                        return;
                    }
                }

                // Jeśli nie ma aktywnych okien
                return clients.openWindow(urlToOpen);
            })
    );
});
