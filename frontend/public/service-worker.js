// public/service-worker.js

self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        console.error("Push data parse error", e);
    }

    const title = data.title || "Nowe powiadomienie";
    const options = {
        body: data.body || "",
        icon: "/icons/icon-192.png",   // możesz podmienić lub na razie olać
        badge: "/icons/icon-192.png",  // jak nie masz, i tak zadziała
        data: {
            url: data.url || "/",
        },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data?.url || "/";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            // jeśli jakaś karta już otwarta → fokus
            for (const client of clientList) {
                if ("focus" in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // inaczej otwórz nową
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
