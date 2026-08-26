import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTIONS, CMD, DongleTransport, HEADER_SIZE, MAGIC, MAX_PAYLOAD,
  PROTOCOL_VERSION, REPORT_DATA_SIZE, REPORT_ID, STATUS,
  buildRequest, decodeConfig, decodeStatus, encodeConfig, parseResponse,
} from "../docs/webhid-transport.js";

test("request frame layout matches the protocol document", () => {
  const frame = buildRequest(7, CMD.GET_CONFIG);
  assert.equal(frame.length, REPORT_DATA_SIZE);
  assert.equal(frame[0], MAGIC);
  assert.equal(frame[1], PROTOCOL_VERSION);
  assert.equal(frame[2], 7);
  assert.equal(frame[3], CMD.GET_CONFIG);
  assert.equal(frame[4], 0);
  assert.ok(frame.subarray(5).every((byte) => byte === 0));
});

test("payload is copied at offset 8 and rejected above 55 bytes", () => {
  const frame = buildRequest(1, CMD.GET_INPUT, new Uint8Array([255]));
  assert.equal(frame[4], 1);
  assert.equal(frame[HEADER_SIZE], 255);
  assert.throws(() => buildRequest(1, CMD.PING, new Uint8Array(MAX_PAYLOAD + 1)));
});

test("response parsing echoes header fields and trims payload", () => {
  const raw = new Uint8Array(REPORT_DATA_SIZE);
  raw[0] = MAGIC; raw[1] = 1; raw[2] = 9; raw[3] = CMD.PING;
  raw[4] = STATUS.OK; raw[5] = 1; raw[HEADER_SIZE] = PROTOCOL_VERSION;
  const response = parseResponse(raw);
  assert.equal(response.sequence, 9);
  assert.equal(response.command, CMD.PING);
  assert.equal(response.status, STATUS.OK);
  assert.deepEqual(Array.from(response.payload), [PROTOCOL_VERSION]);
  assert.throws(() => parseResponse(new Uint8Array(REPORT_DATA_SIZE)));
});

test("config round-trips through encode and decode", () => {
  const config = {
    assistant_short: 2, assistant_long: 10, capture_short: 3, capture_long: 12,
    long_press_ms: 1000, webui_timeout_seconds: 120,
    disable_ap_on_suspend: true, webui_auto_start: true,
  };
  assert.deepEqual(decodeConfig(encodeConfig(config)), config);
});

test("status decoding reads flags, battery sentinel and strings", () => {
  const payload = new Uint8Array(55);
  payload[4] = 5;                       // state = connected
  payload[5] = 0b10000010;              // ble_connected + ble_ready
  payload[7] = 1; payload[8] = 2; payload[9] = 255;
  new TextEncoder().encodeInto("AA:BB:CC:DD:EE:FF", payload.subarray(12));
  const status = decodeStatus(payload);
  assert.equal(status.state, 5);
  assert.equal(status.ble_connected, true);
  assert.equal(status.ble_ready, true);
  assert.equal(status.webui_active, false);
  assert.equal(status.battery_percent, null);
  assert.equal(status.controller_address, "AA:BB:CC:DD:EE:FF");
});

test("action table is dense and matches dongle_action_t ordering", () => {
  ACTIONS.forEach((action, index) => assert.equal(action.value, index));
});

class FakeDevice {
  constructor(responses) {
    this.responses = responses;
    this.sent = [];
  }
  async sendFeatureReport(reportId, data) {
    assert.equal(reportId, REPORT_ID);
    this.sent.push(new Uint8Array(data));
  }
  async receiveFeatureReport(reportId) {
    assert.equal(reportId, REPORT_ID);
    const frame = this.responses.shift() ?? this.responses.at(-1);
    return new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  }
}

const makeResponse = (sequence, command, status, payload = []) => {
  const frame = new Uint8Array(REPORT_DATA_SIZE);
  frame[0] = MAGIC; frame[1] = 1; frame[2] = sequence; frame[3] = command;
  frame[4] = status; frame[5] = payload.length;
  frame.set(payload, HEADER_SIZE);
  return frame;
};

test("transport polls through PENDING until the final response", async () => {
  const device = new FakeDevice([
    makeResponse(1, CMD.PING, STATUS.PENDING),
    makeResponse(1, CMD.PING, STATUS.PENDING),
    makeResponse(1, CMD.PING, STATUS.OK, [PROTOCOL_VERSION]),
  ]);
  const transport = new DongleTransport(device);
  const payload = await transport.command(CMD.PING);
  assert.deepEqual(Array.from(payload), [PROTOCOL_VERSION]);
  assert.equal(device.sent.length, 1);
  assert.equal(device.sent[0][2], 1); // first sequence number
});

test("transport surfaces error statuses as exceptions", async () => {
  const device = new FakeDevice([
    makeResponse(1, CMD.FORGET_ALL, STATUS.NOT_READY),
  ]);
  const transport = new DongleTransport(device);
  await assert.rejects(
    () => transport.command(CMD.FORGET_ALL),
    /NOT_READY/,
  );
});

test("transport strips a leading report id byte if the stack includes it", async () => {
  const inner = makeResponse(1, CMD.PING, STATUS.OK, [PROTOCOL_VERSION]);
  const withId = new Uint8Array(inner.length + 1);
  withId[0] = REPORT_ID;
  withId.set(inner, 1);
  const transport = new DongleTransport(new FakeDevice([withId]));
  const payload = await transport.command(CMD.PING);
  assert.deepEqual(Array.from(payload), [PROTOCOL_VERSION]);
});
