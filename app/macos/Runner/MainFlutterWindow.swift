// 创建厂家macOS Flutter窗口并注册插件及原生通道。

import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  private var web: Web?

  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    RegisterGeneratedPlugins(registry: flutterViewController)
    web = Web(messenger: flutterViewController.engine.binaryMessenger)

    super.awakeFromNib()
  }
}
