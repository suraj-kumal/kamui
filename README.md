# kamui

Local file sharing in your browser.
Just open the [website](https://kamui.onthewifi.com) and share files directly between browsers!

## Features

- 📱 No app installation required
- 💻 Works on all modern browsers and platforms
- 🔍 Automatic device discovery in local networks
- 📂 Multiple file selection support

## Built with

- Vanilla HTML5 / ES6 / CSS3 frontend
- WebRTC for peer-to-peer file transfer
- NodeJS backend
- Socket.io for signaling server

## Getting Started

### Prerequisites

- Node.js 20.x or Docker
- Modern web browser

### Installation

1. Clone the repository

```bash
git clone https://github.com/suraj-kumal/kamui.git
cd kamui
```

2. Choose one method to run:

#### Using Docker

```bash
# Build the Docker image
docker build -t kamui .

# Run the container
docker run -p 3000:3000 kamui
```

#### Using Node.js directly

```bash
# Install dependencies
npm install

# Start the server
npm start
```

### Usage

1. Open http://localhost:3000 in your browser
2. Allow the necessary permissions when prompted
3. Start sharing files with other devices on your network!
