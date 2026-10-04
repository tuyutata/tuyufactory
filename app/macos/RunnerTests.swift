import Cocoa
import FlutterMacOS
import XCTest

class RunnerTests: XCTestCase {

  func testInstalledProductKeepsItsOwnIdentity() throws {
    // 原生验收运行于实际 Runner；名称与身份必须成对，禁止两产品互相覆盖。
    let identifier = try XCTUnwrap(Bundle.main.bundleIdentifier)
    let expected = ["com.tuyufactory": "TuyuFactory", "com.tuyufactory.client": "TuyuFactoryClient"]
    let executable = try XCTUnwrap(expected[identifier], "未登记的厂家安装身份")
    XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleExecutable") as? String, executable)
  }

  func testInstalledProductDoesNotDisableTransportSecurity() {
    // 局域网信任由产品固定证书实现，整包不能使用 ATS 全局例外绕过。
    XCTAssertNil(Bundle.main.object(forInfoDictionaryKey: "NSAppTransportSecurity"))
  }

}
