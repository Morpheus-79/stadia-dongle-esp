#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "device/usbd_pvt.h"

#define HID_MOUSE_REPORT_DESC_LEN 91

// Counts per wheel detent once the host has enabled high-resolution scrolling
// via the HID Resolution Multiplier. Hosts that never set it stay at 1.
#define HID_MOUSE_WHEEL_MULT_HIGH 120

void hid_mouse_init(void);
bool hid_mouse_send_report(uint8_t buttons, int8_t x, int8_t y, int8_t wheel);

// Wheel counts that currently make up one detent: HID_MOUSE_WHEEL_MULT_HIGH
// when the host has enabled high-resolution scrolling, otherwise 1.
uint8_t hid_mouse_wheel_multiplier(void);
const uint8_t *hid_mouse_report_descriptor(void);
usbd_class_driver_t const *hid_mouse_class_driver(void);
