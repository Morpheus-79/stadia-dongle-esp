#pragma once

#include <stdbool.h>

void web_server_init(void);
void web_server_start(bool explicit_request);
void web_server_request_start(bool explicit_request);
// Ask the web monitor task to stop the AP; safe from any task, unlike
// web_server_stop() which must run on the monitor task itself.
void web_server_request_stop(void);
void web_server_stop(void);
// Re-arm the auto-off deadline after a configuration change from another
// transport (e.g. the USB configuration channel).
void web_server_notify_config_changed(void);
void web_server_notify_usb_suspend(bool suspended);
bool web_server_is_active(void);
bool web_server_is_active_or_requested(void);
bool web_server_has_clients(void);
