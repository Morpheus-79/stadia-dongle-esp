# Hardware Test Checklist

Manual pre-release checks. Most changes in this firmware can only be verified
with a real controller and host, so run the sections your change touches — and
Boot + Gamepad always — before tagging a release.

Idea borrowed from jazz-zzzz/stadia-dongle-esp.

## Boot & USB

- [ ] Fresh flash via the web installer boots (LED: white pulse, then heartbeat).
- [ ] Dongle enumerates as **Xbox 360 Controller for Windows** on the native USB port.
- [ ] `joy.cpl` (or a gamepad tester) shows the pad with no phantom input at rest.
- [ ] After a reboot with bonds stored, the Wi-Fi AP does **not** start.
- [ ] On a fresh flash (no bonds), the setup AP **does** start.

## Pairing

- [ ] Pairing from the Web UI or USB config page connects a controller in
      Bluetooth mode (Stadia + Y, orange flash).
- [ ] Controller auto-reconnects after power-off/on in under ~5 s.
- [ ] Second controller pairs and appears as a second gamepad.
- [ ] Forget + re-pair works without a dongle reboot.

## Gamepad

- [ ] All buttons, sticks, triggers and D-pad register correctly.
- [ ] Sticks reach full deflection in all directions; center is neutral.
- [ ] Rumble works (test in a game or the Xbox 360 controller test dialog).
- [ ] After a controller disconnects mid-session, it reconnects as the **same**
      gamepad index, and inputs are neutral while it is away.

## Mouse mode

- [ ] Assistant + Capture (2 s hold) toggles mouse mode; 2 rumble pulses on,
      3 pulses off.
- [ ] Cursor speed is the same diagonally as straight (draw slow circles).
- [ ] Slow stick deflection moves the cursor; releasing stops it dead.
- [ ] Right-stick scroll ramps smoothly from slow to fast; D-pad up/down
      scrolls one detent per press.
- [ ] A / B / X click as left / right / middle.

## Extra buttons

- [ ] Assistant and Capture short/long presses emit their configured keys.
- [ ] Remapping via the Web UI and via the USB config page both persist across
      a reboot.

## Web UI / USB config

- [ ] Captive portal pops automatically after joining the AP.
- [ ] USB config page (docs/config.html) connects, shows live status, saves
      config, lists controllers, and live input reflects button presses.
- [ ] AP auto-off fires after the configured timeout with a controller
      connected.

## Power

- [ ] Host sleep: dongle LED goes dim purple; Assistant/Capture/A wakes the PC
      (BIOS/OS USB wake enabled); Stadia button does **not** wake it.
- [ ] After host resume, controllers work without re-pairing.
