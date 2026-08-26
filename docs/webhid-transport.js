/*
 * WebHID transport for the Stadia Dongle USB configuration protocol (v1).
 * Protocol reference: docs/usb-config-protocol.md
 *
 * Protocol designed by jazz-zzzz (stadia-dongle-esp fork); this is an
 * independent English implementation of the same wire format.
 *
 * Pure framing helpers are exported separately from the transport class so
 * they can be unit-tested in Node without a HID device.
 */

export const USB_VENDOR_ID = 0x045e;
export const USB_PRODUCT_ID = 0x0289;
export const USAGE_PAGE = 0xff00;
export const USAGE = 0x01;
export const REPORT_ID = 0x10;
export const REPORT_DATA_SIZE = 63;
export const HEADER_SIZE = 8;
export const MAX_PAYLOAD = REPORT_DATA_SIZE - HEADER_SIZE;
export const MAGIC = 0x53;
export const PROTOCOL_VERSION = 1;

export const CMD = Object.freeze({
  PING: 0x01,
  GET_DEVICE_INFO: 0x02,
  GET_STATUS: 0x03,
  GET_CONFIG: 0x04,
  SET_CONFIG: 0x05,
  GET_CONTROLLER_COUNT: 0x06,
  GET_CONTROLLER: 0x07,
  GET_INPUT: 0x08,
  START_PAIRING: 0x10,
  STOP_PAIRING: 0x11,
  FORGET_CONTROLLER: 0x12,
  FORGET_ALL: 0x13,
  START_WIFI: 0x14,
  STOP_WIFI: 0x15,
  REBOOT: 0x16,
});

export const STATUS = Object.freeze({
  OK: 0,
  PENDING: 1,
  BAD_MAGIC: 2,
  UNSUPPORTED_VERSION: 3,
  UNKNOWN_COMMAND: 4,
  INVALID_PAYLOAD: 5,
  INTERNAL_ERROR: 6,
  BUSY: 7,
  NOT_FOUND: 8,
  UNSUPPORTED: 9,
  NOT_READY: 10,
});

export const STATUS_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k])),
);

// Must match dongle_action_t in main/config_store.h, in enum order.
export const ACTIONS = Object.freeze([
  { value: 0, name: "none", label: "None" },
  { value: 1, name: "f13", label: "F13" },
  { value: 2, name: "f14", label: "F14" },
  { value: 3, name: "printscreen", label: "PrintScreen" },
  { value: 4, name: "escape", label: "Escape" },
  { value: 5, name: "space", label: "Space" },
  { value: 6, name: "enter", label: "Enter" },
  { value: 7, name: "volume_up", label: "Volume Up" },
  { value: 8, name: "volume_down", label: "Volume Down" },
  { value: 9, name: "play_pause", label: "Play/Pause" },
  { value: 10, name: "start_webui", label: "Start Web UI" },
  { value: 11, name: "remote_wake_only", label: "Remote Wake Only" },
  { value: 12, name: "f15", label: "F15" },
  { value: 13, name: "f16", label: "F16" },
  { value: 14, name: "f17", label: "F17" },
  { value: 15, name: "f18", label: "F18" },
  { value: 16, name: "f19", label: "F19" },
  { value: 17, name: "f20", label: "F20" },
  { value: 18, name: "f21", label: "F21" },
  { value: 19, name: "f22", label: "F22" },
  { value: 20, name: "f23", label: "F23" },
  { value: 21, name: "f24", label: "F24" },
  { value: 22, name: "tab", label: "Tab" },
  { value: 23, name: "backspace", label: "Backspace" },
  { value: 24, name: "insert", label: "Insert" },
  { value: 25, name: "delete", label: "Delete" },
  { value: 26, name: "home", label: "Home" },
  { value: 27, name: "end", label: "End" },
  { value: 28, name: "page_up", label: "Page Up" },
  { value: 29, name: "page_down", label: "Page Down" },
  { value: 30, name: "arrow_up", label: "Arrow Up" },
  { value: 31, name: "arrow_down", label: "Arrow Down" },
  { value: 32, name: "arrow_left", label: "Arrow Left" },
  { value: 33, name: "arrow_right", label: "Arrow Right" },
  { value: 34, name: "mute", label: "Mute" },
  { value: 35, name: "scan_next", label: "Next Track" },
  { value: 36, name: "scan_prev", label: "Previous Track" },
]);

export const DONGLE_STATES = Object.freeze([
  "Booting", "Setup (no bonds)", "Scanning", "Pairing", "Connecting",
  "Connected", "Connected + Web UI", "Disconnected", "OTA update", "Error",
]);

export const BUTTON_NAMES = Object.freeze([
  "dpad_up", "dpad_down", "dpad_left", "dpad_right",
  "a", "b", "x", "y", "lb", "rb", "ls", "rs",
  "menu", "options", "stadia", "assistant", "capture",
]);

const readU16 = (b, o) => b[o] | (b[o + 1] << 8);
const readU32 = (b, o) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const readS16 = (b, o) => (readU16(b, o) << 16) >> 16;
const readString = (b, o, len) => {
  let end = o;
  while (end < o + len && b[end] !== 0) end++;
  return new TextDecoder().decode(b.subarray(o, end));
};

export function buildRequest(sequence, command, payload = new Uint8Array(0)) {
  if (payload.length > MAX_PAYLOAD) {
    throw new Error(`payload too long: ${payload.length}`);
  }
  const frame = new Uint8Array(REPORT_DATA_SIZE);
  frame[0] = MAGIC;
  frame[1] = PROTOCOL_VERSION;
  frame[2] = sequence;
  frame[3] = command;
  frame[4] = payload.length;
  frame.set(payload, HEADER_SIZE);
  return frame;
}

export function parseResponse(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < HEADER_SIZE) throw new Error("response too short");
  if (b[0] !== MAGIC) throw new Error("bad magic in response");
  const payloadLen = Math.min(b[5], MAX_PAYLOAD, b.length - HEADER_SIZE);
  return {
    version: b[1],
    sequence: b[2],
    command: b[3],
    status: b[4],
    payload: b.subarray(HEADER_SIZE, HEADER_SIZE + payloadLen),
  };
}

export function encodeConfig(cfg) {
  const p = new Uint8Array(9);
  p[0] = cfg.assistant_short;
  p[1] = cfg.assistant_long;
  p[2] = cfg.capture_short;
  p[3] = cfg.capture_long;
  p[4] = cfg.long_press_ms & 0xff;
  p[5] = (cfg.long_press_ms >> 8) & 0xff;
  p[6] = cfg.webui_timeout_seconds & 0xff;
  p[7] = (cfg.webui_timeout_seconds >> 8) & 0xff;
  p[8] = (cfg.disable_ap_on_suspend ? 1 : 0) | (cfg.webui_auto_start ? 2 : 0);
  return p;
}

export function decodeConfig(payload) {
  if (payload.length < 9) throw new Error("config payload too short");
  return {
    assistant_short: payload[0],
    assistant_long: payload[1],
    capture_short: payload[2],
    capture_long: payload[3],
    long_press_ms: readU16(payload, 4),
    webui_timeout_seconds: readU16(payload, 6),
    disable_ap_on_suspend: (payload[8] & 1) !== 0,
    webui_auto_start: (payload[8] & 2) !== 0,
  };
}

export function decodeDeviceInfo(payload) {
  return {
    protocol_version: payload[0],
    max_controllers: payload[1],
    capabilities: readU32(payload, 2),
    firmware_version: readString(payload, 6, 24),
    build_date: readString(payload, 30, 25),
  };
}

export function decodeStatus(payload) {
  const flags = readU16(payload, 5);
  return {
    uptime_ms: readU32(payload, 0),
    state: payload[4],
    webui_active: (flags & 1) !== 0,
    ble_connected: (flags & 2) !== 0,
    pairing: (flags & 4) !== 0,
    usb_configured: (flags & 8) !== 0,
    usb_suspended: (flags & 16) !== 0,
    remote_wake_enabled: (flags & 32) !== 0,
    ble_ready: (flags & 128) !== 0,
    connected_count: payload[7],
    stored_bonds: payload[8],
    battery_percent: payload[9] === 255 ? null : payload[9],
    webui_auto_off_seconds: readU16(payload, 10),
    controller_address: readString(payload, 12, 18),
    controller_name: readString(payload, 30, 25),
  };
}

export function decodeController(payload) {
  return {
    total: payload[0],
    index: payload[1],
    slot_index: payload[2] === 255 ? null : payload[2],
    usb_gamepad_index: payload[3] === 255 ? null : payload[3],
    bonded: (payload[4] & 1) !== 0,
    connected: (payload[4] & 2) !== 0,
    ready: (payload[4] & 4) !== 0,
    mouse_mode: (payload[4] & 8) !== 0,
    battery_percent: payload[5] === 255 ? null : payload[5],
    address: readString(payload, 6, 18),
    name: readString(payload, 24, 31),
  };
}

export function decodeInput(payload) {
  const mask = readU32(payload, 2);
  const rawLen = Math.min(payload[6], 32);
  return {
    slot: payload[0],
    connected: (payload[1] & 1) !== 0,
    ready: (payload[1] & 2) !== 0,
    mouse_mode: (payload[1] & 4) !== 0,
    pressed: BUTTON_NAMES.filter((_, i) => (mask & (1 << i)) !== 0),
    raw: Array.from(payload.subarray(7, 7 + rawLen)),
    lt: payload[39],
    rt: payload[40],
    lx: readS16(payload, 41),
    ly: readS16(payload, 43),
    rx: readS16(payload, 45),
    ry: readS16(payload, 47),
  };
}

export class DongleTransport {
  constructor(device) {
    this.device = device;
    this.sequence = 0;
    this.chain = Promise.resolve();
  }

  // Serialized: at most one command in flight, as the protocol requires.
  request(command, payload = new Uint8Array(0), { timeoutMs = 3000 } = {}) {
    const run = async () => {
      this.sequence = (this.sequence % 255) + 1;
      const sequence = this.sequence;
      await this.device.sendFeatureReport(
        REPORT_ID, buildRequest(sequence, command, payload));

      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const view = await this.device.receiveFeatureReport(REPORT_ID);
        let bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        // Some HID stacks include the report ID as the first byte.
        if (bytes.length > REPORT_DATA_SIZE && bytes[0] === REPORT_ID) {
          bytes = bytes.subarray(1);
        }
        const response = parseResponse(bytes);
        const matches =
          response.sequence === sequence && response.command === command;
        if (matches && response.status !== STATUS.PENDING) return response;
        if (Date.now() > deadline) {
          throw new Error(
            `timeout waiting for command 0x${command.toString(16)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    const result = this.chain.then(run);
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }

  async command(cmd, payload) {
    const response = await this.request(cmd, payload);
    if (response.status !== STATUS.OK) {
      const name = STATUS_NAMES[response.status] ?? response.status;
      throw new Error(`dongle replied ${name}`);
    }
    return response.payload;
  }
}

export async function requestDongle(hid) {
  const devices = await hid.requestDevice({
    filters: [{
      vendorId: USB_VENDOR_ID,
      productId: USB_PRODUCT_ID,
      usagePage: USAGE_PAGE,
      usage: USAGE,
    }],
  });
  const device = devices?.[0];
  if (!device) return null;
  if (!device.opened) await device.open();
  return new DongleTransport(device);
}
