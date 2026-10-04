cmake_minimum_required(VERSION 3.14)
project(runner LANGUAGES CXX)

# Define the application target. To change its name, change BINARY_NAME in the
# top-level CMakeLists.txt, not the value here, or `flutter run` will no longer
# work.
#
# Any new source files that you add to the application should be added here.
add_executable(${BINARY_NAME} WIN32
  "flutter_window.cpp"
  "main.cpp"
  "utils.cpp"
  "win32_window.cpp"
  "${FLUTTER_MANAGED_DIR}/generated_plugin_registrant.cc"
  "Runner.rc"
  "runner.exe.manifest"
)

# Apply the standard set of build settings. This can be removed for applications
# that need different build settings.
apply_standard_settings(${BINARY_NAME})

# Add preprocessor definitions for the build version.
target_compile_definitions(${BINARY_NAME} PRIVATE "FLUTTER_VERSION=\"${FLUTTER_VERSION}\"")
target_compile_definitions(${BINARY_NAME} PRIVATE "FLUTTER_VERSION_MAJOR=${FLUTTER_VERSION_MAJOR}")
target_compile_definitions(${BINARY_NAME} PRIVATE "FLUTTER_VERSION_MINOR=${FLUTTER_VERSION_MINOR}")
target_compile_definitions(${BINARY_NAME} PRIVATE "FLUTTER_VERSION_PATCH=${FLUTTER_VERSION_PATCH}")
target_compile_definitions(${BINARY_NAME} PRIVATE "FLUTTER_VERSION_BUILD=${FLUTTER_VERSION_BUILD}")

# Disable Windows macros that collide with C++ standard library functions.
target_compile_definitions(${BINARY_NAME} PRIVATE "NOMINMAX")
# 文件身份与编译目标共用同一个值，不能把 Client 的版本资源写成 Host。
target_compile_definitions(${BINARY_NAME} PRIVATE "TUYUFACTORY_BINARY_NAME=\"${BINARY_NAME}\"")
string(TOUPPER "${TUYUFACTORY_PRODUCT}" TUYUFACTORY_ROLE)
target_compile_definitions(${BINARY_NAME} PRIVATE "TUYUFACTORY_${TUYUFACTORY_ROLE}")

# Add dependency libraries and include directories. Add any application-specific
# dependencies here.
target_link_libraries(${BINARY_NAME} PRIVATE flutter flutter_wrapper_app)
target_link_libraries(${BINARY_NAME} PRIVATE "dwmapi.lib" shell32.lib ole32.lib propsys.lib uuid.lib)
# Native names and resource files contain UTF-8 text.
target_compile_options(${BINARY_NAME} PRIVATE $<$<CXX_COMPILER_ID:MSVC>:/utf-8>)
target_include_directories(${BINARY_NAME} PRIVATE "${CMAKE_SOURCE_DIR}")

if(TUYUFACTORY_PRODUCT STREQUAL "client")
  # 只消费TuyuFactory产品锁定并验真的NuGet归档；配置阶段不联网，也不安装浏览器Runtime。
  set(WEBVIEW2_PACKAGE "$ENV{TUYUFACTORY_WEBVIEW2_PACKAGE}")
  set(WEBVIEW2_EXPECTED_SHA256 "$ENV{TUYUFACTORY_WEBVIEW2_SHA256}")
  if(NOT EXISTS "${WEBVIEW2_PACKAGE}" OR NOT WEBVIEW2_EXPECTED_SHA256 MATCHES "^[a-f0-9]{64}$")
    message(FATAL_ERROR "Set the verified WebView2 NuGet archive and digest")
  endif()
  file(SHA256 "${WEBVIEW2_PACKAGE}" WEBVIEW2_SHA256)
  if(NOT WEBVIEW2_SHA256 STREQUAL WEBVIEW2_EXPECTED_SHA256)
    message(FATAL_ERROR "WebView2 NuGet archive SHA-256 mismatch")
  endif()
  set(WEBVIEW2_ROOT "${CMAKE_CURRENT_BINARY_DIR}/webview2")
  get_filename_component(WEBVIEW2_APP_ROOT "${CMAKE_SOURCE_DIR}/.." REALPATH)
  get_filename_component(WEBVIEW2_BUILD_ROOT "${CMAKE_CURRENT_BINARY_DIR}" REALPATH)
  string(FIND "${WEBVIEW2_BUILD_ROOT}/" "${WEBVIEW2_APP_ROOT}/" WEBVIEW2_IN_SOURCE)
  if(WEBVIEW2_IN_SOURCE EQUAL 0)
    message(FATAL_ERROR "WebView2 SDK extraction is forbidden in the product source directory")
  endif()
  file(MAKE_DIRECTORY "${WEBVIEW2_ROOT}")
  execute_process(COMMAND "${CMAKE_COMMAND}" -E tar xf "${WEBVIEW2_PACKAGE}"
    WORKING_DIRECTORY "${WEBVIEW2_ROOT}" RESULT_VARIABLE WEBVIEW2_EXTRACT)
  if(NOT WEBVIEW2_EXTRACT EQUAL 0)
    message(FATAL_ERROR "WebView2 NuGet extraction failed")
  endif()
  if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8 OR CMAKE_GENERATOR_PLATFORM STREQUAL "ARM64")
    message(FATAL_ERROR "TuyuFactory Windows Client requires x64")
  endif()
  target_sources(${BINARY_NAME} PRIVATE "web.cpp")
  target_compile_definitions(${BINARY_NAME} PRIVATE WIN32_LEAN_AND_MEAN)
  target_compile_options(${BINARY_NAME} PRIVATE /utf-8)
  target_include_directories(${BINARY_NAME} PRIVATE "${WEBVIEW2_ROOT}/build/native/include")
  target_link_libraries(${BINARY_NAME} PRIVATE
    "${WEBVIEW2_ROOT}/build/native/x64/WebView2LoaderStatic.lib"
    shlwapi.lib ole32.lib oleaut32.lib version.lib comdlg32.lib ws2_32.lib advapi32.lib)
endif()

# Run the Flutter tool portions of the build. This must not be removed.
add_dependencies(${BINARY_NAME} flutter_assemble)
