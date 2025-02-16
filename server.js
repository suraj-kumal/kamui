const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use("/images", express.static("public/images"));
const connectedPeers = new Map();

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("register", (data) => {
    const { deviceId, networkIP } = data;
    connectedPeers.set(deviceId, {
      socketId: socket.id,
      deviceId,
      networkIP,
    });

    // Broadcast updated peer list
    io.emit("peer-list", Array.from(connectedPeers.values()));
  });

  socket.on("signal", (data) => {
    const { to, from, type } = data;
    const peer = connectedPeers.get(to);

    if (peer) {
      io.to(peer.socketId).emit("signal", {
        ...data,
        from: from,
      });
    }
  });

  socket.on("disconnect", () => {
    // Find and remove disconnected peer
    for (const [deviceId, peer] of connectedPeers.entries()) {
      if (peer.socketId === socket.id) {
        connectedPeers.delete(deviceId);
        break;
      }
    }

    // Broadcast updated peer list
    io.emit("peer-list", Array.from(connectedPeers.values()));
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Error handling
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

server.on("error", (error) => {
  console.error("Server error:", error);
});
