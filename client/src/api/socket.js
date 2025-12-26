import { io } from "socket.io-client";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:3500";
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket"],
});

export function connectSocket({ accessToken, sessionID }) {
  socket.auth = { accessToken, sessionID };
  socket.connect();
}

export function disconnectSocket() {
  socket.disconnect();
}
