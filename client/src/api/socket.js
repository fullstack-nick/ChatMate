import { io } from "socket.io-client";
export const socket = io("http://localhost:3500", {
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
