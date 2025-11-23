// ======== PUSH EVENT ========
self.addEventListener("push", (event) => {
    console.log("[SW] Push odebrany:", event.data?.text());

    let data = {};

    try {
        data = event.data.json();
    } catch (e) {
        // np. Safari wysyła czysty tekst
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

// ======== KLIKNIĘCIE POWIADOMIENIA ========
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const url = event.notification.data?.url || "/";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ("focus" in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }

            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
