class P2PFileShare {
  constructor() {
    this.socket = null;
    this.deviceId = this.generateDeviceName();
    this.networkIP = null;
    this.selectedPeer = null;

    this.initializeUI();
    this.getNetworkIP().then(() => this.connectToServer());
  }

  // ─── Identity ──────────────────────────────────────────────────────────────

  generateDeviceName() {
    const adjectives = [
      "Quick",
      "Smart",
      "Cool",
      "Fast",
      "Bright",
      "Brave",
      "Swift",
    ];
    const nouns = ["Fox", "Bear", "Lion", "Wolf", "Tiger", "Dragon", "Shark"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${
      nouns[Math.floor(Math.random() * nouns.length)]
    }`;
  }

  async getNetworkIP() {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      this.networkIP = data.ip;
    } catch (err) {
      console.error("Error getting IP:", err);
    }
  }

  // ─── Chunk Size ────────────────────────────────────────────────────────────

  // getOptimalChunkSize(fileSize) {
  //   const KB = 1024;
  //   const MB = KB * 1024;
  //   if (fileSize < 100 * KB) return 4 * KB;
  //   if (fileSize < 1 * MB) return 8 * KB;
  //   if (fileSize < 10 * MB) return 16 * KB;
  //   if (fileSize < 25 * MB) return 32 * KB;
  //   if (fileSize < 50 * MB) return 64 * KB;
  //   if (fileSize < 100 * MB) return 128 * KB;
  //   if (fileSize < 200 * MB) return 256 * KB;
  //   if (fileSize < 350 * MB) return 384 * KB;
  //   if (fileSize < 500 * MB) return 512 * KB;
  //   if (fileSize < 750 * MB) return 768 * KB;
  //   return 1 * MB;
  // }
  getOptimalChunkSize(fileSize) {
    const KB = 1024;
    const MB = KB * 1024;
    if (fileSize < 100 * KB) return 4 * KB;
    if (fileSize < 1 * MB) return 8 * KB;
    if (fileSize < 10 * MB) return 16 * KB;
    if (fileSize < 25 * MB) return 32 * KB;
    if (fileSize < 50 * MB) return 64 * KB;
    if (fileSize < 100 * MB) return 128 * KB;
    return 256 * KB; // ✅ hard cap — Safari and Firefox safe
  }

  // ─── UI ────────────────────────────────────────────────────────────────────

  initializeUI() {
    document.getElementById("deviceName").textContent = this.deviceId;

    const fileInput = document.getElementById("fileInput");
    fileInput.setAttribute("multiple", "true");

    fileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0 && this.selectedPeer) {
        this.sendFiles(files);
      }
      // Reset so the same file can be selected again next time
      fileInput.value = "";
    });

    document.getElementById("helpButton").addEventListener("click", () => {
      alert(
        "Click on a peer device to start sharing files. Files are transferred directly between devices using WebRTC.",
      );
    });

    document.getElementById("themeButton").addEventListener("click", () => {
      const isDark = document.body.classList.contains("dark-theme");
      document.body.classList.toggle("dark-theme", !isDark);
      document.body.classList.toggle("light-theme", isDark);
      localStorage.setItem("theme", isDark ? "light" : "dark");
    });

    const savedTheme = localStorage.getItem("theme") || "dark";
    document.body.classList.add(savedTheme + "-theme");

    // Drag and drop
    document.body.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (this.selectedPeer) document.body.classList.add("drag-over");
    });

    document.body.addEventListener("dragleave", () => {
      document.body.classList.remove("drag-over");
    });

    document.body.addEventListener("drop", (e) => {
      e.preventDefault();
      document.body.classList.remove("drag-over");
      const files = Array.from(e.dataTransfer.files);
      if (this.selectedPeer && files.length > 0) {
        this.sendFiles(files);
      }
    });
  }

  // ─── Server ────────────────────────────────────────────────────────────────

  connectToServer() {
    this.socket = io();

    this.socket.on("connect", () => {
      this.socket.emit("register", {
        deviceId: this.deviceId,
        networkIP: this.networkIP,
      });
    });

    this.socket.on("peer-list", (peers) => {
      const sameLANPeers = peers.filter(
        (p) => p.networkIP === this.networkIP && p.deviceId !== this.deviceId,
      );
      this.updatePeerList(sameLANPeers);
    });

    // All incoming signals — receiver side handles offers, sender side handles answers/candidates
    this.socket.on("signal", (data) => this.handleIncomingSignal(data));
  }

  // ─── Peer List UI ──────────────────────────────────────────────────────────

  positionPeer(element, index, total) {
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.3;
    const angle = (index / total) * 2 * Math.PI;
    const x = radius * Math.cos(angle) + window.innerWidth / 2 - 30;
    const y = radius * Math.sin(angle) + window.innerHeight / 2 - 30;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }

  updatePeerList(peers) {
    const container = document.getElementById("peerContainer");
    container.innerHTML = "";

    peers.forEach((peer, index) => {
      const peerEl = document.createElement("div");
      peerEl.className = "peer";
      if (peer.deviceId === this.selectedPeer) {
        peerEl.classList.add("selected");
      }
      peerEl.innerHTML = `
        <div class="peer-icon"></div>
        <div class="peer-info">${peer.deviceId}</div>
        <div class="status-tooltip"></div>
        <div class="progress-ring"></div>
      `;
      this.positionPeer(peerEl, index, peers.length);
      peerEl.addEventListener("click", () => this.selectPeer(peer.deviceId));
      container.appendChild(peerEl);
    });
  }

  selectPeer(peerId) {
    this.selectedPeer = peerId;

    document.querySelectorAll(".peer").forEach((el) => {
      el.classList.remove("selected");
      if (el.querySelector(".peer-info").textContent === peerId) {
        el.classList.add("selected");
      }
    });

    // No connection here — just open file picker
    // Connection is created only when actually sending
    document.getElementById("fileInput").click();
  }

  // ─── Status UI ─────────────────────────────────────────────────────────────

  updateTransferStatus(peerId, status, progress = 0) {
    const peerEl = Array.from(document.querySelectorAll(".peer")).find(
      (el) => el.querySelector(".peer-info").textContent === peerId,
    );
    if (!peerEl) return;

    const tooltip = peerEl.querySelector(".status-tooltip");
    const progressRing = peerEl.querySelector(".progress-ring");

    if (progress > 0) {
      tooltip.textContent = `${status} ${Math.round(progress)}%`;
      tooltip.style.opacity = "1";
      peerEl.classList.add("transferring");
      progressRing.style.background = `conic-gradient(#2ecc71 ${progress * 3.6}deg, transparent 0deg)`;
    } else {
      tooltip.textContent = status;
      if (status === "") {
        tooltip.style.opacity = "0";
        peerEl.classList.remove("transferring");
        progressRing.style.background = "transparent";
      } else {
        tooltip.style.opacity = "1";
      }
    }
  }

  // ─── Sender Side ───────────────────────────────────────────────────────────

  async sendFiles(files) {
    const peerId = this.selectedPeer;
    if (!peerId) return;

    let pc = null;

    try {
      this.updateTransferStatus(peerId, "Connecting...");

      // Fresh connection created only at send time
      const { peerConnection, dataChannel } =
        await this.createSenderConnection(peerId);
      pc = peerConnection;

      this.updateTransferStatus(peerId, "Sending...");

      dataChannel.send(
        JSON.stringify({ type: "batch-start", totalFiles: files.length }),
      );

      for (let i = 0; i < files.length; i++) {
        await this.sendFile(dataChannel, files[i], i + 1, files.length, peerId);
      }

      dataChannel.send(JSON.stringify({ type: "batch-end" }));

      // Wait for receiver to acknowledge
      await this.waitForAck(dataChannel);

      this.updateTransferStatus(peerId, "Sent successfully!");
    } catch (err) {
      console.error("Transfer failed:", err);
      this.updateTransferStatus(peerId, "Transfer failed");
    } finally {
      // Always destroy connection after transfer — ephemeral by design
      setTimeout(() => {
        if (pc) pc.close();
        this.updateTransferStatus(peerId, "");
      }, 3000);
    }
  }

  createSenderConnection(peerId) {
    return new Promise(async (resolve, reject) => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      const iceCandidateQueue = [];
      let remoteSet = false;

      const dataChannel = pc.createDataChannel("fileTransfer");

      // Timeout if connection takes too long
      const timeout = setTimeout(() => {
        pc.close();
        this.socket.off("signal", signalHandler);
        reject(new Error("Connection timed out"));
      }, 15000);

      dataChannel.onopen = () => {
        clearTimeout(timeout);
        resolve({ peerConnection: pc, dataChannel });
      };

      dataChannel.onerror = (err) => {
        clearTimeout(timeout);
        this.socket.off("signal", signalHandler);
        reject(err);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit("signal", {
            type: "candidate",
            candidate: event.candidate,
            from: this.deviceId,
            to: peerId,
          });
        }
      };

      // Handle answer + candidates coming back from receiver
      const signalHandler = async (data) => {
        if (data.from !== peerId) return;

        try {
          if (data.type === "answer") {
            await pc.setRemoteDescription(
              new RTCSessionDescription(data.answer),
            );
            remoteSet = true;

            // Flush any candidates that arrived before the answer
            for (const c of iceCandidateQueue) {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            }
            iceCandidateQueue.length = 0;
          } else if (data.type === "candidate") {
            if (remoteSet) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
              iceCandidateQueue.push(data.candidate);
            }
          }
        } catch (err) {
          console.error("Sender signal error:", err);
        }
      };

      this.socket.on("signal", signalHandler);

      // Clean up listener when connection is done
      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "closed" ||
          pc.connectionState === "failed"
        ) {
          this.socket.off("signal", signalHandler);
        }
      };

      // Create and send offer to receiver
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.socket.emit("signal", {
        type: "offer",
        offer,
        from: this.deviceId,
        to: peerId,
      });
    });
  }

  async sendFile(dataChannel, file, fileIndex, totalFiles, peerId) {
    return new Promise((resolve, reject) => {
      const chunkSize = this.getOptimalChunkSize(file.size);

      dataChannel.send(
        JSON.stringify({
          type: "file-start",
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || "application/octet-stream",
          fileIndex,
          totalFiles,
          chunkSize,
        }),
      );

      // Use browser's built-in buffer backpressure instead of manual acks
      dataChannel.bufferedAmountLowThreshold = 65536; // 64KB

      let offset = 0;
      const reader = new FileReader();

      const sendNextChunk = () => {
        if (offset >= file.size) {
          resolve();
          return;
        }

        // Pause sending if WebRTC buffer is filling up (> 1MB)
        // if fails use 1024 instead of 256
        if (dataChannel.bufferedAmount > 256 * 1024) {
          dataChannel.onbufferedamountlow = () => {
            dataChannel.onbufferedamountlow = null;
            sendNextChunk();
          };
          return;
        }

        reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
      };

      reader.onload = (e) => {
        try {
          dataChannel.send(e.target.result);
          offset += e.target.result.byteLength;

          this.updateTransferStatus(
            peerId,
            `Sending ${fileIndex}/${totalFiles}:`,
            (offset / file.size) * 100,
          );

          sendNextChunk();
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = reject;

      sendNextChunk();
    });
  }

  waitForAck(dataChannel) {
    return new Promise((resolve) => {
      const handler = (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "transfer-complete") {
              dataChannel.removeEventListener("message", handler);
              resolve();
            }
          } catch (_) {}
        }
      };
      dataChannel.addEventListener("message", handler);

      // Don't block forever if ack is lost
      setTimeout(resolve, 5000);
    });
  }

  // ─── Receiver Side ─────────────────────────────────────────────────────────

  async handleIncomingSignal(data) {
    if (!this._receiverConns) this._receiverConns = {};

    try {
      if (data.type === "offer") {
        // Someone wants to send us files — create a fresh receiver connection
        const conn = this.createReceiverConnection(data.from);
        this._receiverConns[data.from] = conn;

        await conn.pc.setRemoteDescription(
          new RTCSessionDescription(data.offer),
        );

        // Flush any candidates that arrived before the offer
        for (const c of conn.iceCandidateQueue) {
          await conn.pc.addIceCandidate(new RTCIceCandidate(c));
        }
        conn.iceCandidateQueue.length = 0;

        const answer = await conn.pc.createAnswer();
        await conn.pc.setLocalDescription(answer);

        this.socket.emit("signal", {
          type: "answer",
          answer,
          from: this.deviceId,
          to: data.from,
        });
      } else if (data.type === "candidate") {
        // Could be for receiver OR sender side
        // Sender side handles its own candidates inside createSenderConnection
        // Here we only handle candidates for receiver connections
        const conn = this._receiverConns?.[data.from];
        if (!conn) return;

        if (conn.pc.remoteDescription) {
          await conn.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          conn.iceCandidateQueue.push(data.candidate);
        }
      }

      // "answer" signals are consumed by createSenderConnection's signalHandler — ignore here
    } catch (err) {
      console.error("Error handling incoming signal:", err);
    }
  }

  createReceiverConnection(fromPeerId) {
    const iceCandidateQueue = [];

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("signal", {
          type: "candidate",
          candidate: event.candidate,
          from: this.deviceId,
          to: fromPeerId,
        });
      }
    };

    pc.ondatachannel = (event) => {
      this.setupReceiverChannel(event.channel, fromPeerId, pc);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "closed" || pc.connectionState === "failed") {
        delete this._receiverConns?.[fromPeerId];
      }
    };

    return { pc, iceCandidateQueue };
  }

  setupReceiverChannel(dataChannel, fromPeerId, pc) {
    let fileInfo = null;
    let fileBuffer = [];
    let receivedSize = 0;

    //changes
    let bufferedSize = 0;
    const CONSOLIDATE_THRESHOLD = 50 * 1024 * 1024;
    //upto Here

    let currentFileIndex = 0;
    let totalFiles = 0;

    dataChannel.onmessage = (event) => {
      const data = event.data;

      if (typeof data === "string") {
        try {
          const msg = JSON.parse(data);

          if (msg.type === "batch-start") {
            totalFiles = msg.totalFiles;
            currentFileIndex = 0;
          } else if (msg.type === "file-start") {
            fileInfo = msg;
            fileBuffer = [];
            receivedSize = 0;
            currentFileIndex = msg.fileIndex;
            this.updateTransferStatus(
              fromPeerId,
              `Receiving ${currentFileIndex}/${totalFiles}:`,
              0,
            );
          } else if (msg.type === "batch-end") {
            // Acknowledge sender
            dataChannel.send(JSON.stringify({ type: "transfer-complete" }));
            this.updateTransferStatus(fromPeerId, "All files received!");
            setTimeout(() => {
              this.updateTransferStatus(fromPeerId, "");
              pc.close();
            }, 3000);
          }
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      } else {
        // Binary chunk
        if (!fileInfo) return;

        fileBuffer.push(data);
        receivedSize += data.byteLength;

        //changes
        bufferedSize += data.byteLength;

        if (bufferedSize >= CONSOLIDATE_THRESHOLD) {
          fileBuffer = [new Blob(fileBuffer)];
          bufferedSize = 0;
        }

        //upto here

        this.updateTransferStatus(
          fromPeerId,
          `Receiving ${currentFileIndex}/${totalFiles}:`,
          (receivedSize / fileInfo.fileSize) * 100,
        );

        if (receivedSize >= fileInfo.fileSize) {
          const blob = new Blob(fileBuffer, { type: fileInfo.fileType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileInfo.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 100);

          // Reset for next file in batch
          fileBuffer = [];
          receivedSize = 0;
          bufferedSize = 0;
          fileInfo = null;
        }
      }
    };

    dataChannel.onerror = (err) => {
      console.error("Receiver channel error:", err);
      this.updateTransferStatus(fromPeerId, "Transfer error");
      setTimeout(() => this.updateTransferStatus(fromPeerId, ""), 3000);
    };
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────────

const p2pShare = new P2PFileShare();

window.addEventListener("resize", () => {
  const peers = document.querySelectorAll(".peer");
  peers.forEach((peer, index) => {
    p2pShare.positionPeer(peer, index, peers.length);
  });
});
