export function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker
                .register("/service-worker.js")
                .then((reg) => {
                    console.log("SW zarejestrowany:", reg.scope);
                })
                .catch((err) => {
                    console.error("SW b³¹d rejestracji:", err);
                });
        });
    }
}
