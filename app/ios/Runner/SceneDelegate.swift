// 将厂家分机iOS场景生命周期交由Flutter处理。

import Flutter
import UIKit

// 系统场景事件直接交由 Flutter，SDK 生命周期仍由 ClientApp 唯一持有。
class SceneDelegate: FlutterSceneDelegate {}
