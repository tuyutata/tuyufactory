import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var web: Web?

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    // 同一公开插件注册保留完整 CitizenSDK；不向业务网页提供钱包或签名通道。
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    web = Web(messenger: engineBridge.applicationRegistrar.messenger())
  }
}
