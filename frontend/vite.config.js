import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",

      // 🔧 ważna poprawka — wcześniej było enabled: true
      devOptions: {
        enabled: process.env.NODE_ENV !== "production",
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

  // 👇 to zostaje — naprawia `process is not defined` na froncie
  define: {
    "process.env": {},
  },

  // ⚠️ Jeśli kiedyś hostujesz w subfolderze — odkomentuj ↓
  // base: "/",
});
