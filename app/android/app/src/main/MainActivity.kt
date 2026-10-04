package com.tuyufactory.client

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private var multicastLock: WifiManager.MulticastLock? = null
    private var channel: MethodChannel? = null
    private var webChannel: MethodChannel? = null
    private var web: Web? = null
    private val discovery = Discovery(
        acquire = {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                ?: error("Wi-Fi multicast is unavailable")
            val lock = multicastLock ?: wifi.createMulticastLock("tuyufactory-mdns").apply {
                setReferenceCounted(false)
                multicastLock = this
            }
            if (!lock.isHeld) lock.acquire()
        },
        release = {
            multicastLock?.let { if (it.isHeld) it.release() }
            multicastLock = null
        },
    )

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        // 标准自动注册直接接入 CitizenSDK；此通道不提供钱包或业务能力。
        super.configureFlutterEngine(flutterEngine)
        web = Web(this,
            closed = { webChannel?.invokeMethod("closed", mapOf("generation" to it)) },
            failed = { webChannel?.invokeMethod("failed", mapOf("generation" to it)) },
        )
        webChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "tuyufactory/web").also {
            it.setMethodCallHandler { call, result ->
                try {
                    when (call.method) {
                        "open" -> { requireNotNull(web).open(call.arguments as Map<*, *>); result.success(null) }
                        "close" -> {
                            val generation = requireNotNull(call.argument<Number>("generation")).toLong()
                            require(generation > 0)
                            web?.close(generation); result.success(null)
                        }
                        else -> result.notImplemented()
                    }
                } catch (_: Exception) {
                    if (call.method == "open") web?.close()
                    result.error("web_unavailable", "Factory workspace is unavailable", null)
                }
            }
        }
        channel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger, "tuyufactory/discovery",
        ).also { connection ->
            connection.setMethodCallHandler { call, result ->
                try {
                    when (call.method) {
                        "acquireMulticastLock" -> { discovery.acquire(); result.success(null) }
                        "releaseMulticastLock" -> { discovery.release(); result.success(null) }
                        else -> result.notImplemented()
                    }
                } catch (_: Exception) {
                    // 不回传系统细节、路径或凭据；Dart 会以发现失败终止本次连接。
                    result.error("discovery_unavailable", "Multicast discovery is unavailable", null)
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        discovery.start()
        web?.resume()
    }

    override fun onStop() {
        web?.pause()
        try { discovery.stop() } finally { super.onStop() }
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        web?.dispose(); web = null
        webChannel?.setMethodCallHandler(null); webChannel = null
        channel?.setMethodCallHandler(null)
        channel = null
        try { discovery.release() } finally { super.cleanUpFlutterEngine(flutterEngine) }
    }

    override fun onDestroy() {
        web?.dispose(); web = null
        try { discovery.close() } finally { super.onDestroy() }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        web?.result(requestCode, resultCode, data)
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == Web.PERMISSION) web?.cameraGranted(
            grantResults.size == 1 && grantResults[0] == PackageManager.PERMISSION_GRANTED,
        )
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }
}
