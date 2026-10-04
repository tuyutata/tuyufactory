# Project-level configuration.
cmake_minimum_required(VERSION 3.14)
project(tuyufactory LANGUAGES CXX)

# 一个 Flutter 工程在编译期生成两套安装产品；没有运行时角色切换。
set(TUYUFACTORY_PRODUCT "$ENV{TUYU_FACTORY_PRODUCT}")
if(TUYUFACTORY_PRODUCT STREQUAL "client")
  set(BINARY_NAME "tuyufactory_client")
  set(CITIZENSDK_APPLICATION_ID "com.tuyufactory.client")
elseif(TUYUFACTORY_PRODUCT STREQUAL "host")
  set(BINARY_NAME "tuyufactory")
  set(CITIZENSDK_APPLICATION_ID "com.tuyufactory")
else()
  message(FATAL_ERROR "TUYU_FACTORY_PRODUCT must be host or client")
endif()

# 两个安装产品只支持真实 Windows x64，不能让主机漏过分机的架构约束。
if(NOT WIN32 OR NOT MSVC OR NOT CMAKE_SIZEOF_VOID_P EQUAL 8 OR
   (NOT CMAKE_GENERATOR_PLATFORM STREQUAL "" AND NOT CMAKE_GENERATOR_PLATFORM STREQUAL "x64"))
  message(FATAL_ERROR "TuyuFactory Windows requires the native Windows MSVC x64 target")
endif()

# Explicitly opt in to modern CMake behaviors to avoid warnings with recent
# versions of CMake.
cmake_policy(VERSION 3.14...3.25)

# Define build configuration option.
get_property(IS_MULTICONFIG GLOBAL PROPERTY GENERATOR_IS_MULTI_CONFIG)
if(IS_MULTICONFIG)
  set(CMAKE_CONFIGURATION_TYPES "Debug;Profile;Release"
    CACHE STRING "" FORCE)
else()
  if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE "Debug" CACHE
      STRING "Flutter build mode" FORCE)
    set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS
      "Debug" "Profile" "Release")
  endif()
endif()
# Define settings for the Profile build mode.
set(CMAKE_EXE_LINKER_FLAGS_PROFILE "${CMAKE_EXE_LINKER_FLAGS_RELEASE}")
set(CMAKE_SHARED_LINKER_FLAGS_PROFILE "${CMAKE_SHARED_LINKER_FLAGS_RELEASE}")
set(CMAKE_C_FLAGS_PROFILE "${CMAKE_C_FLAGS_RELEASE}")
set(CMAKE_CXX_FLAGS_PROFILE "${CMAKE_CXX_FLAGS_RELEASE}")

# Use Unicode for all projects.
add_definitions(-DUNICODE -D_UNICODE)

# Compilation settings that should be applied to most targets.
#
# Be cautious about adding new options here, as plugins use this function by
# default. In most cases, you should add new options to specific targets instead
# of modifying this function.
function(APPLY_STANDARD_SETTINGS TARGET)
  target_compile_features(${TARGET} PUBLIC cxx_std_17)
  target_compile_options(${TARGET} PRIVATE /W4 /WX /wd"4100")
  target_compile_options(${TARGET} PRIVATE /EHsc)
  target_compile_definitions(${TARGET} PRIVATE "_HAS_EXCEPTIONS=0")
  target_compile_definitions(${TARGET} PRIVATE "$<$<CONFIG:Debug>:_DEBUG>")
endfunction()

# Flutter library and tool build rules.
set(FLUTTER_MANAGED_DIR "${CMAKE_CURRENT_SOURCE_DIR}/flutter")
add_subdirectory(${FLUTTER_MANAGED_DIR})

# Application build; see runner/CMakeLists.txt.
add_subdirectory("runner")


# Generated plugin build rules, which manage building the plugins and adding
# them to the application.
# Flutter刷新生成链接后、加载插件前，固定本任务同源SDK安装投影；不改SDK或Dart解析源。
find_program(TUYUFACTORY_NODE node REQUIRED)
execute_process(COMMAND "${TUYUFACTORY_NODE}" "$ENV{TUYUFACTORY_ROOT}/scripts/verify.mjs"
  --sdk-plugin "${CMAKE_CURRENT_SOURCE_DIR}/.." windows "${TUYUFACTORY_PRODUCT}"
  OUTPUT_VARIABLE TUYUFACTORY_SDK_PLUGIN RESULT_VARIABLE TUYUFACTORY_SDK_RESULT)
if(NOT TUYUFACTORY_SDK_RESULT EQUAL 0)
  message(FATAL_ERROR "TuyuFactory SDK same-source installation validation failed")
endif()
set(TUYUFACTORY_SDK_LINK "${FLUTTER_MANAGED_DIR}/ephemeral/.plugin_symlinks/citizen_sdk")
if(NOT IS_SYMLINK "${TUYUFACTORY_SDK_LINK}")
  message(FATAL_ERROR "TuyuFactory requires the generated SDK plugin link")
endif()
file(REMOVE "${TUYUFACTORY_SDK_LINK}")
file(CREATE_LINK "${TUYUFACTORY_SDK_PLUGIN}" "${TUYUFACTORY_SDK_LINK}" SYMBOLIC RESULT TUYUFACTORY_SDK_RESULT)
if(NOT TUYUFACTORY_SDK_RESULT STREQUAL "0")
  message(FATAL_ERROR "TuyuFactory cannot bind the same-source SDK installation")
endif()
include(flutter/generated_plugins.cmake)


# === Installation ===
# Support files are copied into place next to the executable, so that it can
# run in place. This is done instead of making a separate bundle (as on Linux)
# so that building and running from within Visual Studio will work.
set(BUILD_BUNDLE_DIR "$<TARGET_FILE_DIR:${BINARY_NAME}>")
# Make the "install" step default, as it's required to run.
set(CMAKE_VS_INCLUDE_INSTALL_TO_DEFAULT_BUILD 1)
if(CMAKE_INSTALL_PREFIX_INITIALIZED_TO_DEFAULT)
  set(CMAKE_INSTALL_PREFIX "${BUILD_BUNDLE_DIR}" CACHE PATH "..." FORCE)
endif()

set(INSTALL_BUNDLE_DATA_DIR "${CMAKE_INSTALL_PREFIX}/data")
set(INSTALL_BUNDLE_LIB_DIR "${CMAKE_INSTALL_PREFIX}")

install(TARGETS ${BINARY_NAME} RUNTIME DESTINATION "${CMAKE_INSTALL_PREFIX}"
  COMPONENT Runtime)

install(FILES "${FLUTTER_ICU_DATA_FILE}" DESTINATION "${INSTALL_BUNDLE_DATA_DIR}"
  COMPONENT Runtime)

install(FILES "${FLUTTER_LIBRARY}" DESTINATION "${INSTALL_BUNDLE_LIB_DIR}"
  COMPONENT Runtime)

if(PLUGIN_BUNDLED_LIBRARIES)
  install(FILES "${PLUGIN_BUNDLED_LIBRARIES}"
    DESTINATION "${INSTALL_BUNDLE_LIB_DIR}"
    COMPONENT Runtime)
endif()

# Copy the native assets provided by the build.dart from all packages.
set(NATIVE_ASSETS_DIR "${PROJECT_BUILD_DIR}native_assets/windows/")
install(DIRECTORY "${NATIVE_ASSETS_DIR}"
   DESTINATION "${INSTALL_BUNDLE_LIB_DIR}"
   COMPONENT Runtime)

# Fully re-copy the assets directory on each build to avoid having stale files
# from a previous install.
set(FLUTTER_ASSET_DIR_NAME "flutter_assets")
install(CODE "
  file(REMOVE_RECURSE \"${INSTALL_BUNDLE_DATA_DIR}/${FLUTTER_ASSET_DIR_NAME}\")
  " COMPONENT Runtime)
install(DIRECTORY "${PROJECT_BUILD_DIR}/${FLUTTER_ASSET_DIR_NAME}"
  DESTINATION "${INSTALL_BUNDLE_DATA_DIR}" COMPONENT Runtime)

# Install the AOT library on non-Debug builds only.
install(FILES "${AOT_LIBRARY}" DESTINATION "${INSTALL_BUNDLE_DATA_DIR}"
  CONFIGURATIONS Profile;Release
  COMPONENT Runtime)
