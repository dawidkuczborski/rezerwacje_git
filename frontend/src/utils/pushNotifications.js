// 🔧 Konwersja klucza publicznego VAPID (base64 → UInt8Array)
const base64UrlToUint8Array = (base64UrlData) => {
    const padding = "=".repeat((4 - base64UrlData.length % 4) % 4);
    const base64 = (base64UrlData + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData = atob(base64);
    const buffer = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        buffer[i] = rawData.charCodeAt(i);
    }

    return buffer;
};

/**
 * 🔔 SUBSKRYPCJA PUSH
 * - działa na iPhone + Android + Desktop
 */
export async function subscribeToPush(publicKey, employeeId) {
    try {
        // 1. Sprawdź wsparcie
        if (!("serviceWorker" in navigator)) {
            alert("Twoja przeglądarka nie obsługuje powiadomień.");
            return null;
        }

        // 2. Poproś o pozwolenie
        const permission = await Notification.requestPermission();

        if (permission !== "granted") {
            alert("Musisz zezwolić na powiadomienia.");
            return null;
        }

        // 3. Poczekaj aż SW się załaduje
        const registration = await navigator.serviceWorker.ready;

        // 4. Subskrypcja na push
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(publicKey),
        });

        console.log("🔔 SUBSKRYPCJA PUSH:", subscription);

        // 5. Wyślij subskrypcję do backendu
        await fetch(import.meta.env.VITE_API_URL + "/push/subscribe", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                employee_id: employeeId,
                subscription,
            }),
        });

        alert("Powiadomienia zostały włączone!");
        return subscription;
    } catch (err) {
        console.error("❌ błąd subskrypcji:", err);
        alert("Błąd podczas subskrypcji powiadomień.");
        return null;
    }
}

/**
 * ❌ WYŁĄCZ SUBSKRYPCJĘ PUSH
 */
export async function unsubscribeFromPush() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
        await subscription.unsubscribe();
        alert("Powiadomienia wyłączone.");
    }
}
