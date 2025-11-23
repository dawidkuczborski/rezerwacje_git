// src/utils/pushNotifications.js

// konwersja VAPID public key → Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function subscribeToPush() {
  try {
    // 1. sprawdź SW
    const sw = await navigator.serviceWorker.ready;

    // 2. pobierz publiczny klucz VAPID z backendu
    const vapidRes = await fetch(`${import.meta.env.VITE_API_URL}/vapid/public`);
    const { key } = await vapidRes.json();

    const convertedKey = urlBase64ToUint8Array(key);

    // 3. poproś o subskrypcję
    const subscription = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey,
    });

    console.log("🔔 Subskrypcja PUSH:", subscription);

    // 4. wyślij subskrypcję do backendu
    const token = localStorage.getItem("token");

    await fetch(`${import.meta.env.VITE_API_URL}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? `Bearer ${token}` : "",
      },
      body: JSON.stringify({ subscription }),
    });

    console.log("✔ Subskrypcja zapisana na backendzie");
    return true;

  } catch (err) {
    console.error("❌ Push subscribe error:", err);
    return false;
  }
}
