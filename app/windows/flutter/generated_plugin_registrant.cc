//
//  Generated file. Do not edit.
//

// clang-format off

#include "generated_plugin_registrant.h"

#include <citizen_sdk/citizen_sdk_plugin.h>
#include <flutter_lite_camera/flutter_lite_camera_plugin_c_api.h>

void RegisterPlugins(flutter::PluginRegistry* registry) {
  CitizenSdkPluginRegisterWithRegistrar(
      registry->GetRegistrarForPlugin("CitizenSdkPlugin"));
  FlutterLiteCameraPluginCApiRegisterWithRegistrar(
      registry->GetRegistrarForPlugin("FlutterLiteCameraPluginCApi"));
}
