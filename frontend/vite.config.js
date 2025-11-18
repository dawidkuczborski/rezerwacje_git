import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true, // ✅ działa w trybie npm run dev
      },
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

  // 👇 DODAJ TO, ŻEBY NAPRAWIĆ BŁĄD "process is not defined"
  define: {
    'process.env': {}, // <- zapobiega ReferenceError w przeglądarce
  },
});
