#include "mouse_mode.h"

#include "ble_central.h"
#include "dongle_state.h"
#include "hid_mouse.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "MOUSE";

static bool s_mouse_mode[DONGLE_MAX_CONTROLLERS];

static int32_t s_speed_q16[DONGLE_MAX_CONTROLLERS];
static int32_t s_motion_x_q16[DONGLE_MAX_CONTROLLERS];
static int32_t s_motion_y_q16[DONGLE_MAX_CONTROLLERS];
static bool s_dpad_up_prev[DONGLE_MAX_CONTROLLERS];
static bool s_dpad_down_prev[DONGLE_MAX_CONTROLLERS];
static bool s_a_prev[DONGLE_MAX_CONTROLLERS];
static bool s_b_prev[DONGLE_MAX_CONTROLLERS];
static bool s_x_prev[DONGLE_MAX_CONTROLLERS];
static int32_t s_scroll_accum[DONGLE_MAX_CONTROLLERS];
static stadia_controller_state_t s_cached_state[DONGLE_MAX_CONTROLLERS];
static bool s_cached_valid[DONGLE_MAX_CONTROLLERS];

#define MOUSE_STICK_DEADZONE 3277
#define MOUSE_SCROLL_DEADZONE 6000
#define MOUSE_SPEED_MAX 14
#define MOUSE_PRECISION_DIV 3
#define MOUSE_FAST_MUL 2
#define MOUSE_Q16_ONE 65536
#define MOUSE_MOTION_LIMIT_Q16 (127 * MOUSE_Q16_ONE)

void mouse_mode_init(void)
{
    for (uint8_t i = 0; i < DONGLE_MAX_CONTROLLERS; i++) {
        s_mouse_mode[i] = false;
        s_speed_q16[i] = 0;
        s_motion_x_q16[i] = 0;
        s_motion_y_q16[i] = 0;
        s_dpad_up_prev[i] = false;
        s_dpad_down_prev[i] = false;
        s_a_prev[i] = false;
        s_b_prev[i] = false;
        s_x_prev[i] = false;
        s_scroll_accum[i] = 0;
        s_cached_valid[i] = false;
    }
    xTaskCreate(mouse_mode_timer_task, "mouse_timer", 2048, NULL, 3, NULL);
}

bool mouse_mode_is_active(uint8_t usb_gamepad_index)
{
    if (usb_gamepad_index >= DONGLE_MAX_CONTROLLERS) return false;
    return s_mouse_mode[usb_gamepad_index];
}

static void mouse_mode_rumble(uint8_t usb_gamepad_index, int pulse_count)
{
    uint8_t rumble_on[] = {0x00, 0xFF, 0x00, 0xFF};
    uint8_t rumble_off[] = {0x00, 0x00, 0x00, 0x00};
    for (int i = 0; i < pulse_count; i++) {
        ble_central_send_rumble(usb_gamepad_index, rumble_on, sizeof(rumble_on));
        vTaskDelay(pdMS_TO_TICKS(80));
        ble_central_send_rumble(usb_gamepad_index, rumble_off, sizeof(rumble_off));
        if (i < pulse_count - 1) vTaskDelay(pdMS_TO_TICKS(120));
    }
}

void mouse_mode_toggle(uint8_t usb_gamepad_index)
{
    if (usb_gamepad_index >= DONGLE_MAX_CONTROLLERS) return;

    s_mouse_mode[usb_gamepad_index] = !s_mouse_mode[usb_gamepad_index];
    s_speed_q16[usb_gamepad_index] = 0;
    s_motion_x_q16[usb_gamepad_index] = 0;
    s_motion_y_q16[usb_gamepad_index] = 0;
    dongle_state_controller_set_mouse_mode(usb_gamepad_index, s_mouse_mode[usb_gamepad_index]);

    if (s_mouse_mode[usb_gamepad_index]) {
        ESP_LOGI(TAG, "usb %u mouse mode ON", usb_gamepad_index);
        mouse_mode_rumble(usb_gamepad_index, 2);
    } else {
        ESP_LOGI(TAG, "usb %u mouse mode OFF", usb_gamepad_index);
        mouse_mode_rumble(usb_gamepad_index, 3);
    }
}

void mouse_mode_reset(uint8_t usb_gamepad_index)
{
    if (usb_gamepad_index >= DONGLE_MAX_CONTROLLERS) return;
    s_mouse_mode[usb_gamepad_index] = false;
    s_speed_q16[usb_gamepad_index] = 0;
    s_motion_x_q16[usb_gamepad_index] = 0;
    s_motion_y_q16[usb_gamepad_index] = 0;
    s_cached_valid[usb_gamepad_index] = false;
    dongle_state_controller_set_mouse_mode(usb_gamepad_index, false);
}

static uint32_t integer_sqrt_u64(uint64_t value)
{
    uint64_t result = 0;
    uint64_t bit = (uint64_t)1 << 62;

    while (bit > value) bit >>= 2;
    while (bit != 0) {
        if (value >= result + bit) {
            value -= result + bit;
            result = (result >> 1) + bit;
        } else {
            result >>= 1;
        }
        bit >>= 2;
    }
    return (uint32_t)result;
}

static int32_t radial_speed_q16(uint32_t magnitude)
{
    if (magnitude <= MOUSE_STICK_DEADZONE) return 0;
    if (magnitude > 32767) magnitude = 32767;

    uint32_t usable = magnitude - MOUSE_STICK_DEADZONE;
    uint32_t full_range = 32767 - MOUSE_STICK_DEADZONE;
    uint64_t norm = (uint64_t)usable * 32767 / full_range;

    /* Apply the response curve to radial magnitude, never to X and Y
     * independently. This preserves the stick angle through a full circle. */
    uint64_t linear = norm * 4;
    uint64_t quad = norm * norm / 32767 * 6;
    uint64_t curve = (linear + quad) / 10;
    return (int32_t)(curve * MOUSE_SPEED_MAX * MOUSE_Q16_ONE / 32767);
}

static int32_t clamp_motion_q16(int64_t value)
{
    if (value > MOUSE_MOTION_LIMIT_Q16) return MOUSE_MOTION_LIMIT_Q16;
    if (value < -MOUSE_MOTION_LIMIT_Q16) return -MOUSE_MOTION_LIMIT_Q16;
    return (int32_t)value;
}

void mouse_mode_cache_state(uint8_t usb_gamepad_index, const stadia_controller_state_t *state)
{
    if (usb_gamepad_index >= DONGLE_MAX_CONTROLLERS || !state) return;
    s_cached_state[usb_gamepad_index] = *state;
    s_cached_valid[usb_gamepad_index] = true;
}

void mouse_mode_process_state(uint8_t usb_gamepad_index, const stadia_controller_state_t *state)
{
    if (usb_gamepad_index >= DONGLE_MAX_CONTROLLERS || !state) return;
    if (!s_mouse_mode[usb_gamepad_index]) return;

    int32_t raw_x = state->lx;
    int32_t raw_y = state->ly;
    uint32_t magnitude = integer_sqrt_u64((uint64_t)((int64_t)raw_x * raw_x) +
                                          (uint64_t)((int64_t)raw_y * raw_y));
    int32_t target_speed_q16 = radial_speed_q16(magnitude);

    if (state->lt > 128) target_speed_q16 /= MOUSE_PRECISION_DIV;
    if (state->rt > 128) {
        target_speed_q16 *= MOUSE_FAST_MUL;
        if (target_speed_q16 > MOUSE_SPEED_MAX * MOUSE_Q16_ONE) {
            target_speed_q16 = MOUSE_SPEED_MAX * MOUSE_Q16_ONE;
        }
    }

    int32_t velocity_x_q16 = 0;
    int32_t velocity_y_q16 = 0;
    if (target_speed_q16 == 0 || magnitude == 0) {
        /* Stop immediately inside the radial deadzone: no smoothing tail or
         * old fractional movement may make the cursor drift after release. */
        s_speed_q16[usb_gamepad_index] = 0;
        s_motion_x_q16[usb_gamepad_index] = 0;
        s_motion_y_q16[usb_gamepad_index] = 0;
    } else {
        /* Smooth magnitude only. The current stick direction is always used
         * immediately, so direction changes never inherit an old X/Y vector. */
        int32_t speed_delta = target_speed_q16 - s_speed_q16[usb_gamepad_index];
        s_speed_q16[usb_gamepad_index] += speed_delta / 2;
        if (s_speed_q16[usb_gamepad_index] == 0) s_speed_q16[usb_gamepad_index] = 1;

        velocity_x_q16 = (int32_t)((int64_t)s_speed_q16[usb_gamepad_index] * raw_x /
                                   (int32_t)magnitude);
        /* Stadia +Y is up; USB mouse +Y is down. */
        velocity_y_q16 = -(int32_t)((int64_t)s_speed_q16[usb_gamepad_index] * raw_y /
                                    (int32_t)magnitude);
        s_motion_x_q16[usb_gamepad_index] = clamp_motion_q16(
            (int64_t)s_motion_x_q16[usb_gamepad_index] + velocity_x_q16);
        s_motion_y_q16[usb_gamepad_index] = clamp_motion_q16(
            (int64_t)s_motion_y_q16[usb_gamepad_index] + velocity_y_q16);
    }

    uint8_t buttons = 0;
    if (state->a) buttons |= 0x01;
    if (state->b) buttons |= 0x02;
    if (state->x) buttons |= 0x04;

    int8_t wheel = 0;
    if (state->dpad_up && !s_dpad_up_prev[usb_gamepad_index]) wheel += 1;
    if (state->dpad_down && !s_dpad_down_prev[usb_gamepad_index]) wheel -= 1;
    s_dpad_up_prev[usb_gamepad_index] = state->dpad_up;
    s_dpad_down_prev[usb_gamepad_index] = state->dpad_down;

    // Right stick Y for scrolling (sub-pixel accumulator avoids truncation)
    {
        int32_t sr = state->ry;
        if (sr > -MOUSE_SCROLL_DEADZONE && sr < MOUSE_SCROLL_DEADZONE) sr = 0;
        s_scroll_accum[usb_gamepad_index] += (int64_t)sr * 32 / 32767;
        int8_t st = (int8_t)(s_scroll_accum[usb_gamepad_index] / 256);
        s_scroll_accum[usb_gamepad_index] -= (int32_t)st * 256;
        wheel += st;
    }

    int8_t out_x = (int8_t)(s_motion_x_q16[usb_gamepad_index] / MOUSE_Q16_ONE);
    int8_t out_y = (int8_t)(s_motion_y_q16[usb_gamepad_index] / MOUSE_Q16_ONE);

    if (out_x == 0 && out_y == 0 && wheel == 0 &&
        buttons == (uint8_t)((s_a_prev[usb_gamepad_index] ? 0x01 : 0) |
                              (s_b_prev[usb_gamepad_index] ? 0x02 : 0) |
                              (s_x_prev[usb_gamepad_index] ? 0x04 : 0))) {
        return;
    }

    if (hid_mouse_send_report(buttons, out_x, out_y, wheel)) {
        s_motion_x_q16[usb_gamepad_index] -= (int32_t)out_x * MOUSE_Q16_ONE;
        s_motion_y_q16[usb_gamepad_index] -= (int32_t)out_y * MOUSE_Q16_ONE;
        s_a_prev[usb_gamepad_index] = state->a;
        s_b_prev[usb_gamepad_index] = state->b;
        s_x_prev[usb_gamepad_index] = state->x;
    }
}

void mouse_mode_timer_task(void *arg)
{
    (void)arg;
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(8));
        for (uint8_t i = 0; i < DONGLE_MAX_CONTROLLERS; i++) {
            if (!s_mouse_mode[i] || !s_cached_valid[i]) continue;
            mouse_mode_process_state(i, &s_cached_state[i]);
        }
    }
}
