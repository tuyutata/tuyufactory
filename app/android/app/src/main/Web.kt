package com.tuyufactory.client

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.Dialog
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.http.SslCertificate
import android.net.http.SslError
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebResourceError
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.ByteArrayInputStream
import java.io.File
import java.net.Proxy
import java.net.URL
import java.security.cert.X509Certificate
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/** 仅承载同一 ERPNext 原生站点；没有 JS/SDK 桥，也不改写员工业务。 */
internal class Web(private val activity: Activity, private val closed: (Long) -> Unit, private val failed: (Long) -> Unit) {
    companion object {
        const val FILE = 42101
        const val CAMERA = 42102
        const val DOWNLOAD = 42103
        const val PERMISSION = 42104
    }
    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private var trust: Trust? = null
    private var dialog: Dialog? = null
    private var view: WebView? = null
    private var chooser: ValueCallback<Array<Uri>>? = null
    private var photo: File? = null
    private var photoUri: Uri? = null
    private var permission: PermissionRequest? = null
    private var cameraCapture = false
    private var download: Pair<String, String>? = null
    @Volatile private var request: HttpsURLConnection? = null
    @Volatile private var disposed = false
    @Volatile private var generation = 0
    @Volatile private var downloading = false
    private var expiry: Runnable? = null
    private var identityGeneration = 0L
    private var pendingActivity: Pair<Int, Int>? = null
    private var pendingPermission: Int? = null
    private var prompt: AlertDialog? = null

    private fun text(zh: String, en: String) =
        if (activity.resources.configuration.locales[0].language == "zh") zh else en

    fun open(arguments: Map<*, *>) {
        check(!disposed && dialog == null)
        val windowGeneration = arguments["generation"]
        require(windowGeneration is Int || windowGeneration is Long)
        identityGeneration = (windowGeneration as Number).toLong().also { require(it > 0) }
        val opened = generation
        val identity = Trust(
            arguments["hostname"] as String, arguments["certificate_sha256"] as String,
            arguments["origin"] as String,
        )
        require(arguments["https_port"] == 59460)
        trust = identity
        val web = WebView(activity)
        view = web
        web.clearSslPreferences()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = true // 仅供系统文件选择结果，不允许 content: 网页导航。
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_NO_CACHE
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !identity.allows(request.url.toString())

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                if (identity.allows(request.url.toString())) null else WebResourceResponse(
                    "text/plain", "UTF-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)),
                )

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame && generation == opened) { failed(identityGeneration); close() }
            }

            override fun onReceivedSslError(view: WebView, result: SslErrorHandler, error: SslError) {
                try {
                    check(dialog != null && generation == opened && identity.allows(error.url))
                    val der = requireNotNull(SslCertificate.saveState(error.certificate)
                        ?.getByteArray("x509-certificate"))
                    val certificate = identity.certificate(der)
                    // 检查的是当前握手证书，不是另一次网络探测；随机本机端口不改变厂家身份。
                    expiry?.let(handler::removeCallbacks)
                    expiry = Runnable {
                        if (generation == opened) { failed(identityGeneration); close() }
                    }.also {
                        handler.postDelayed(it, (certificate.notAfter.time - System.currentTimeMillis()).coerceAtLeast(1))
                    }
                    result.proceed()
                } catch (_: Exception) {
                    result.cancel()
                    if (generation == opened) { failed(identityGeneration); close() }
                }
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(webView: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                if (generation != opened || !identity.allows(webView.url.orEmpty()) || chooser != null || pendingActivity != null || prompt != null) return false
                chooser = callback
                prompt = AlertDialog.Builder(activity)
                    .setItems(arrayOf(text("选择文件", "Choose file"), text("拍照", "Take photo"))) { _, which ->
                        prompt = null
                        if (generation != opened) return@setItems
                        if (which == 0) chooseFile(params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                        else requestCamera(null)
                    }.setOnCancelListener { prompt = null; if (generation == opened) finishChooser(null) }.show()
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                if (generation != opened || !identity.allows(request.origin.toString().trimEnd('/')) ||
                    request.resources.any { it != PermissionRequest.RESOURCE_VIDEO_CAPTURE } || permission != null || prompt != null) {
                    request.deny(); return
                }
                permission = request
                prompt = AlertDialog.Builder(activity).setMessage(text("允许厂家工作区使用相机？", "Allow the factory workspace to use the camera?"))
                    .setPositiveButton(text("允许", "Allow")) { _, _ ->
                        prompt = null
                        if (generation == opened) requestCamera(request) else request.deny()
                    }
                    .setNegativeButton(text("取消", "Cancel")) { _, _ -> prompt = null; permission = null; request.deny() }
                    .setOnCancelListener { prompt = null; permission = null; request.deny() }.show()
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (permission === request) { permission = null; cameraCapture = false }
            }
        }
        web.setDownloadListener { url, _, _, mime, _ ->
            if (generation == opened && identity.allows(url) && download == null && !downloading && pendingActivity == null) {
                download = url to CookieManager.getInstance().getCookie(url).orEmpty()
                try {
                    startActivity(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = mime?.takeIf { it.matches(Regex("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")) } ?: "application/octet-stream"
                        putExtra(Intent.EXTRA_TITLE, Uri.parse(url).lastPathSegment
                            ?.replace(Regex("[^\\p{L}\\p{N}._-]"), "_")?.take(120) ?: "download")
                    }, DOWNLOAD)
                } catch (_: Exception) { download = null; showFailure() }
            }
        }
        val controls = LinearLayout(activity)
        fun button(zh: String, en: String, action: () -> Unit) {
            controls.addView(Button(activity).apply { this.text = text(zh, en); setOnClickListener { action() } },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        button("后退", "Back") { if (web.canGoBack()) web.goBack() }
        button("前进", "Forward") { if (web.canGoForward()) web.goForward() }
        button("关闭", "Close") { close() }
        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            addView(controls)
            addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        }
        dialog = Dialog(activity, android.R.style.Theme_Material_Light_NoActionBar).apply {
            setContentView(content)
            setOnCancelListener { close() }
            show()
            window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        web.loadUrl("${identity.origin}/login")
    }

    private fun chooseFile(multiple: Boolean) {
        try {
            startActivity(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE); type = "*/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
            }, FILE)
        } catch (_: Exception) { finishChooser(null); showFailure() }
    }

    private fun requestCamera(request: PermissionRequest?) {
        if (dialog == null || pendingPermission != null || pendingActivity != null) { request?.deny(); finishChooser(null); return }
        permission = request
        cameraCapture = request == null
        if (activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            cameraGranted(true)
        } else {
            pendingPermission = generation
            activity.requestPermissions(arrayOf(Manifest.permission.CAMERA), PERMISSION)
        }
    }

    fun cameraGranted(granted: Boolean) {
        val pending = pendingPermission
        pendingPermission = null
        if (pending != null && pending != generation) return
        if (!granted || dialog == null) {
            permission?.deny(); permission = null; cameraCapture = false; finishChooser(null); return
        }
        permission?.let { it.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)); permission = null; return }
        if (!cameraCapture) return
        cameraCapture = false
        try {
            val directory = File(activity.cacheDir, "camera").apply { mkdirs() }
            photoUri?.let { activity.revokeUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
            photo?.delete()
            photo = File.createTempFile("capture-", ".jpg", directory)
            photoUri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", requireNotNull(photo))
            startActivity(Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
                clipData = ClipData.newRawUri("camera", photoUri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }, CAMERA)
        } catch (_: Exception) { finishChooser(null); showFailure() }
    }

    fun result(code: Int, result: Int, data: Intent?): Boolean {
        if (code !in FILE..DOWNLOAD) return false
        val pending = pendingActivity ?: return true
        if (pending.first != code) return true
        pendingActivity = null
        if (pending.second != generation) return true
        if (dialog == null || result != Activity.RESULT_OK) {
            finishChooser(null); download = null; return true
        }
        when (code) {
            FILE -> {
                val values = data?.clipData?.let { clip ->
                    (0 until clip.itemCount.coerceAtMost(16)).map { clip.getItemAt(it).uri }
                } ?: listOfNotNull(data?.data)
                finishChooser(values.takeIf { it.isNotEmpty() && it.all { uri ->
                    uri.scheme == "content" && uri.authority != "${activity.packageName}.files"
                } }?.toTypedArray())
            }
            CAMERA -> finishChooser(photoUri?.let { arrayOf(it) })
            DOWNLOAD -> {
                val item = download; download = null
                val destination = data?.data
                if (item != null && destination?.scheme == "content" && destination.authority != "${activity.packageName}.files") {
                    save(item.first, item.second, destination)
                }
            }
        }
        return true
    }

    private fun startActivity(intent: Intent, code: Int) {
        check(pendingActivity == null)
        pendingActivity = code to generation
        try { activity.startActivityForResult(intent, code) }
        catch (error: Exception) { pendingActivity = null; throw error }
    }

    private fun save(url: String, cookie: String, destination: Uri) {
        val identity = trust ?: return
        val current = generation
        downloading = true
        executor.execute {
            var temporary: File? = null
            try {
                check(!disposed && current == generation && identity.allows(url))
                val manager = object : X509TrustManager {
                    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
                    override fun checkClientTrusted(chain: Array<X509Certificate>, auth: String) = error("Client certificate forbidden")
                    override fun checkServerTrusted(chain: Array<X509Certificate>, auth: String) {
                        require(chain.size == 1); identity.verify(chain[0])
                    }
                }
                val context = SSLContext.getInstance("TLS").apply { init(null, arrayOf(manager), null) }
                fun connect(destination: String) = (URL(destination).openConnection(Proxy.NO_PROXY) as HttpsURLConnection).apply {
                    sslSocketFactory = context.socketFactory
                    hostnameVerifier = javax.net.ssl.HostnameVerifier { name, session ->
                        name == "127.0.0.1" && runCatching {
                            identity.verify(session.peerCertificates.single() as X509Certificate); true
                        }.getOrDefault(false)
                    }
                    instanceFollowRedirects = false
                    connectTimeout = 10000; readTimeout = 10000
                    if (cookie.isNotEmpty()) setRequestProperty("Cookie", cookie)
                }
                var destinationUrl = url
                var connection = connect(destinationUrl)
                var redirects = 0
                while (true) {
                    request = connection
                    check(!disposed && current == generation)
                    if (connection.responseCode !in listOf(301, 302, 303, 307, 308)) break
                    require(redirects++ < 5)
                    val location = requireNotNull(connection.getHeaderField("Location"))
                    require(location.length <= 8192)
                    destinationUrl = URL(URL(destinationUrl), location).toString()
                    require(identity.allows(destinationUrl))
                    connection.disconnect()
                    connection = connect(destinationUrl)
                }
                request = connection
                check(!disposed && current == generation)
                require(connection.responseCode == 200 && connection.contentLengthLong <= 64L * 1024 * 1024)
                // 先完成受限下载，再写用户新选的文件；失败不留下半份业务文档。
                temporary = File.createTempFile("factory-download-", ".tmp", activity.cacheDir)
                temporary.outputStream().use { output ->
                    connection.inputStream.use { input ->
                        val buffer = ByteArray(65536)
                        var total = 0L
                        while (true) {
                            check(!disposed && current == generation)
                            val count = input.read(buffer)
                            if (count < 0) break
                            total += count
                            require(total <= 64L * 1024 * 1024)
                            output.write(buffer, 0, count)
                        }
                    }
                }
                check(!disposed && current == generation)
                activity.contentResolver.openOutputStream(destination, "w").use { output ->
                    requireNotNull(output)
                    temporary.inputStream().use { it.copyTo(output) }
                }
                handler.post {
                    if (!disposed && current == generation) Toast.makeText(
                        activity, text("文件已保存", "File saved"), Toast.LENGTH_SHORT,
                    ).show()
                }
            } catch (_: Exception) { handler.post { if (!disposed && current == generation) showFailure() } }
            finally { temporary?.delete(); request?.disconnect(); request = null; downloading = false }
        }
    }

    private fun finishChooser(value: Array<Uri>?) { chooser?.onReceiveValue(value); chooser = null }
    private fun showFailure() { Toast.makeText(activity, text("安全校验或文件操作失败", "Security verification or file operation failed"), Toast.LENGTH_LONG).show() }

    fun pause() {
        view?.let { it.onPause(); it.isEnabled = false }
        permission?.deny(); permission = null
        if (prompt != null) finishChooser(null)
        prompt?.dismiss(); prompt = null
    }

    fun resume() { view?.let { it.onResume(); it.isEnabled = true } }

    fun close(expected: Long? = null) {
        if (expected != null && expected != identityGeneration) return
        val current = dialog
        if (current == null && view == null) return
        dialog = null
        generation++
        prompt?.dismiss(); prompt = null
        expiry?.let(handler::removeCallbacks); expiry = null
        permission?.deny(); permission = null
        finishChooser(null); download = null; cameraCapture = false
        request?.disconnect()
        view?.let {
            it.stopLoading(); it.clearSslPreferences(); it.clearHistory(); it.clearCache(true)
            it.webChromeClient = null
            (it.parent as? ViewGroup)?.removeView(it)
            it.destroy()
        }
        view = null
        photoUri?.let { activity.revokeUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
        photoUri = null; photo?.delete(); photo = null
        current?.dismiss()
        closed(identityGeneration)
    }

    fun dispose() { disposed = true; close(); executor.shutdownNow() }
}
