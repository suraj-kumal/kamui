class P2PFileShare {
  constructor() {
    this.socket = null;
    this.deviceId = this.generateDeviceName();
    this.peerConnections = {};
    this.selectedPeer = null;
    this.currentFiles = [];
    this.chunkSize = 8192;
    this.isInitiator = false;
    this.networkIP = null;
    this.transferQueue = [];
    this.isTransferring = false;
    this.isTransferComplete = false;

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
        "Click on a peer device to start sharing files. Files are transferred directly between devices using WebRTC."
      );
    });

    document.getElementById("themeButton").addEventListener("click", () => {
      document.body.style.backgroundColor =
        document.body.style.backgroundColor === "white" ? "#1a1a1a" : "white";

      const elements = document.getElementsByClassName("peer-info");
      for (let i = 0; i < elements.length; i++) {
        elements[i].style.color =
          elements[i].style.color === "black" ? "white" : "black";
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
          peer.networkIP === this.networkIP && peer.deviceId !== this.deviceId
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

    if (
      !this.peerConnections[peerId] ||
      this.peerConnections[peerId].connectionState === "closed" ||
      this.peerConnections[peerId].connectionState === "failed" ||
      this.peerConnections[peerId]?.dataChannel?.readyState !== "open"
    ) {
      this.resetConnection(peerId);
      this.isInitiator = true;
      this.createPeerConnection(peerId);
    } else {
      document.getElementById("fileInput").click();
    }
  }

  updateTransferStatus(peerId, status, progress = 0) {
    const peerEl = Array.from(document.querySelectorAll(".peer")).find(
      (el) => el.querySelector(".peer-info").textContent === peerId
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

  async createPeerConnection(peerId) {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this.peerConnections[peerId] = peerConnection;

    peerConnection.onconnectionstatechange = () => {
      if (
        peerConnection.connectionState === "failed" ||
        peerConnection.connectionState === "closed"
      ) {
        this.updateTransferStatus(peerId, "Connection lost");
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
      this.setupDataChannel(event.channel, peerId);
    };

    if (this.isInitiator) {
      const dataChannel = peerConnection.createDataChannel("fileTransfer");
      this.setupDataChannel(dataChannel, peerId);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

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

    dataChannel.onopen = () => {
      this.updateTransferStatus(peerId, "Connected");
      if (this.isInitiator) {
        document.getElementById("fileInput").click();
      }
    };

    dataChannel.onclose = () => {
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
        const message = JSON.parse(data);

        if (message.type === "batch-start") {
          totalFiles = message.totalFiles;
          currentFileIndex = 0;
          this.isTransferComplete = false;
        } else if (message.type === "file-start") {
          fileInfo = message;
          receivedSize = 0;
          fileBuffer = [];
          currentFileIndex = message.fileIndex;
          this.updateTransferStatus(
            peerId,
            `Receiving file ${currentFileIndex}/${totalFiles}:`,
            0
          );
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
      } else {
        fileBuffer.push(data);
        receivedSize += data.byteLength;

        const progress = (receivedSize / fileInfo.fileSize) * 100;
        this.updateTransferStatus(
          peerId,
          `Receiving file ${currentFileIndex}/${totalFiles}:`,
          progress
        );

        if (receivedSize === fileInfo.fileSize) {
          const file = new Blob(fileBuffer);
          const downloadUrl = URL.createObjectURL(file);
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = fileInfo.fileName;
          a.click();
          URL.revokeObjectURL(downloadUrl);
          fileBuffer = [];

          if (currentFileIndex === totalFiles) {
            this.updateTransferStatus(peerId, "Transfer complete!");
          }
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
    this.isInitiator = false;
    this.isTransferComplete = false;
  }

  async handleSignaling(data) {
    try {
      if (!this.peerConnections[data.from]) {
        this.isInitiator = false;
        await this.createPeerConnection(data.from);
      }

      const peerConnection = this.peerConnections[data.from];

      if (data.type === "offer") {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        this.socket.emit("signal", {
          type: "answer",
          answer: answer,
          from: this.deviceId,
          to: data.from,
        });
      } else if (data.type === "answer") {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
      } else if (data.type === "candidate") {
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
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

  async sendFiles(files) {
    const dataChannel = this.peerConnections[this.selectedPeer]?.dataChannel;

    if (!dataChannel || dataChannel.readyState !== "open") {
      this.updateTransferStatus(this.selectedPeer, "Reconnecting...");
      await this.reconnectAndRetry(files);
      return;
    }
    this.isTransferComplete = false;
    dataChannel.send(
      JSON.stringify({ type: "batch-start", totalFiles: files.length })
    );

    for (let i = 0; i < files.length; i++) {
      await this.sendFile(files[i], i + 1, files.length);
    }

    dataChannel.send(JSON.stringify({ type: "batch-end" }));
    // this.isTransferComplete = true;
  }

  async reconnectAndRetry(files) {
    this.resetConnection(this.selectedPeer);
    this.isInitiator = true;
    await this.createPeerConnection(this.selectedPeer);

    return new Promise((resolve) => {
      const checkConnection = setInterval(() => {
        const newDataChannel =
          this.peerConnections[this.selectedPeer]?.dataChannel;
        if (newDataChannel?.readyState === "open") {
          clearInterval(checkConnection);
          this.sendFiles(files);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkConnection);
        this.updateTransferStatus(this.selectedPeer, "Connection failed");
        setTimeout(() => {
          this.updateTransferStatus(this.selectedPeer, "");
        }, 3000);
        resolve();
      }, 10000);
    });
  }

  async sendFile(file, fileIndex = 1, totalFiles = 1) {
    return new Promise((resolve) => {
      const dataChannel = this.peerConnections[this.selectedPeer]?.dataChannel;
      const metadata = {
        type: "file-start",
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileIndex,
        totalFiles,
      };

      dataChannel.send(JSON.stringify(metadata));

      let offset = 0;
      const reader = new FileReader();

      reader.onload = (e) => {
        dataChannel.send(e.target.result);
        offset += e.target.result.byteLength;

        const progress = (offset / file.size) * 100;
        this.updateTransferStatus(
          this.selectedPeer,
          `Sending file ${fileIndex}/${totalFiles}:`,
          progress
        );

        if (offset < file.size) {
          readSlice(offset);
        } else {
          resolve();
        }
      };

      const readSlice = (o) => {
        const slice = file.slice(o, o + this.chunkSize);
        reader.readAsArrayBuffer(slice);
      };

      readSlice(0);
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
