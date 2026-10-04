import groovy.json.JsonSlurper

pluginManagement {
    val properties = java.util.Properties()
    val flutterProjectRoot = System.getenv("TUYUFACTORY_PROJECT_ROOT")
        ?.let { java.io.File(it) }
        ?: settingsDir.parentFile
    flutterProjectRoot.resolve("android/local.properties").inputStream().use(properties::load)
    val flutterSdkPath = requireNotNull(properties.getProperty("flutter.sdk")) {
        "flutter.sdk must reference the centrally verified Flutter toolchain"
    }
    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

// 产品自己的Flutter解析结果决定原生插件；Gradle固定从真实android根启动，
// 缓存Flutter根只提供生成元数据和可写状态。
val flutterProjectRoot = System.getenv("TUYUFACTORY_PROJECT_ROOT")
    ?.let { java.io.File(it) }
    ?: settingsDir.parentFile
val flutterPlugins = flutterProjectRoot.resolve(".flutter-plugins-dependencies")
if (flutterPlugins.isFile) {
    val metadata = JsonSlurper().parse(flutterPlugins) as Map<*, *>
    val androidPlugins = (metadata["plugins"] as? Map<*, *>)?.get("android") as? List<*> ?: emptyList<Any>()
    androidPlugins.filterIsInstance<Map<*, *>>()
        .filter { it["native_build"] != false }
        .forEach { plugin ->
            val name = plugin["name"] as String
            include(":$name")
            project(":$name").projectDir = java.io.File(plugin["path"] as String, "android")
        }
}

include(":app")
