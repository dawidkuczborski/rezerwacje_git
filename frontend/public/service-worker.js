// ======== PUSH EVENT ========
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


// ======== KLIKNIĘCIE POWIADOMIENIA ========
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data?.url || "/";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {

            // Jeśli aplikacja jest już otwarta → przełącz i otwórz URL
            for (const client of clientList) {
                if (client.url.includes(self.location.origin)) {
                    client.focus();
                    // bardzo ważne: *wysyłamy event do okna SPA* zamiast navigate
                    client.postMessage({
                        type: "OPEN_NOTIFICATION_URL",
                        url: urlToOpen
                    });
                    return;
                }
            }

            // Jeśli NIE MA otwartego okna → otwórz nowe
            return clients.openWindow(urlToOpen);
        })
    );
});
