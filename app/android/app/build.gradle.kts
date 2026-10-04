import groovy.json.JsonSlurper
import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    // AGP提供内置Kotlin，不再重复应用Android Kotlin插件。
    id("dev.flutter.flutter-gradle-plugin")
}

val flutterProductRoot = System.getenv("TUYUFACTORY_PROJECT_ROOT")
    ?.let { file(it) }
    ?: rootProject.projectDir.parentFile
val flutterBuildProperties = Properties().apply {
    flutterProductRoot.resolve("android/local.properties").inputStream().use { load(it) }
}
val productVersionCode = flutterBuildProperties.getProperty("flutter.versionCode", "1").toInt()
val productVersionName = flutterBuildProperties.getProperty("flutter.versionName", "1.0")

// Android 只有分机安装身份；不能通过另一个 Dart 入口生成主机能力。
val target = requireNotNull(providers.gradleProperty("target").orNull)
val appRoot = rootProject.projectDir.parentFile
val targetFile = if (File(target).isAbsolute) file(target) else appRoot.resolve(target)
require(targetFile.canonicalFile == appRoot.resolve("lib/main_client.dart").canonicalFile) {
    "TuyuFactory Android requires lib/main_client.dart"
}

val logo = tasks.register<Copy>("prepareLogo") {
    // 复用产品内已有的统一途遇图标，资源输出只落本任务的构建目录。
    from("../../tuyu_logo.png")
    into(layout.buildDirectory.dir("generated/logo/drawable"))
}

android {
    namespace = "com.tuyufactory.client"
    compileSdk = 36
    ndkVersion = "28.2.13676358"
    defaultConfig {
        applicationId = "com.tuyufactory.client"
        minSdk = 24
        targetSdk = 36
        versionCode = productVersionCode
        versionName = productVersionName
        ndk { abiFilters += "arm64-v8a" }
    }
    sourceSets.getByName("main") {
        // 内置Kotlin只从公开Kotlin源集接收自定义目录，保留原有四个入口文件。
        kotlin.directories.apply {
            clear()
            add("src/main")
        }
        kotlin.include("MainActivity.kt", "Discovery.kt", "Web.kt", "Trust.kt")
        res.directories.apply {
            clear()
            add("src/main/res")
            add(layout.buildDirectory.dir("generated/logo").get().asFile.path)
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // 正式签名材料由TuyuFactory正式流程持有，源码不附带另一套签名或凭据。
    buildTypes { release { } }
}

kotlin {
    compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17 }
}

tasks.named("preBuild").configure { dependsOn(logo) }
// 真实Android工程只读执行，Flutter生成状态保留在当前产品平台缓存。
flutter { source = System.getenv("TUYUFACTORY_PROJECT_ROOT") ?: "../.." }

// 与已消费 CitizenSDK 使用同一 AndroidX 坐标，只调用平台 FileProvider。
dependencies { implementation("androidx.core:core-ktx:1.13.1") }

// 安装名称读取现有产品语言资源，生成物仅写入当前平台的产品构建目录。
// AGP 9 consumes generated resources through a typed task output.
abstract class GenerateAppNameResources : DefaultTask() {
    @get:org.gradle.api.tasks.OutputDirectory
    abstract val generatedResources: org.gradle.api.file.DirectoryProperty
}

val appNameResources = layout.buildDirectory.dir("generated/app-name/res")
val appNameSources = mapOf(
    "values" to layout.projectDirectory.file("../../lib/shared/l10n/app_en.arb"),
    "values-zh" to layout.projectDirectory.file("../../lib/shared/l10n/app_zh.arb"),
)
val generateAppNameResources = tasks.register<GenerateAppNameResources>("generateAppNameResources") {
    generatedResources.set(appNameResources)
    inputs.files(appNameSources.values)
    outputs.dir(appNameResources)
    val defaultNameResource = layout.projectDirectory.file("src/main/res/values/strings.xml")
    inputs.file(defaultNameResource)
    doLast {
        appNameSources.forEach { (qualifier, source) ->
            val document = JsonSlurper().parse(source.asFile) as Map<*, *>
            val title = document["appTitle"] as? String
                ?: throw GradleException("产品语言资源缺少安装名称")
            require(title.isNotBlank() && !title.contains("\n")) { "安装名称不能为空或包含换行" }
            // 默认英文资源已经由现有 strings.xml 提供，禁止生成重名资源。
            if (qualifier == "values") {
                val expected = "<string name=\"app_name\">$title</string>"
                require(defaultNameResource.asFile.readText().contains(expected)) { "默认安装名称与英文资源不一致" }
                return@forEach
            }
            val escaped = title.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace("\"", "&quot;")
            val output = appNameResources.get().file("$qualifier/strings.xml").asFile
            output.parentFile.mkdirs()
            output.writeText("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<resources><string name=\"app_name\">$escaped</string></resources>\n", Charsets.UTF_8)
        }
    }
}
// Let AGP carry the generation dependency into every resource-consuming variant.
androidComponents.onVariants { variant ->
    variant.sources.res?.addGeneratedSourceDirectory(
        generateAppNameResources,
        GenerateAppNameResources::generatedResources,
    )
}
