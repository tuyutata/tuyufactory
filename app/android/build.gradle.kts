// AGP与KGP必须由同一个根classpath解析，避免settings先锁定AGP内置的另一版KGP。
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:9.0.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.20")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val buildValue = System.getenv("TUYUFACTORY_BUILD_DIR")?.takeIf { it.isNotBlank() }
    ?: "${System.getProperty("java.io.tmpdir")}/tuyufactory/android"
val output = file(buildValue).canonicalFile
val sourcePath = rootProject.projectDir.parentFile.canonicalFile.toPath()
require(output.isAbsolute && !output.toPath().startsWith(sourcePath)) {
    "TUYUFACTORY_BUILD_DIR必须是TuyuFactory源码外的绝对目录"
}

rootProject.layout.buildDirectory.fileValue(output)
subprojects {
    layout.buildDirectory.fileValue(output.resolve(name))
    evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
