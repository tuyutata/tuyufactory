import Foundation
import Security
import CryptoKit
import WebKit
#if os(iOS)
import Flutter
import UIKit
#else
import FlutterMacOS
import AppKit
#endif

/// 单一证书策略同时用于页面与下载；仅锚定已核对叶证书，仍执行主机名和服务器用途校验。
struct WebTrust {
  static func validate(_ trust: SecTrust, hostname: String, fingerprint: String) -> Bool {
    guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
          let certificate = chain.first else { return false }
    let digest = SHA256.hash(data: SecCertificateCopyData(certificate) as Data).map { String(format: "%02x", $0) }.joined()
    return digest == fingerprint &&
      SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, hostname as CFString)) == errSecSuccess &&
      SecTrustSetAnchorCertificates(trust, [certificate] as CFArray) == errSecSuccess &&
      SecTrustSetAnchorCertificatesOnly(trust, true) == errSecSuccess &&
      SecTrustSetNetworkFetchAllowed(trust, false) == errSecSuccess &&
      SecTrustEvaluateWithError(trust, nil)
  }
}

/// 这里只承载厂家主机原生网页；Flutter 通道没有脚本消息、钱包或任意签名接口。
@MainActor
final class Web: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
  private let channel: FlutterMethodChannel
  private var webView: WKWebView?
  private var origin: URL?
  private var hostname = ""
  private var fingerprint = ""
  private var generation = 0
  private var session = 0
  private var opening = false
  private var downloads: [ObjectIdentifier: WKDownload] = [:]
  private var temporaryDownloads: [ObjectIdentifier: URL] = [:]
  #if os(iOS)
  private var controller: UINavigationController?
  private var exportedFile: URL?
  private var exportPicker: UIDocumentPickerViewController?
  #else
  private var window: NSWindow?
  #endif

  init(messenger: FlutterBinaryMessenger) {
    channel = FlutterMethodChannel(name: "tuyufactory/web", binaryMessenger: messenger)
    super.init()
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self else { result(FlutterError(code: "closed", message: nil, details: nil)); return }
      switch call.method {
      case "open": self.open(call.arguments, result: result)
      case "close":
        guard let values = call.arguments as? [String: Any], let requested = values["generation"] as? Int, requested > 0 else {
          result(FlutterError(code: "invalid_generation", message: nil, details: nil)); return
        }
        // 迟到的旧页面关闭请求不影响新页面；已关闭的请求保持幂等。
        if requested == self.session { self.close() }
        result(nil)
      default: result(FlutterMethodNotImplemented)
      }
    }
  }

  private var chinese: Bool { Locale.preferredLanguages.first?.hasPrefix("zh") == true }
  private func text(_ zh: String, _ en: String) -> String { chinese ? zh : en }

  private func open(_ arguments: Any?, result: @escaping FlutterResult) {
    guard !opening, webView == nil else {
      result(FlutterError(code: "busy", message: nil, details: nil)); return
    }
    guard let values = arguments as? [String: Any],
          let session = values["generation"] as? Int, session > 0,
          let name = values["hostname"] as? String,
          name.range(of: "^tuyufactory-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.local$", options: .regularExpression) != nil,
          let digest = values["certificate_sha256"] as? String,
          digest.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
          let port = values["https_port"] as? Int, port == 59460,
          let addresses = values["addresses"] as? [String], !addresses.isEmpty, addresses.count <= 16,
          Set(addresses).count == addresses.count, addresses.allSatisfy(Self.isLocalAddress),
          let value = values["origin"] as? String, let url = URL(string: value),
          url.scheme == "https", url.host == "127.0.0.1", let relayPort = url.port,
          (1024...65535).contains(relayPort), url.user == nil, url.password == nil,
          url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else {
      result(FlutterError(code: "invalid_host", message: nil, details: nil)); return
    }
    hostname = name
    self.session = session
    fingerprint = digest
    origin = url
    opening = true
    generation += 1
    let requestedGeneration = generation
    // 导航代理不覆盖子资源；加载前就编译全部网络资源的默认拒绝策略。
    let escaped = NSRegularExpression.escapedPattern(for: "https://127.0.0.1:\(relayPort)")
    let rules: [[String: Any]] = [
      ["trigger": ["url-filter": ".*"], "action": ["type": "block"]],
      ["trigger": ["url-filter": "^\(escaped)(/|$)"], "action": ["type": "ignore-previous-rules"]],
      ["trigger": ["url-filter": "^(data:|blob:)", "resource-type": ["image", "font", "media"]], "action": ["type": "ignore-previous-rules"]],
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: rules),
          let encoded = String(data: data, encoding: .utf8) else {
      opening = false; result(FlutterError(code: "policy", message: nil, details: nil)); return
    }
    WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "tuyufactory-client", encodedContentRuleList: encoded) { [weak self] list, _ in
      guard let self, requestedGeneration == self.generation else {
        result(FlutterError(code: "closed", message: nil, details: nil)); return
      }
      self.opening = false
      guard let list else { self.origin = nil; result(FlutterError(code: "policy", message: nil, details: nil)); return }
      let configuration = WKWebViewConfiguration()
      configuration.websiteDataStore = .default()
      configuration.userContentController.add(list)
      configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
      configuration.mediaTypesRequiringUserActionForPlayback = .all
      let view = WKWebView(frame: .zero, configuration: configuration)
      view.navigationDelegate = self
      view.uiDelegate = self
      view.allowsBackForwardNavigationGestures = true
      self.webView = view
      guard self.present(view) else {
        self.close(); result(FlutterError(code: "presentation", message: nil, details: nil)); return
      }
      view.load(URLRequest(url: url.appendingPathComponent("login")))
      result(nil)
    }
  }

  private static func isLocalAddress(_ value: String) -> Bool {
    let parts = value.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 4 else { return false }
    let bytes = parts.compactMap { part -> UInt8? in
      guard let number = UInt8(part), String(number) == part else { return nil }
      return number
    }
    guard bytes.count == 4 else { return false }
    return bytes[0] == 10 || (bytes[0] == 172 && (16...31).contains(bytes[1])) ||
      (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 169 && bytes[1] == 254)
  }

  private func allowed(_ url: URL?) -> Bool {
    guard let url, let origin else { return false }
    return url.scheme == "https" && url.host == origin.host && url.port == origin.port &&
      url.user == nil && url.password == nil
  }

  /// TLS 从 WebKit 一直透传到主机：loopback 只是 TCP 地址，证书必须属于固定主机。
  private func authenticate(_ challenge: URLAuthenticationChallenge,
                            completion: (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard let origin,
          challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          challenge.protectionSpace.host == origin.host,
          challenge.protectionSpace.port == origin.port,
          challenge.previousFailureCount == 0,
          let trust = challenge.protectionSpace.serverTrust else {
      completion(.cancelAuthenticationChallenge, nil); return
    }
    guard WebTrust.validate(trust, hostname: hostname, fingerprint: fingerprint) else {
      completion(.cancelAuthenticationChallenge, nil); return
    }
    completion(.useCredential, URLCredential(trust: trust))
  }

  func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
               completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard webView === self.webView else { completionHandler(.cancelAuthenticationChallenge, nil); return }
    authenticate(challenge, completion: completionHandler)
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
               decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard webView === self.webView, allowed(navigationAction.request.url) else { decisionHandler(.cancel); return }
    decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
               decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    guard webView === self.webView, allowed(navigationResponse.response.url) else { decisionHandler(.cancel); return }
    decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
  }

  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
               for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if webView === self.webView, allowed(navigationAction.request.url), navigationAction.targetFrame == nil {
      webView.load(navigationAction.request)
    }
    return nil
  }

  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
               initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
               decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    let validOrigin = origin.protocol == "https" && origin.host == self.origin?.host && origin.port == self.origin?.port
    decisionHandler(webView === self.webView && validOrigin && allowed(frame.request.url) ? .prompt : .deny)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { if webView === self.webView { failed(error) } }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { if webView === self.webView { failed(error) } }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { if webView === self.webView { fail() } }

  private func failed(_ error: Error) {
    if (error as NSError).code != NSURLErrorCancelled { fail() }
  }
  private func fail() {
    channel.invokeMethod("failed", arguments: ["generation": session])
    close()
  }

  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
    if webView === self.webView { keep(download) } else { download.cancel { _ in } }
  }
  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
    if webView === self.webView { keep(download) } else { download.cancel { _ in } }
  }
  private func keep(_ download: WKDownload) {
    download.delegate = self
    downloads[ObjectIdentifier(download)] = download
  }
  func download(_ download: WKDownload, didReceive challenge: URLAuthenticationChallenge,
                completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard downloads[ObjectIdentifier(download)] != nil else { completionHandler(.cancelAuthenticationChallenge, nil); return }
    authenticate(challenge, completion: completionHandler)
  }
  func download(_ download: WKDownload, willPerformHTTPRedirection response: HTTPURLResponse,
                newRequest request: URLRequest, decisionHandler: @escaping (WKDownload.RedirectPolicy) -> Void) {
    decisionHandler(downloads[ObjectIdentifier(download)] != nil && allowed(request.url) ? .allow : .cancel)
  }
  func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
    guard downloads[ObjectIdentifier(download)] != nil, allowed(response.url), suggestedFilename == (suggestedFilename as NSString).lastPathComponent,
          !suggestedFilename.isEmpty, suggestedFilename != ".", suggestedFilename != "..",
          !suggestedFilename.contains("\\"), suggestedFilename.utf8.count <= 240 else {
      completionHandler(nil); return
    }
    let requestedGeneration = generation
    #if os(iOS)
    confirm(text("下载文件？", "Download file?")) { [weak self] confirmed in
      guard let self, confirmed, self.webView != nil, self.generation == requestedGeneration,
            self.downloads[ObjectIdentifier(download)] != nil else { completionHandler(nil); return }
      do {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false,
                                                attributes: [.protectionKey: FileProtectionType.complete])
        let target = directory.appendingPathComponent(suggestedFilename)
        self.temporaryDownloads[ObjectIdentifier(download)] = target
        completionHandler(target)
      } catch { completionHandler(nil) }
    }
    #else
    guard let window else { completionHandler(nil); return }
    let panel = NSSavePanel()
    panel.nameFieldStringValue = suggestedFilename
    panel.canCreateDirectories = true
    panel.beginSheetModal(for: window) { [weak self] response in
      guard let self, self.webView != nil, self.generation == requestedGeneration,
            self.downloads[ObjectIdentifier(download)] != nil, response == .OK, let url = panel.url,
            !FileManager.default.fileExists(atPath: url.path) else { completionHandler(nil); return }
      // WKDownload 不允许覆盖已有文件，不能删除用户文件为下载腾位置。
      self.temporaryDownloads[ObjectIdentifier(download)] = url
      completionHandler(url)
    }
    #endif
  }
  func downloadDidFinish(_ download: WKDownload) {
    let id = ObjectIdentifier(download)
    guard downloads.removeValue(forKey: id) != nil else { return }
    #if os(iOS)
    guard let file = temporaryDownloads[id], let controller, exportedFile == nil,
          controller.presentedViewController == nil else { cleanup(id); return }
    temporaryDownloads.removeValue(forKey: id)
    exportedFile = file
    let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
    picker.delegate = self
    exportPicker = picker
    controller.present(picker, animated: true)
    #else
    temporaryDownloads.removeValue(forKey: id)
    #endif
  }
  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    let id = ObjectIdentifier(download)
    guard downloads.removeValue(forKey: id) != nil else { return }
    cleanup(id)
    // 不记录 URL、Cookie、错误附带的请求或恢复数据。
    fail()
  }
  private func cleanup(_ id: ObjectIdentifier) {
    guard let url = temporaryDownloads.removeValue(forKey: id) else { return }
    #if os(iOS)
    try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
    #else
    // 只删除本次下载新建的未完成文件，绝不删除用户选定的父目录。
    try? FileManager.default.removeItem(at: url)
    #endif
  }

  @objc private func back() { if webView?.canGoBack == true { webView?.goBack() } }
  @objc private func forward() { if webView?.canGoForward == true { webView?.goForward() } }
  @objc private func reload() { webView?.reload() }
  @objc func close() {
    let active = opening || webView != nil
    let closedSession = session
    session = 0
    generation += 1
    opening = false
    webView?.stopLoading()
    webView?.navigationDelegate = nil
    webView?.uiDelegate = nil
    webView?.removeFromSuperview()
    webView = nil
    origin = nil
    hostname = ""
    fingerprint = ""
    for download in downloads.values { download.delegate = nil; download.cancel { _ in } }
    downloads.removeAll()
    for id in Array(temporaryDownloads.keys) { cleanup(id) }
    #if os(iOS)
    if let exportedFile { try? FileManager.default.removeItem(at: exportedFile.deletingLastPathComponent()) }
    exportedFile = nil
    exportPicker?.delegate = nil
    exportPicker = nil
    controller?.dismiss(animated: true)
    controller = nil
    #else
    window?.delegate = nil
    window?.close()
    window = nil
    #endif
    if active { channel.invokeMethod("closed", arguments: ["generation": closedSession]) }
  }

  private func present(_ view: WKWebView) -> Bool {
    #if os(iOS)
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    guard let root = scenes.flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController,
          root.presentedViewController == nil else { return false }
    let content = UIViewController()
    content.title = text("途遇厂家端", "TuyuFactory")
    content.view = view
    content.navigationItem.leftBarButtonItem = UIBarButtonItem(title: text("关闭", "Close"), style: .plain, target: self, action: #selector(close))
    content.navigationItem.rightBarButtonItems = [
      UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(reload)),
      UIBarButtonItem(title: text("前进", "Forward"), style: .plain, target: self, action: #selector(forward)),
      UIBarButtonItem(title: text("后退", "Back"), style: .plain, target: self, action: #selector(back)),
    ]
    let navigation = UINavigationController(rootViewController: content)
    navigation.modalPresentationStyle = .fullScreen
    controller = navigation
    root.present(navigation, animated: true)
    #else
    let content = NSView(frame: NSRect(x: 0, y: 0, width: 1100, height: 760))
    let controls = NSStackView()
    controls.orientation = .horizontal
    for (title, action) in [(text("后退", "Back"), #selector(back)), (text("前进", "Forward"), #selector(forward)),
                            (text("刷新", "Reload"), #selector(reload)), (text("关闭", "Close"), #selector(close))] {
      controls.addArrangedSubview(NSButton(title: title, target: self, action: action))
    }
    controls.translatesAutoresizingMaskIntoConstraints = false
    view.translatesAutoresizingMaskIntoConstraints = false
    content.addSubview(controls)
    content.addSubview(view)
    NSLayoutConstraint.activate([
      controls.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
      controls.topAnchor.constraint(equalTo: content.topAnchor, constant: 8),
      controls.heightAnchor.constraint(equalToConstant: 32),
      view.topAnchor.constraint(equalTo: controls.bottomAnchor, constant: 8),
      view.leadingAnchor.constraint(equalTo: content.leadingAnchor),
      view.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      view.bottomAnchor.constraint(equalTo: content.bottomAnchor),
    ])
    let window = NSWindow(contentRect: content.frame, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = text("途遇厂家端", "TuyuFactory")
    window.contentView = content
    window.isReleasedWhenClosed = false
    window.delegate = self
    window.center()
    window.makeKeyAndOrderFront(nil)
    self.window = window
    #endif
    return true
  }

  private func confirm(_ message: String, completion: @escaping (Bool) -> Void) {
    let requestedGeneration = generation
    #if os(iOS)
    guard let controller, controller.presentedViewController == nil else { completion(false); return }
    let alert = UIAlertController(title: text("途遇厂家端", "TuyuFactory"), message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: text("取消", "Cancel"), style: .cancel) { _ in completion(false) })
    alert.addAction(UIAlertAction(title: text("确定", "OK"), style: .default) { [weak self] _ in completion(self?.generation == requestedGeneration) })
    controller.present(alert, animated: true)
    #else
    guard let window else { completion(false); return }
    let alert = NSAlert()
    alert.messageText = text("途遇厂家端", "TuyuFactory")
    alert.informativeText = message
    alert.addButton(withTitle: text("确定", "OK"))
    alert.addButton(withTitle: text("取消", "Cancel"))
    alert.beginSheetModal(for: window) { [weak self] response in completion(self?.generation == requestedGeneration && response == .alertFirstButtonReturn) }
    #endif
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    guard webView === self.webView, allowed(frame.request.url), message.utf8.count <= 8192 else { completionHandler(); return }
    confirm(message) { _ in completionHandler() }
  }
  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    guard webView === self.webView, allowed(frame.request.url), message.utf8.count <= 8192 else { completionHandler(false); return }
    confirm(message, completion: completionHandler)
  }
  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
               defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
    guard webView === self.webView, allowed(frame.request.url), prompt.utf8.count <= 8192 else { completionHandler(nil); return }
    let requestedGeneration = generation
    #if os(iOS)
    guard let controller, controller.presentedViewController == nil else { completionHandler(nil); return }
    let alert = UIAlertController(title: text("途遇厂家端", "TuyuFactory"), message: prompt, preferredStyle: .alert)
    alert.addTextField { $0.text = defaultText }
    alert.addAction(UIAlertAction(title: text("取消", "Cancel"), style: .cancel) { _ in completionHandler(nil) })
    alert.addAction(UIAlertAction(title: text("确定", "OK"), style: .default) { [weak self, weak alert] _ in completionHandler(self?.generation == requestedGeneration ? alert?.textFields?.first?.text : nil) })
    controller.present(alert, animated: true)
    #else
    guard let window else { completionHandler(nil); return }
    let field = NSTextField(string: defaultText ?? "")
    field.frame = NSRect(x: 0, y: 0, width: 320, height: 24)
    let alert = NSAlert()
    alert.messageText = text("途遇厂家端", "TuyuFactory")
    alert.informativeText = prompt
    alert.accessoryView = field
    alert.addButton(withTitle: text("确定", "OK"))
    alert.addButton(withTitle: text("取消", "Cancel"))
    alert.beginSheetModal(for: window) { [weak self] response in completionHandler(self?.generation == requestedGeneration && response == .alertFirstButtonReturn ? field.stringValue : nil) }
    #endif
  }
}

#if os(iOS)
extension Web: UIDocumentPickerDelegate {
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { if controller === exportPicker { cleanExport() } }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { if controller === exportPicker { cleanExport() } }
  private func cleanExport() {
    if let exportedFile { try? FileManager.default.removeItem(at: exportedFile.deletingLastPathComponent()) }
    exportedFile = nil
    exportPicker?.delegate = nil
    exportPicker = nil
  }
}
#else
extension Web: NSWindowDelegate {
  func windowWillClose(_ notification: Notification) { if (notification.object as? NSWindow) === window { close() } }
  func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
    guard webView === self.webView, allowed(frame.request.url), let window else { completionHandler(nil); return }
    let requestedGeneration = generation
    let panel = NSOpenPanel()
    panel.canChooseFiles = true
    panel.canChooseDirectories = false
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.beginSheetModal(for: window) { [weak self] response in
      completionHandler(self?.generation == requestedGeneration && self?.webView != nil && response == .OK ? panel.urls : nil)
    }
  }
}
#endif
