require 'json'
require 'minitest/autorun'
require 'open3'
require 'rexml/document'

# 这里只解析真实工程并执行入口拒绝条件，不运行产品编译或生成 Xcode 状态。
class IosPlatformTest < Minitest::Test
  ROOT = File.expand_path(__dir__)

  def plist(relative)
    output, error, status = Open3.capture3('/usr/bin/plutil', '-convert', 'json', '-o', '-', File.join(ROOT, relative))
    assert status.success?, error
    JSON.parse(output)
  end

  def objects
    @objects ||= plist('Runner.pbxproj').fetch('objects')
  end

  def test_only_client_application_and_unique_identity
    targets = objects.values.select { |value| value['isa'] == 'PBXNativeTarget' }
    assert_equal 1, targets.length
    assert_equal 'Runner', targets.first.fetch('name')
    assert_equal 'TuyuFactoryClient', targets.first.fetch('productName')
    configurations = objects.fetch(targets.first.fetch('buildConfigurationList')).fetch('buildConfigurations')
    assert_equal %w[Debug Profile Release], configurations.map { |id| objects.fetch(id).fetch('name') }.sort
    configurations.each do |id|
      settings = objects.fetch(id).fetch('buildSettings')
      assert_equal 'com.tuyufactory.client', settings.fetch('PRODUCT_BUNDLE_IDENTIFIER')
      assert_equal 'TuyuFactoryClient', settings.fetch('PRODUCT_NAME')
      assert_equal 'Runner/Runner.entitlements', settings.fetch('CODE_SIGN_ENTITLEMENTS')
      refute settings.key?('DEVELOPMENT_TEAM'), '不把开发者个人签名身份写入源码'
    end
  end

  def test_iphone_ipad_and_sdk_deployment_target
    project = objects.values.find { |value| value['isa'] == 'PBXProject' }
    configurations = objects.fetch(project.fetch('buildConfigurationList')).fetch('buildConfigurations')
    configurations.each do |id|
      settings = objects.fetch(id).fetch('buildSettings')
      assert_equal '1,2', settings.fetch('TARGETED_DEVICE_FAMILY')
      assert_equal '16.0', settings.fetch('IPHONEOS_DEPLOYMENT_TARGET')
      assert_equal 'arm64', settings.fetch('ARCHS')
    end
    info = plist('Runner/Info.plist')
    assert_equal 3, info.fetch('UISupportedInterfaceOrientations').length
    assert_equal 4, info.fetch('UISupportedInterfaceOrientations~ipad').length
    refute info.key?('UIRequiresFullScreen'), 'iPad 不得被强制成全屏固定布局'
  end

  def test_native_permissions_do_not_disable_transport_security
    info = plist('Runner/Info.plist')
    assert_equal ['_tuyufactory._tcp'], info.fetch('NSBonjourServices')
    %w[NSLocalNetworkUsageDescription NSCameraUsageDescription NSMicrophoneUsageDescription NSPhotoLibraryUsageDescription NSFaceIDUsageDescription].each do |key|
      refute_empty info.fetch(key)
    end
    refute info.key?('NSAppTransportSecurity'), '不得通过 ATS 例外放行不安全传输'
    assert_equal true, plist('Runner/Runner.entitlements').fetch('com.apple.developer.networking.multicast')
  end

  def test_client_entry_guard_rejects_host_missing_and_absolute_target
    phase = objects.values.find { |value| value['isa'] == 'PBXShellScriptBuildPhase' && value['name'] == 'Run Script' }
    script = phase.fetch('shellScript')
    # 只执行生产脚本的身份门禁；Flutter 调用行不可进入本测试。
    guard = script.split("/bin/sh \"$FLUTTER_ROOT/", 2).first
    refute_equal script, guard
    environment = {'FLUTTER_TARGET' => 'lib/main_client.dart', 'PRODUCT_BUNDLE_IDENTIFIER' => 'com.tuyufactory.client',
                   'PRODUCT_NAME' => 'TuyuFactoryClient', 'ARCHS' => 'arm64'}
    assert Open3.capture3(environment, '/bin/sh', '-c', guard).last.success?
    ['lib/main_host.dart', '', '/tmp/main_client.dart'].each do |target|
      refute Open3.capture3(environment.merge('FLUTTER_TARGET' => target), '/bin/sh', '-c', guard).last.success?
    end
    refute Open3.capture3(environment.merge('FLUTTER_TARGET' => nil), '/bin/sh', '-c', guard).last.success?
    {'PRODUCT_BUNDLE_IDENTIFIER' => 'com.tuyufactory', 'PRODUCT_NAME' => 'TuyuFactory', 'ARCHS' => 'x86_64'}.each do |key, value|
      refute Open3.capture3(environment.merge(key => value), '/bin/sh', '-c', guard).last.success?
      refute Open3.capture3(environment.merge(key => nil), '/bin/sh', '-c', guard).last.success?
    end
    %w[Debug Release].each do |configuration|
      source = File.read(File.join(ROOT, 'Flutter', "#{configuration}.xcconfig"))
      assert_includes source, '#include "Generated.xcconfig"'
      refute_match(/^\s*FLUTTER_TARGET\s*=/, source, '不得把调用方的错误入口静默重写成 Client')
    end
  end

  def test_project_references_resolve_and_generated_plugin_entry_is_preserved
    generated = %w[GeneratedPluginRegistrant.h GeneratedPluginRegistrant.m Generated.xcconfig]
    objects.values.select { |value| value['isa'] == 'PBXGroup' }.each do |group|
      group.fetch('children').each do |id|
        child = objects.fetch(id)
        next unless child['isa'] == 'PBXFileReference' && child['sourceTree'] == '<group>'
        path = File.join(ROOT, group.fetch('path', ''), child.fetch('path'))
        next if generated.include?(child.fetch('path'))
        assert File.file?(path), "Xcode 引用缺失：#{path}"
      end
    end
    source = File.read(File.join(ROOT, 'Runner', 'AppDelegate.swift'))
    assert_includes source, 'GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)'
    assert_includes File.read(File.join(ROOT, 'Runner', 'Runner-Bridging-Header.h')), 'GeneratedPluginRegistrant.h'
    objects.values.select { |value| value['isa'] == 'PBXBuildFile' }.each { |value| assert objects.key?(value.fetch('fileRef')) }
  end

  def test_storyboards_and_workspace_are_real_well_formed_documents
    %w[Runner/Main.storyboard Runner/LaunchScreen.storyboard Workspace.xcworkspacedata ProjectWorkspace.xcworkspacedata].each do |relative|
      document = REXML::Document.new(File.read(File.join(ROOT, relative)))
      refute_nil document.root
    end
    document = REXML::Document.new(File.read(File.join(ROOT, 'Runner', 'Main.storyboard')))
    refute_nil REXML::XPath.first(document, '//viewController[@customClass="FlutterViewController"]')
  end

  def test_podfile_uses_standard_public_sdk_registration
    source = File.read(File.join(ROOT, 'Podfile'))
    assert Open3.capture3('ruby', '-c', File.join(ROOT, 'Podfile')).last.success?
    assert_includes source, 'flutter_install_all_ios_pods'
    assert_includes source, "IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'"
    refute_match(/File\.(?:symlink|unlink)/, source)
    refute_match(/FileUtils\.(?:cp|copy|cp_r)/, source)
  end

  def test_source_directories_have_multiple_real_children_and_no_host_files
    ([ROOT] + Dir.glob(File.join(ROOT, '**', '*')).select { |path| File.directory?(path) }).each do |directory|
      assert_operator Dir.children(directory).length, :>=, 2, "单子项目录：#{directory}"
    end
    files = Dir.glob(File.join(ROOT, '**', '*')).select { |path| File.file?(path) }
    refute files.any? { |path| path.match?(/(?:postgres|frappe|erpnext|libtuyufactory|factory_runtime)/i) }
  end
end

# macOS 与 iOS 同属于 Apple 安装边界；复用既有无产物测试入口，
# 真实执行 macOS Podfile 的只读门禁，不触发 Pod 安装和产品编译。
class MacosPackageTest < Minitest::Test
  ROOT = File.expand_path('../macos', __dir__)

  def validate(environment, phase = 'embed')
    Open3.capture3(environment, 'ruby', File.join(ROOT, 'Podfile'), 'validate-product', phase).last.success?
  end

  def environment(role)
    identity = role == 'host' ? ['TuyuFactory', 'com.tuyufactory'] : ['TuyuFactoryClient', 'com.tuyufactory.client']
    {'FLUTTER_TARGET' => "lib/main_#{role}.dart", 'TUYU_FACTORY_PRODUCT_NAME' => identity[0],
     'TUYU_FACTORY_BUNDLE_IDENTIFIER' => identity[1], 'PRODUCT_NAME' => identity[0],
     'PRODUCT_BUNDLE_IDENTIFIER' => identity[1], 'ARCHS' => 'arm64'}
  end

  def test_host_and_client_have_exact_build_identity_without_default
    %w[host client].each do |role|
      current = environment(role)
      assert validate(current)
      assert validate(current, 'assemble')
      %w[FLUTTER_TARGET TUYU_FACTORY_PRODUCT_NAME TUYU_FACTORY_BUNDLE_IDENTIFIER PRODUCT_NAME PRODUCT_BUNDLE_IDENTIFIER ARCHS].each do |key|
        refute validate(current.merge(key => nil)), "缺少 #{key} 不得放行"
        refute validate(current.merge(key => 'unexpected')), "错误 #{key} 不得放行"
      end
      other = environment(role == 'host' ? 'client' : 'host')
      refute validate(current.merge('FLUTTER_TARGET' => other.fetch('FLUTTER_TARGET')))
      refute validate(current, 'unexpected')
    end
    refute_includes File.read(File.join(ROOT, 'Runner/Configs/AppInfo.xcconfig')), '#include "Host.xcconfig"'
  end

  def test_both_xcode_stages_enforce_identity_before_flutter_or_output
    output, error, status = Open3.capture3('/usr/bin/plutil', '-convert', 'json', '-o', '-', File.join(ROOT, 'Runner.pbxproj'))
    assert status.success?, error
    phases = JSON.parse(output).fetch('objects').values.select { |value| value['isa'] == 'PBXShellScriptBuildPhase' }
    assert_equal 2, phases.length
    phases.each do |phase|
      script = phase.fetch('shellScript')
      assert_operator script.index('validate-product'), :<, script.index('macos_assemble.sh')
      assert script.start_with?("set -eu\n")
      assert Open3.capture3('/bin/sh', '-n', stdin_data: script).last.success?
    end
    configurations = JSON.parse(output).fetch('objects').values.select { |value| value['isa'] == 'XCBuildConfiguration' }
    tests = configurations.select { |value| value.fetch('buildSettings').key?('TEST_HOST') }
    assert_equal 3, tests.length
    tests.each do |configuration|
      settings = configuration.fetch('buildSettings')
      assert_equal '$(TUYU_FACTORY_BUNDLE_IDENTIFIER).RunnerTests', settings.fetch('PRODUCT_BUNDLE_IDENTIFIER')
      assert_equal '$(BUILT_PRODUCTS_DIR)/$(TUYU_FACTORY_PRODUCT_NAME).app/Contents/MacOS/$(TUYU_FACTORY_PRODUCT_NAME)', settings.fetch('TEST_HOST')
    end
    podfile = File.read(File.join(ROOT, 'Podfile'))
    assert_includes podfile, 'tuyufactory-#{role}/macos'
    assert_includes podfile, "ENV['GITHUB_ACTIONS'] == 'true'"
  end
end
