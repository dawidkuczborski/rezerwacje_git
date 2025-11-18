import { io } from "socket.io-client";

export const socket = io(import.meta.env.VITE_API_URL, {
  transports: ["websocket"],        // stabilne połączenie
  reconnection: true,               // automatyczne ponowne łączenie
  reconnectionDelayMax: 4000,       // max 4 sekundy
  withCredentials: true
});
