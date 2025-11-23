import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
        react(),

        // PWA BEZ SERVICE WORKERA – manifest + ikony działają,
        // ale nie generuje sw.js ani workbox!
        VitePWA({
            registerType: "autoUpdate",

            // WYŁĄCZAMY WSZYSTKIE FUNKCJE SERVICE WORKERA
            workbox: false,
            injectRegister: false,

            // Zostaje tylko manifest
            manifest: {
                name: "BarberBook",
                short_name: "BarberBook",
                description: "Rezerwuj wizyty u barberów i stylistów",
                theme_color: "#1d1d1f",
                background_color: "#1d1d1f",
                display: "standalone",
                start_url: "/",
                icons: [
                    {
                        src: "pwa-192x192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "pwa-512x512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                ],
            },
        }),
    ],

    define: {
        "process.env": {},
    },
});
