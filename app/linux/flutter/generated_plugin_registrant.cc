//
//  Generated file. Do not edit.
//

// clang-format off

#include "generated_plugin_registrant.h"

#include <citizen_sdk/citizen_sdk_plugin.h>
#include <flutter_lite_camera/flutter_lite_camera_plugin.h>

void fl_register_plugins(FlPluginRegistry* registry) {
  g_autoptr(FlPluginRegistrar) citizen_sdk_registrar =
      fl_plugin_registry_get_registrar_for_plugin(registry, "CitizenSdkPlugin");
  citizen_sdk_plugin_register_with_registrar(citizen_sdk_registrar);
  g_autoptr(FlPluginRegistrar) flutter_lite_camera_registrar =
      fl_plugin_registry_get_registrar_for_plugin(registry, "FlutterLiteCameraPlugin");
  flutter_lite_camera_plugin_register_with_registrar(flutter_lite_camera_registrar);
}
