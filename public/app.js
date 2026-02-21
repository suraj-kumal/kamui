class P2PFileShare {
  constructor() {
    this.socket = null;
    this.deviceId = this.generateDeviceName();
    this.peerConnections = {};
    this.selectedPeer = null;
    this.currentFiles = [];
    this.isInitiator = false;
    this.networkIP = null;
    this.transferQueue = [];
    this.isTransferring = false;
    this.isTransferComplete = false;
    this.iceCandidateQueue = {};
    this.pendingConnections = {}; // Track connection attempts
    this.initializeUI();
    this.getNetworkIP().then(() => {
      this.connectToServer();
    });
  }

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
      return this.networkIP;
    } catch (err) {
      console.error("Error getting IP:", err);
      return null;
    }
  }

  // Dynamic chunk size calculator
  getOptimalChunkSize(fileSize) {
    const KB = 1024;
    const MB = KB * 1024;

    if (fileSize < 100 * KB) {
      return 4 * KB; // Small files: 4KB chunks
    } else if (fileSize < 1 * MB) {
      return 8 * KB; // Small files: 8KB chunks
    } else if (fileSize < 10 * MB) {
      return 16 * KB; // Medium files: 16KB chunks
    } else if (fileSize < 25 * MB) {
      return 32 * KB; // Medium-large files: 32KB chunks
    } else if (fileSize < 50 * MB) {
      return 64 * KB; // Large files: 64KB chunks
    } else if (fileSize < 100 * MB) {
      return 128 * KB; // Large files: 128KB chunks
    } else if (fileSize < 200 * MB) {
      return 256 * KB; // Very large files: 256KB chunks
    } else if (fileSize < 350 * MB) {
      return 384 * KB; // Very large files: 384KB chunks
    } else if (fileSize < 500 * MB) {
      return 512 * KB; // Very large files: 512KB chunks
    } else if (fileSize < 750 * MB) {
      return 768 * KB; // Huge files: 768KB chunks
    } else if (fileSize < 1 * GB) {
      return 1 * MB; // Huge files: 1MB chunks
    } else {
      return 2 * MB; // Extremely large files: 2MB chunks
    }
  }

  initializeUI() {
    document.getElementById("deviceName").textContent = this.deviceId;
    const fileInput = document.getElementById("fileInput");
    fileInput.setAttribute("multiple", "true");
    fileInput.addEventListener("change", (e) => {
      this.currentFiles = Array.from(e.target.files);
      if (this.currentFiles.length > 0 && this.selectedPeer) {
        this.sendFiles(this.currentFiles);
      }
    });
    document.getElementById("helpButton").addEventListener("click", () => {
      alert(
        "Click on a peer device to start sharing files. Files are transferred directly between devices using WebRTC.",
      );
    });
    document.getElementById("themeButton").addEventListener("click", () => {
      const isDarkTheme = document.body.classList.contains("dark-theme");
      if (isDarkTheme) {
        document.body.classList.remove("dark-theme");
        document.body.classList.add("light-theme");
        localStorage.setItem("theme", "light");
      } else {
        document.body.classList.remove("light-theme");
        document.body.classList.add("dark-theme");
        localStorage.setItem("theme", "dark");
      }
    });

    // Apply saved theme or default to dark
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.body.classList.add(savedTheme + "-theme");

    // Drag and drop support
    const dropZone = document.body;
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (this.selectedPeer) {
        dropZone.classList.add("drag-over");
      }
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      if (this.selectedPeer && e.dataTransfer.files.length > 0) {
        this.currentFiles = Array.from(e.dataTransfer.files);
        this.sendFiles(this.currentFiles);
      }
    });
  }

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
        (peer) =>
          peer.networkIP === this.networkIP && peer.deviceId !== this.deviceId,
      );
      this.updatePeerList(sameLANPeers);
    });
    this.socket.on("signal", (data) => this.handleSignaling(data));
  }

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
    document.querySelectorAll(".peer").forEach((peer) => {
      peer.classList.remove("selected");
      if (peer.querySelector(".peer-info").textContent === peerId) {
        peer.classList.add("selected");
      }
    });

    // Check if connection already exists and is open
    const existingConnection = this.peerConnections[peerId];
    if (
      existingConnection &&
      existingConnection.connectionState !== "closed" &&
      existingConnection.connectionState !== "failed" &&
      existingConnection.dataChannel?.readyState === "open"
    ) {
      document.getElementById("fileInput").click();
      return;
    }

    // Check if we're already trying to connect
    if (this.pendingConnections[peerId]) {
      console.log("Connection attempt already in progress");
      return;
    }

    // Use polite peer strategy: lower deviceId becomes initiator
    const shouldInitiate = this.deviceId.localeCompare(peerId) < 0;

    this.resetConnection(peerId);
    this.isInitiator = shouldInitiate;
    this.pendingConnections[peerId] = true;

    // Both peers create connection; only initiator creates offer
    console.log(
      `${this.deviceId} ${shouldInitiate ? "initiating" : "waiting for"} connection with ${peerId}`,
    );
    this.createPeerConnection(peerId, shouldInitiate);
    this.updateTransferStatus(peerId, "Connecting...");
  }

  updateTransferStatus(peerId, status, progress = 0) {
    const peerEl = Array.from(document.querySelectorAll(".peer")).find(
      (el) => el.querySelector(".peer-info").textContent === peerId,
    );
    if (peerEl) {
      const tooltip = peerEl.querySelector(".status-tooltip");
      const progressRing = peerEl.querySelector(".progress-ring");
      if (progress > 0) {
        tooltip.textContent = `${status} ${Math.round(progress)}%`;
        tooltip.style.opacity = "1";
        peerEl.classList.add("transferring");
        progressRing.style.background = `conic-gradient(#2ecc71 ${
          progress * 3.6
        }deg, transparent 0deg)`;
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
  }

  async createPeerConnection(peerId, shouldInitiate = true) {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });
    this.peerConnections[peerId] = peerConnection;
    this.iceCandidateQueue[peerId] = [];

    peerConnection.onconnectionstatechange = () => {
      console.log(
        `Connection state with ${peerId}:`,
        peerConnection.connectionState,
      );

      if (peerConnection.connectionState === "connected") {
        delete this.pendingConnections[peerId];
        this.updateTransferStatus(peerId, "Connected");
      } else if (
        peerConnection.connectionState === "failed" ||
        peerConnection.connectionState === "closed"
      ) {
        delete this.pendingConnections[peerId];
        this.updateTransferStatus(peerId, "Connection lost");
        setTimeout(() => {
          this.updateTransferStatus(peerId, "");
        }, 3000);
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("signal", {
          type: "candidate",
          candidate: event.candidate,
          from: this.deviceId,
          to: peerId,
        });
      }
    };

    peerConnection.ondatachannel = (event) => {
      console.log(`Data channel received from ${peerId}`);
      this.setupDataChannel(event.channel, peerId);
    };

    if (shouldInitiate) {
      const dataChannel = peerConnection.createDataChannel("fileTransfer");
      this.setupDataChannel(dataChannel, peerId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      console.log(`Sending offer to ${peerId}`);
      this.socket.emit("signal", {
        type: "offer",
        offer: offer,
        from: this.deviceId,
        to: peerId,
      });
    }
  }

  setupDataChannel(dataChannel, peerId) {
    let receivedSize = 0;
    let fileInfo = null;
    let fileBuffer = [];
    let currentFileIndex = 0;
    let totalFiles = 0;
    let expectedChunks = 0;
    let receivedChunks = 0;

    dataChannel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`);
      delete this.pendingConnections[peerId];
      this.updateTransferStatus(peerId, "Connected");

      // Auto-open file picker only if this peer initiated the selection
      if (this.isInitiator && this.selectedPeer === peerId) {
        setTimeout(() => {
          document.getElementById("fileInput").click();
        }, 100);
      }
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed with ${peerId}`);
      if (!this.isTransferComplete) {
        this.updateTransferStatus(peerId, "Connection closed");
        setTimeout(() => {
          this.updateTransferStatus(peerId, "");
        }, 3000);
      }
    };

    dataChannel.onerror = (error) => {
      console.error("DataChannel error:", error);
      this.updateTransferStatus(peerId, "Connection error");
      setTimeout(() => {
        this.updateTransferStatus(peerId, "");
      }, 3000);
    };

    dataChannel.onmessage = (event) => {
      const data = event.data;
      if (typeof data === "string") {
        try {
          const message = JSON.parse(data);

          if (message.type === "batch-start") {
            totalFiles = message.totalFiles;
            currentFileIndex = 0;
            this.isTransferComplete = false;
          } else if (message.type === "file-start") {
            if (
              !message.fileName ||
              !message.fileSize ||
              message.fileSize < 0
            ) {
              console.error("Invalid file metadata received");
              return;
            }
            fileInfo = message;
            receivedSize = 0;
            fileBuffer = [];
            receivedChunks = 0;
            expectedChunks = Math.ceil(message.fileSize / message.chunkSize);
            currentFileIndex = message.fileIndex;
            this.updateTransferStatus(
              peerId,
              `Receiving file ${currentFileIndex}/${totalFiles}:`,
              0,
            );
            // Send ready acknowledgment
            dataChannel.send(JSON.stringify({ type: "ready" }));
          } else if (message.type === "batch-end") {
            this.isTransferComplete = true;
            this.updateTransferStatus(peerId, "All files received!");
            dataChannel.send(JSON.stringify({ type: "transfer-complete" }));
            setTimeout(() => {
              this.updateTransferStatus(peerId, "");
              this.resetConnection(peerId);
            }, 3000);
          } else if (message.type === "transfer-complete") {
            this.isTransferComplete = true;
            this.updateTransferStatus(peerId, "Files sent successfully!");
            setTimeout(() => {
              this.updateTransferStatus(peerId, "");
              this.resetConnection(peerId);
            }, 3000);
          }
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      } else {
        if (!fileInfo) {
          console.error("Received data without file info");
          return;
        }

        fileBuffer.push(data);
        receivedSize += data.byteLength;
        receivedChunks++;

        const progress = (receivedSize / fileInfo.fileSize) * 100;
        this.updateTransferStatus(
          peerId,
          `Receiving file ${currentFileIndex}/${totalFiles}:`,
          progress,
        );

        // Send acknowledgment for every chunk to maintain flow control
        dataChannel.send(
          JSON.stringify({
            type: "chunk-ack",
            receivedChunks: receivedChunks,
            expectedChunks: expectedChunks,
          }),
        );

        if (receivedSize === fileInfo.fileSize) {
          const file = new Blob(fileBuffer, {
            type: fileInfo.fileType || "application/octet-stream",
          });
          const downloadUrl = URL.createObjectURL(file);
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = fileInfo.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);

          fileBuffer = [];
          receivedSize = 0;
          fileInfo = null;
          receivedChunks = 0;
          expectedChunks = 0;
        } else if (receivedSize > fileInfo.fileSize) {
          console.error("Received more data than expected");
          fileBuffer = [];
          receivedSize = 0;
          fileInfo = null;
          receivedChunks = 0;
          expectedChunks = 0;
        }
      }
    };
    this.peerConnections[peerId].dataChannel = dataChannel;
  }

  resetConnection(peerId) {
    if (this.peerConnections[peerId]) {
      if (this.peerConnections[peerId].dataChannel) {
        this.peerConnections[peerId].dataChannel.close();
      }
      this.peerConnections[peerId].close();
      delete this.peerConnections[peerId];
    }
    delete this.iceCandidateQueue[peerId];
    delete this.pendingConnections[peerId];
    this.isInitiator = false;
    this.isTransferComplete = false;
  }

  async handleSignaling(data) {
    try {
      console.log(`Received signal from ${data.from}:`, data.type);

      // Handle glare (both peers sent offers)
      if (data.type === "offer" && this.peerConnections[data.from]) {
        const existingConnection = this.peerConnections[data.from];

        // If we have an ongoing connection attempt, use polite peer strategy
        if (existingConnection.signalingState !== "stable") {
          const shouldIgnore = this.deviceId.localeCompare(data.from) < 0;

          if (shouldIgnore) {
            console.log(`Ignoring offer from ${data.from} (polite peer)`);
            return;
          } else {
            console.log(
              `Rolling back for offer from ${data.from} (impolite peer)`,
            );
            await existingConnection.setLocalDescription({ type: "rollback" });
            this.isInitiator = false;
          }
        }
      }

      if (!this.peerConnections[data.from]) {
        this.isInitiator = false;
        await this.createPeerConnection(data.from, false);
      }

      const peerConnection = this.peerConnections[data.from];

      if (data.type === "offer") {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.offer),
        );
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log(`Sending answer to ${data.from}`);
        this.socket.emit("signal", {
          type: "answer",
          answer: answer,
          from: this.deviceId,
          to: data.from,
        });

        await this.processQueuedCandidates(data.from);
      } else if (data.type === "answer") {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.answer),
        );

        await this.processQueuedCandidates(data.from);
      } else if (data.type === "candidate") {
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(data.candidate),
          );
        } else {
          this.iceCandidateQueue[data.from].push(data.candidate);
        }
      }
    } catch (error) {
      console.error("Error in signaling:", error);
      this.updateTransferStatus(data.from, "Connection error");
      setTimeout(() => {
        this.updateTransferStatus(data.from, "");
        this.resetConnection(data.from);
      }, 3000);
    }
  }

  async processQueuedCandidates(peerId) {
    const peerConnection = this.peerConnections[peerId];
    if (!peerConnection || !this.iceCandidateQueue[peerId]) return;

    const candidates = this.iceCandidateQueue[peerId];
    for (const candidate of candidates) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Error adding queued ICE candidate:", error);
      }
    }
    this.iceCandidateQueue[peerId] = [];
  }

  async sendFiles(files) {
    const dataChannel = this.peerConnections[this.selectedPeer]?.dataChannel;
    if (!dataChannel || dataChannel.readyState !== "open") {
      this.updateTransferStatus(this.selectedPeer, "Reconnecting...");
      await this.reconnectAndRetry(files);
      return;
    }
    this.isTransferComplete = false;
    dataChannel.send(
      JSON.stringify({ type: "batch-start", totalFiles: files.length }),
    );
    for (let i = 0; i < files.length; i++) {
      await this.sendFile(files[i], i + 1, files.length);
    }
    dataChannel.send(JSON.stringify({ type: "batch-end" }));
  }

  async reconnectAndRetry(files) {
    try {
      this.resetConnection(this.selectedPeer);
      this.isInitiator = true;
      await this.createPeerConnection(this.selectedPeer, true);

      return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 100;

        const checkConnection = setInterval(() => {
          attempts++;
          const newDataChannel =
            this.peerConnections[this.selectedPeer]?.dataChannel;
          if (newDataChannel?.readyState === "open") {
            clearInterval(checkConnection);
            this.sendFiles(files);
            resolve();
          } else if (attempts >= maxAttempts) {
            clearInterval(checkConnection);
            this.updateTransferStatus(this.selectedPeer, "Connection failed");
            setTimeout(() => {
              this.updateTransferStatus(this.selectedPeer, "");
            }, 3000);
            reject(new Error("Connection timeout"));
          }
        }, 100);
      });
    } catch (error) {
      console.error("Reconnection failed:", error);
      this.updateTransferStatus(this.selectedPeer, "Connection failed");
      setTimeout(() => {
        this.updateTransferStatus(this.selectedPeer, "");
      }, 3000);
    }
  }

  async sendFile(file, fileIndex = 1, totalFiles = 1) {
    return new Promise((resolve, reject) => {
      const dataChannel = this.peerConnections[this.selectedPeer]?.dataChannel;

      if (!dataChannel || dataChannel.readyState !== "open") {
        reject(new Error("Data channel not ready"));
        return;
      }

      const chunkSize = this.getOptimalChunkSize(file.size);
      const metadata = {
        type: "file-start",
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileIndex,
        totalFiles,
        chunkSize,
      };

      // Wait for receiver to be ready
      let canSendNextChunk = true;
      const maxBufferSize = 1024 * 1024; // 1MB buffer limit
      let offset = 0;
      const reader = new FileReader();

      // Handle flow control acknowledgments
      const messageHandler = (event) => {
        if (typeof event.data === "string") {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "chunk-ack") {
              canSendNextChunk = true;
              sendNextChunk();
            } else if (message.type === "ready") {
              // Start sending chunks when receiver is ready
              canSendNextChunk = true;
              sendNextChunk();
            }
          } catch (error) {
            console.error("Error parsing message:", error);
          }
        }
      };

      dataChannel.addEventListener("message", messageHandler);

      const cleanup = () => {
        dataChannel.removeEventListener("message", messageHandler);
      };

      const sendNextChunk = () => {
        if (!canSendNextChunk || dataChannel.bufferedAmount > maxBufferSize) {
          setTimeout(sendNextChunk, 100);
          return;
        }

        if (offset >= file.size) {
          cleanup();
          resolve();
          return;
        }

        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
      };

      reader.onerror = (error) => {
        console.error("FileReader error:", error);
        cleanup();
        reject(error);
      };

      reader.onload = (e) => {
        try {
          dataChannel.send(e.target.result);
          offset += e.target.result.byteLength;
          canSendNextChunk = false;

          const progress = (offset / file.size) * 100;
          this.updateTransferStatus(
            this.selectedPeer,
            `Sending file ${fileIndex}/${totalFiles}:`,
            progress,
          );
        } catch (error) {
          console.error("Error sending chunk:", error);
          cleanup();
          reject(error);
        }
      };

      // Start the transfer process by sending metadata
      dataChannel.send(JSON.stringify(metadata));
    });
  }
}

const p2pShare = new P2PFileShare();

window.addEventListener("resize", () => {
  const peers = document.querySelectorAll(".peer");
  peers.forEach((peer, index) => {
    p2pShare.positionPeer(peer, index, peers.length);
  });
});
