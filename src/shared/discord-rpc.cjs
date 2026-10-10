const net = require('node:net');

const DEFAULT_CLIENT_ID = '1558499625999007914';

class DiscordRpcClient {
  constructor(clientId = DEFAULT_CLIENT_ID) {
    this.clientId = clientId;
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.currentActivity = null;
    this.currentPid = null;
    this.reconnectTimer = null;
    this.enabled = true;
  }

  encode(opcode, data) {
    const payload = Buffer.from(JSON.stringify(data));
    const packet = Buffer.alloc(8 + payload.length);
    packet.writeInt32LE(opcode, 0);
    packet.writeInt32LE(payload.length, 4);
    payload.copy(packet, 8);
    return packet;
  }

  async connect() {
    if (!this.enabled || this.connected || this.connecting) return;
    this.connecting = true;

    for (let i = 0; i < 10; i++) {
      const pipePath = process.platform === 'win32'
        ? `\\\\.\\pipe\\discord-ipc-${i}`
        : `${process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || '/tmp'}/discord-ipc-${i}`;

      const connected = await new Promise(resolve => {
        let sock;
        try {
          sock = net.createConnection(pipePath, () => {
            this.socket = sock;
            this.setupSocket();
            resolve(true);
          });
          sock.unref();
          sock.once('error', () => {
            sock.destroy();
            resolve(false);
          });
        } catch {
          resolve(false);
        }
      });

      if (connected) break;
    }

    this.connecting = false;
  }

  setupSocket() {
    if (!this.socket) return;
    this.socket.unref();
    this.socket.on('error', () => {
      this.cleanup();
    });
    this.socket.on('close', () => {
      this.cleanup();
    });
    this.socket.on('data', data => {
      try {
        if (data.length < 8) return;
        const opcode = data.readInt32LE(0);
        const length = data.readInt32LE(4);
        const payload = JSON.parse(data.subarray(8, 8 + length).toString());
        if (opcode === 1 && payload.evt === 'READY') {
          this.connected = true;
          if (this.currentActivity) {
            this.sendActivity(this.currentActivity, this.currentPid);
          }
        }
      } catch {
        // Ignore parse errors from partial socket frames
      }
    });

    // Send Handshake (opcode 0)
    try {
      this.socket.write(this.encode(0, { v: 1, client_id: this.clientId }));
    } catch {
      this.cleanup();
    }
  }

  cleanup() {
    this.connected = false;
    this.connecting = false;
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }
  }

  destroy() {
    this.setEnabled(false);
    this.cleanup();
  }

  sendActivity(activity, pid) {
    if (!this.socket || !this.connected) return;
    try {
      const frame = {
        cmd: 'SET_ACTIVITY',
        args: {
          pid: pid || this.currentPid || process.pid,
          activity
        },
        nonce: Math.random().toString(36).slice(2)
      };
      this.socket.write(this.encode(1, frame));
    } catch {
      this.cleanup();
    }
  }

  setActivity(activity, pid) {
    this.currentActivity = activity;
    this.currentPid = pid || process.pid;
    if (!this.enabled) return;
    if (!this.connected) {
      this.connect();
      return;
    }
    this.sendActivity(activity, this.currentPid);
  }

  clearActivity() {
    this.currentActivity = null;
    if (this.connected && this.socket) {
      this.sendActivity(null);
    }
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
    if (!this.enabled) {
      this.clearActivity();
      this.cleanup();
    } else if (this.currentActivity) {
      this.connect();
    }
  }

  destroy() {
    this.clearActivity();
    this.cleanup();
  }
}

module.exports = { DiscordRpcClient };
