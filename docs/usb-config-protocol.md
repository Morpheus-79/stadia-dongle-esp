# USB Configuration Protocol

This document describes v1 of the Stadia Dongle USB configuration protocol. It
is used by the WebHID configuration page and does not replace the Xbox 360
input, rumble, keyboard, or mouse interfaces.

Ported from [jazz-zzzz/stadia-dongle-esp](https://github.com/jazz-zzzz/stadia-dongle-esp),
which designed and first implemented this protocol.

## Transport

- USB VID: `0x045E`
- USB PID: `0x0289`
- HID Usage Page: `0xFF00` (vendor-defined)
- HID Usage: `0x01`
- Feature Report ID: `0x10`
- Feature report data length: 63 bytes
- With the Report ID included, the USB control transfer is 64 bytes

The configuration collection lives inside the existing utility HID interface
(keyboard + consumer control) and uses HID feature reports over EP0 — no extra
interrupt endpoints. Windows keeps binding the gamepad interfaces to the XUSB
driver; the browser only claims the vendor-defined top-level collection.

## Framing

Requests and responses both use a fixed 63-byte data area. Unused bytes must be
zero.

### Request

| Offset | Length | Meaning |
|---:|---:|---|
| 0 | 1 | Magic, always `0x53` |
| 1 | 1 | Protocol version, currently `1` |
| 2 | 1 | Sequence, 1–255 |
| 3 | 1 | Command |
| 4 | 1 | Payload length, at most 55 |
| 5–7 | 3 | Reserved, write zero |
| 8–62 | 55 | Payload |

### Response

| Offset | Length | Meaning |
|---:|---:|---|
| 0 | 1 | Magic, always `0x53` |
| 1 | 1 | Protocol version |
| 2 | 1 | Sequence echoed from the request |
| 3 | 1 | Command echoed from the request |
| 4 | 1 | Status |
| 5 | 1 | Payload length, at most 55 |
| 6–7 | 2 | Reserved, write zero |
| 8–62 | 55 | Payload |

The browser submits a request with `sendFeatureReport()`, then polls with
`receiveFeatureReport()`. While the firmware is still working the response
status is `PENDING`; once finished, the final response carries the same
sequence and command. The browser must keep at most one command in flight.

## Status codes

| Value | Name | Meaning |
|---:|---|---|
| 0 | `OK` | Success |
| 1 | `PENDING` | Still processing |
| 2 | `BAD_MAGIC` | Wrong magic byte |
| 3 | `UNSUPPORTED_VERSION` | Incompatible protocol version |
| 4 | `UNKNOWN_COMMAND` | Unrecognized command |
| 5 | `INVALID_PAYLOAD` | Bad length or contents |
| 6 | `INTERNAL_ERROR` | Firmware-side operation failed |
| 7 | `BUSY` | Request queue full |
| 8 | `NOT_FOUND` | Controller does not exist or is disconnected |
| 9 | `UNSUPPORTED` | Operation not supported on this transport |
| 10 | `NOT_READY` | Bluetooth controller manager still starting; retry |

## Commands

Multi-byte integers are little-endian.

| Command | Value | Request payload | Successful response |
|---|---:|---|---|
| `PING` | `0x01` | empty | 1 byte protocol version |
| `GET_DEVICE_INFO` | `0x02` | empty | fixed 55-byte device info |
| `GET_STATUS` | `0x03` | empty | fixed 55-byte status |
| `GET_CONFIG` | `0x04` | empty | 9-byte configuration |
| `SET_CONFIG` | `0x05` | 9-byte configuration | saved 9-byte configuration |
| `GET_CONTROLLER_COUNT` | `0x06` | empty | 1-byte count |
| `GET_CONTROLLER` | `0x07` | 1-byte index | fixed 55-byte controller info |
| `GET_INPUT` | `0x08` | 1-byte slot; `255` = legacy main state | 49-byte input |
| `START_PAIRING` | `0x10` | empty, or 2-byte timeout in seconds (15–600) | empty |
| `STOP_PAIRING` | `0x11` | empty | empty |
| `FORGET_CONTROLLER` | `0x12` | 17-byte ASCII Bluetooth address | empty |
| `FORGET_ALL` | `0x13` | empty | empty |
| `START_WIFI` | `0x14` | empty | empty |
| `STOP_WIFI` | `0x15` | empty | empty |
| `REBOOT` | `0x16` | empty | empty; device restarts afterwards |

## Status payload

`GET_STATUS` returns this fixed layout:

| Offset | Length | Meaning |
|---:|---:|---|
| 0 | 4 | Milliseconds since boot |
| 4 | 1 | `dongle_state_t` value |
| 5 | 2 | Status flags |
| 7 | 1 | Connected controller count |
| 8 | 1 | Stored bond count |
| 9 | 1 | Battery percent; `255` = unknown |
| 10 | 2 | Web UI auto-off remaining seconds |
| 12 | 18 | Current controller Bluetooth address |
| 30 | 25 | Current controller name |

Status flag bits:

- bit 0: Web UI/AP active
- bit 1: a BLE controller is connected
- bit 2: pairing in progress
- bit 3: USB configured
- bit 4: USB suspended
- bit 5: USB remote wake enabled
- bit 6: last wake attempt was allowed
- bit 7: Bluetooth controller manager ready — read only when device-info
  capability bit 7 declares this semantic; otherwise treat as ready for
  compatibility with early v1 firmware

## Configuration payload

`GET_CONFIG` and `SET_CONFIG` share this layout:

| Offset | Length | Meaning |
|---:|---:|---|
| 0 | 1 | Assistant short-press action |
| 1 | 1 | Assistant long-press action |
| 2 | 1 | Capture short-press action |
| 3 | 1 | Capture long-press action |
| 4 | 2 | Long-press threshold, 300–5000 ms |
| 6 | 2 | Web UI auto-off, 15–1800 s |
| 8 | 1 | bit 0: stop AP on USB suspend; bit 1: auto-start Web UI when no bonds |

Action numbers must match `dongle_action_t` in `config_store.h`.

## Compatibility and limits

- Requires WebHID support: desktop Chrome or Edge.
- The hosted page is served over HTTPS; fully offline use works from
  `http://localhost`, which browsers treat as a secure context.
- Configuration data travels only between the browser and the dongle over USB —
  no accounts, cloud APIs, or resident services.
- v1 does not support firmware upload over USB. OTA stays on the Wi-Fi page.
- Use one configuration page at a time; the page serializes its commands.

## Implementation map

- Firmware protocol: `main/usb_config_protocol.c`
- HID collection and control transfers: `main/hid_extra.c`
- Browser page and transport: `docs/config.html`
