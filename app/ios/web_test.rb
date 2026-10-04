require 'json'
require 'minitest/autorun'
require 'open3'
require 'pathname'
require 'tmpdir'

class AppleWebTrustTest < Minitest::Test
  def test_real_apple_certificate_evaluation_uses_production_policy
    work = ENV.fetch('TUYUFACTORY_TEST_DIR', Dir.tmpdir)
    raise '测试目录必须是规范绝对路径' unless Pathname.new(work).absolute? && File.realpath(work) == work
    python = ENV.fetch('TUYUFACTORY_TEST_PYTHON')
    scripts = File.expand_path('../../scripts', __dir__)
    swift_source = File.read(File.expand_path('../macos/Runner/Web.swift', __dir__))
    # 测试直接消费生产类型的完整源码段，证书校验没有第二份测试实现。
    policy = swift_source[/struct WebTrust \{.*?^\}\n/m]
    refute_nil policy
    Dir.mktmpdir('apple-trust-', File.join(work, 'tests')) do |directory|
      certificates, error, status = Open3.capture3(python, '-B', '-c', <<~'PYTHON', scripts, directory)
        import base64, datetime, json, sys
        from pathlib import Path
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
        sys.path.insert(0, sys.argv[1])
        from runtime_common import ensure_certificate
        hostname = "tuyufactory-12345678-1234-1234-1234-123456789abc.local"
        certificate, _ = ensure_certificate(Path(sys.argv[2]), hostname)
        valid = x509.load_pem_x509_certificate(certificate.read_bytes())
        result = {"valid": base64.b64encode(valid.public_bytes(serialization.Encoding.DER)).decode()}
        now = datetime.datetime.now(datetime.UTC)
        for case in ("expired", "future", "client", "wrong_host", "missing_eku"):
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, hostname)])
            before, after = now - datetime.timedelta(minutes=1), now + datetime.timedelta(days=30)
            if case == "expired": before, after = now - datetime.timedelta(days=30), now - datetime.timedelta(days=1)
            if case == "future": before, after = now + datetime.timedelta(days=1), now + datetime.timedelta(days=30)
            name = "wrong.local" if case == "wrong_host" else hostname
            value = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject)
                     .public_key(key.public_key()).serial_number(x509.random_serial_number())
                     .not_valid_before(before).not_valid_after(after)
                     .add_extension(x509.SubjectAlternativeName([x509.DNSName(name)]), critical=False))
            if case != "missing_eku":
                eku = ExtendedKeyUsageOID.CLIENT_AUTH if case == "client" else ExtendedKeyUsageOID.SERVER_AUTH
                value = value.add_extension(x509.ExtendedKeyUsage([eku]), critical=False)
            value = value.sign(key, hashes.SHA256())
            result[case] = base64.b64encode(value.public_bytes(serialization.Encoding.DER)).decode()
        print(json.dumps(result))
      PYTHON
      assert status.success?, '生产证书与负向证书生成失败'
      payload = JSON.parse(certificates)
      swift = <<~SWIFT
        import Foundation
        import Security
        import CryptoKit
        #{policy}
        let certificates: [String: String] = #{JSON.generate(payload).gsub('{', '[').gsub('}', ']')}
        let hostname = "tuyufactory-12345678-1234-1234-1234-123456789abc.local"
        var assertions = 0
        for (name, encoded) in certificates {
          let data = Data(base64Encoded: encoded)!
          let certificate = SecCertificateCreateWithData(nil, data as CFData)!
          var trust: SecTrust?
          precondition(SecTrustCreateWithCertificates(certificate, SecPolicyCreateSSL(true, "127.0.0.1" as CFString), &trust) == errSecSuccess)
          let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
          let accepted = WebTrust.validate(trust!, hostname: hostname, fingerprint: digest)
          precondition(accepted == (name == "valid"), "certificate case failed: \\(name)")
          assertions += 1
          if name == "valid" {
            precondition(!WebTrust.validate(trust!, hostname: hostname, fingerprint: String(repeating: "0", count: 64)), "wrong pin accepted")
            precondition(!WebTrust.validate(trust!, hostname: "wrong.local", fingerprint: digest), "wrong fixed host accepted")
            assertions += 2
          }
        }
        print("Apple WebTrust: \\(assertions) assertions passed")
      SWIFT
      output, _, status = Open3.capture3('xcrun', 'swift', '-module-cache-path', File.join(work, 'swift-module-cache'), '-', stdin_data: swift)
      assert status.success?, 'Apple WebTrust 生产策略的真实证书断言失败'
      assert_equal "Apple WebTrust: 8 assertions passed\n", output
    end
  end

  def test_web_boundary_and_session_regression_contract
    source = File.read(File.expand_path('../macos/Runner/Web.swift', __dir__))
    assert_includes source, 'WKContentRuleListStore.default().compileContentRuleList'
    assert_operator source.index('configuration.userContentController.add(list)'), :<, source.index('view.load(URLRequest')
    assert_includes source, 'SecTrustSetNetworkFetchAllowed(trust, false)'
    assert_includes source, 'webView === self.webView'
    assert_includes source, 'self.generation == requestedGeneration'
    assert_includes source, 'arguments: ["generation": closedSession]'
    assert_includes source, 'arguments: ["generation": session]'
    assert_includes source, 'if requested == self.session { self.close() }'
    assert_includes source, 'UIDocumentPickerViewController(forExporting:'
    assert_includes source, 'NSSavePanel()'
    assert_includes source, 'NSOpenPanel()'
    assert_includes source, 'download.delegate = nil'
    assert_match(/func download\(_ download: WKDownload, didFailWithError.*?cleanup\(id\).*?fail\(\)/m, source)
    refute_match(/evaluateJavaScript|WKScriptMessageHandler|addScriptMessageHandler|NSWorkspace\.shared\.open|UIApplication\.shared\.open/, source)
    %w[DebugProfile Release].each do |configuration|
      file = File.expand_path("../macos/Runner/#{configuration}.entitlements", __dir__)
      output, _, status = Open3.capture3('/usr/bin/plutil', '-convert', 'json', '-o', '-', file)
      assert status.success?
      entitlements = JSON.parse(output)
      assert_equal true, entitlements.fetch('com.apple.security.device.camera')
      assert_equal true, entitlements.fetch('com.apple.security.device.audio-input')
      if configuration == 'DebugProfile'
        assert_equal true, entitlements.fetch('com.apple.security.network.client')
        assert_equal true, entitlements.fetch('com.apple.security.files.user-selected.read-write')
      end
    end
  end
end
