import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 源码合同测试只约束原生接线，绝不代替Windows真实WebView2运行验收。
const source = readFileSync(new URL('./web.cpp', import.meta.url), 'utf8').replace(/"\s*L?"/g, '');
const cmake = readFileSync(new URL('./CMakeLists.txt', import.meta.url), 'utf8');
const window = readFileSync(new URL('./flutter_window.cpp', import.meta.url), 'utf8');
const product = readFileSync(new URL('../CMakeLists.txt', import.meta.url), 'utf8');
const flutter = readFileSync(new URL('../flutter/CMakeLists.txt', import.meta.url), 'utf8');

function lock(value) {
  assert.match(value, /file\(SHA256 "\$\{WEBVIEW2_PACKAGE\}" WEBVIEW2_SHA256\)/);
  assert.match(value, /WEBVIEW2_EXPECTED_SHA256 "\$ENV\{TUYUFACTORY_WEBVIEW2_SHA256\}"/);
  assert.doesNotMatch(value, /5ea526bbd728adda0da4d31219267e96460494a427e4894c4e09d9f320f4b9aa/);
  assert.match(value, /message\(FATAL_ERROR "WebView2 NuGet archive SHA-256 mismatch"\)/);
  assert.doesNotMatch(value, /file\(DOWNLOAD|FetchContent|ExternalProject_Add|nuget install/);
}

function requests(value) {
  assert.match(value, /COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,\s*COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL/);
  const method = value.slice(value.indexOf('void Request('));
  assert.ok(method.indexOf('Response(pending, 503') >= 0);
  assert.ok(method.indexOf('Response(pending, 503') < method.indexOf('GetDeferral'));
  assert.match(method, /get_Content\(&stream\)/);
  assert.match(method, /stream->Read\(/);
  assert.match(method, /bytes\.size\(\) \+ count > kMaxBody/);
  assert.match(method, /"request",\s*std::make_unique<EncodableValue>/);
  assert.match(value, /if \(pending->done\)\s*return;/);
  assert.match(value, /GetTickCount64\(\) \+ 122000/);
}

test('只有Client编入窗口和锁定WebView2，不触碰Host或SDK实现', () => {
  const start = cmake.indexOf('if(TUYUFACTORY_PRODUCT STREQUAL "client")');
  assert.ok(start >= 0 && cmake.indexOf('target_sources(${BINARY_NAME} PRIVATE "web.cpp")') > start);
  assert.match(window, /#ifdef TUYUFACTORY_CLIENT\s+web_ = std::make_unique<Web>/);
  assert.ok(window.indexOf('web_.reset()') < window.indexOf('flutter_controller_ = nullptr'));
  assert.doesNotMatch(source, /citizen_sdk|SDK.*sign|AddHostObjectToScript\s*\(/);
});

test('SDK归档与中央摘要必填，缺少或错误归档必须停止', () => {
  lock(cmake);
  assert.match(cmake, /if\(NOT EXISTS "\$\{WEBVIEW2_PACKAGE\}" OR NOT WEBVIEW2_EXPECTED_SHA256 MATCHES/);
  assert.match(cmake, /WebView2 SDK extraction is forbidden in the product source directory/);
  assert.throws(() => lock(cmake.replace('TUYUFACTORY_WEBVIEW2_SHA256', 'CHANGED_WEBVIEW2_SHA256')));
});

test('所有来源HTTP挂起前默认503，正文和响应有界，错误不恢复默认联网', () => {
  requests(source);
  assert.match(source, /constexpr size_t kMaxBody = 64 \* 1024 \* 1024/);
  assert.match(source, /headers->size\(\) <= 256 &&\s*body->size\(\) <= kMaxBody/);
  assert.throws(() => requests(source.replace('Response(pending, 503', 'Response(pending, 200')));
  assert.match(source, /--proxy-server=https:\/\/127\.0\.0\.1:/);
  assert.match(source, /SO_EXCLUSIVEADDRUSE/);
  assert.match(source, /--proxy-bypass-list=<-loopback>/);
  assert.match(source, /disable_non_proxied_udp/);
  assert.doesNotMatch(source, /ignore-certificate-errors|put_Action\([^)]*ALWAYS_ALLOW|listen\(socket_/);
});

test('窗口generation和原生epoch分开，晚到请求不能重新标记为新窗口请求', () => {
  assert.match(source, /!args \|\| Generation\(\*args\) <= 0/);
  assert.match(source, /if \(Generation\(\*args\) == state->caller_generation_\)\s*state->Close\(false\)/);
  assert.doesNotMatch(source, /method_name\(\) == "close"\) \{\s*state->Close/);
  assert.match(source, /caller_generation <= 0/);
  assert.match(source, /caller_generation_ = caller_generation/);
  assert.match(source, /EncodableValue\("generation"\),\s*EncodableValue\(caller_generation_\)/);
  assert.match(source, /payload\[EncodableValue\("generation"\)\] = EncodableValue\(caller_generation_\)/);
  assert.match(source, /\[weak, generation, environment = environment_\]/);
  assert.match(source, /state && state->generation_ == generation\)\s*state->Request\(args\)/);
  assert.match(source, /Event\("failed"\);\s*Close\(false\)/);
  assert.doesNotMatch(source, /\+\+caller_generation_|caller_generation_\+\+/);
});

test('结束请求前摘下列表，超时遍历快照并覆盖初始化超时', () => {
  const close = source.slice(source.indexOf('void Close('), source.indexOf('private:'));
  assert.ok(close.indexOf('ending.swap(pending_)') < close.indexOf('Finish(pending, nullptr)'));
  assert.match(source, /const auto elapsed = state->pending_/);
  assert.match(source, /opening_deadline_ = GetTickCount64\(\) \+ 30000/);
  assert.match(source, /now >= state->opening_deadline_/);
});

test('员工Cookie从原生CookieManager读取，多条Set-Cookie保持独立响应头', () => {
  assert.match(source, /cookies->GetCookies\(/);
  assert.match(source, /Lower\(key\) != "cookie"/);
  assert.match(source, /EncodableValue\("Cookie"\),\s*EncodableValue\(cookie\)/);
  assert.match(source, /block \+= name \+ ": " \+ text \+ "\\r\\n"/);
  assert.doesNotMatch(source, /document\.cookie|ExecuteScript\s*\(|Set-Cookie.*split\(/);
  assert.match(source, /put_IsPasswordAutosaveEnabled\(FALSE\)/);
  assert.match(source, /put_IsGeneralAutofillEnabled\(FALSE\)/);
});

test('导航和新窗口限制同源，摄像头需本次用户确认，下载由用户选位置', () => {
  assert.match(source, /add_FrameNavigationStarting/);
  assert.match(source, /args->put_Handled\(TRUE\)/);
  assert.match(source, /get_IsUserInitiated\(&user\)/);
  assert.match(source, /put_SavesInProfile\(FALSE\)/);
  assert.match(source, /COREWEBVIEW2_PERMISSION_KIND_CAMERA/);
  assert.match(source, /MB_YESNO \| MB_ICONQUESTION \| MB_DEFBUTTON2/);
  assert.match(source, /GetSaveFileName\(&dialog\)/);
  assert.match(source, /OFN_NOCHANGEDIR \| OFN_OVERWRITEPROMPT/);
  assert.match(source, /wcsncmp\(uri, L"blob:", 5\)/);
  assert.match(source, /put_IsWebMessageEnabled\(FALSE\)/);
  assert.match(source, /put_AreHostObjectsAllowed\(FALSE\)/);
});

test('原生标题、工具栏、相机和下载提示服从系统中英文界面语言', () => {
  assert.match(source, /GetUserDefaultUILanguage\(\)/);
  for (const text of ['Employee Workspace', 'Back', 'Forward', 'Close',
    'Allow this factory workspace to use the camera?', 'Save factory workspace file']) {
    assert.ok(source.includes(text), `missing native English text: ${text}`);
  }
});

test('Fixed Runtime只使用包内普通路径，不查找系统Edge或接受环境覆盖', () => {
  assert.match(source, /const auto runtime = FixedRuntime\(\)/);
  assert.match(source, /runtime\.empty\(\)/);
  assert.match(source, /CreateCoreWebView2EnvironmentWithOptions\(\s*runtime\.c_str\(\), data\.c_str\(\)/);
  assert.match(source, /L"\\\\data\\\\webview2"/);
  for (const file of ['msedgewebview2.exe', 'msedge.dll', 'icudtl.dat'])
    assert.ok(source.includes(file));
  assert.match(source, /FILE_ATTRIBUTE_REPARSE_POINT/);
  assert.match(source, /_wcsnicmp\(entry, L"WEBVIEW2_", 9\)/);
  assert.match(source, /HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER/);
  assert.match(source, /KEY_WOW64_64KEY, KEY_WOW64_32KEY/);
  assert.match(source, /KEY_READ \| view/);
  assert.match(source, /result != ERROR_FILE_NOT_FOUND && result != ERROR_PATH_NOT_FOUND/);
  assert.doesNotMatch(source, /SetEnvironmentVariable|RegSet|RegDelete|ShellExecute|CreateCoreWebView2EnvironmentWithOptions\(\s*nullptr/);
});

test('员工浏览器数据仅位于Client自身目录，拒绝联接并独占会话', () => {
  assert.match(source, /FOLDERID_LocalAppData/);
  assert.match(source, /L"com\.tuyufactory\.client", L"web"/);
  assert.match(source, /CreateDirectoryW\(data\.c_str\(\), nullptr\)/);
  assert.match(source, /!OrdinaryPath\(data, true\)/);
  assert.match(source, /put_ExclusiveUserDataFolderAccess\(TRUE\)/);
});

function runtimePermissions(value) {
  const permissions = value.slice(value.indexOf('bool RuntimePermissions('),
    value.indexOf('bool EnvironmentAllowed('));
  assert.match(permissions, /GetProcAddress\(module, "RtlGetVersion"\)/);
  assert.match(permissions, /version\.dwMajorVersion > 10 \|\| version\.dwBuildNumber >= 22000\)\s*return true/);
  assert.match(permissions, /version\.wProductType != VER_NT_WORKSTATION/);
  for (const sid of ['S-1-15-2-1', 'S-1-15-2-2']) assert.ok(permissions.includes(sid));
  assert.match(permissions, /constexpr DWORD access = FILE_GENERIC_READ \| FILE_GENERIC_EXECUTE/);
  assert.match(permissions, /grfAccessMode = GRANT_ACCESS/);
  assert.match(permissions, /grfInheritance = NO_INHERITANCE/);
  assert.match(permissions, /SetEntriesInAclW\(2, grants, existing, &acl\)/);
  assert.match(permissions, /if \(readable\(existing\)\)\s*continue/);
  assert.match(permissions, /if \(!acl\)\s*return true/);
  assert.match(permissions, /GetSecurityInfo\(handle, SE_FILE_OBJECT, DACL_SECURITY_INFORMATION/);
  assert.match(permissions, /SetSecurityInfo\(handle, SE_FILE_OBJECT, DACL_SECURITY_INFORMATION/);
  assert.match(permissions, /!readable\(result\)/);
  assert.doesNotMatch(permissions, /GENERIC_ALL|FILE_ALL_ACCESS|SET_ACCESS|REVOKE_ACCESS|OWNER_SECURITY_INFORMATION|SACL_SECURITY_INFORMATION|SetNamedSecurityInfo|icacls|ShellExecute/);
  const open = value.slice(value.indexOf('void Open('));
  assert.ok(open.indexOf('if (!RuntimePermissions(runtime))') > open.indexOf('const auto runtime = FixedRuntime()'));
  assert.ok(open.indexOf('if (!RuntimePermissions(runtime))') < open.indexOf('opening_ = std::move(result)'));
  assert.match(open, /if \(!RuntimePermissions\(runtime\)\) \{\s*result->Error\("runtime",[^;]+;\s*return;/);
}

test('Win10运行时权限只合并两个沙箱组RX并回读，Win11不额外改权限', () => {
  // 这里只检查生产WinAPI接线；macOS测试不能冒充NTFS或AppContainer运行验收。
  runtimePermissions(source);
  assert.throws(() => runtimePermissions(source.replace('grfAccessMode = GRANT_ACCESS', 'grfAccessMode = SET_ACCESS')));
  assert.throws(() => runtimePermissions(source.replace('FILE_GENERIC_READ | FILE_GENERIC_EXECUTE', 'FILE_ALL_ACCESS')));
  assert.throws(() => runtimePermissions(source.replace('!readable(result)', 'false')));
});

test('运行时ACL仅处理逐级锁定的普通对象，不随继承遍历联接或硬链接', () => {
  const permissions = source.slice(source.indexOf('bool RuntimePermissions('), source.indexOf('bool EnvironmentAllowed('));
  assert.match(permissions, /target \? MAXIMUM_ALLOWED : FILE_READ_ATTRIBUTES/);
  assert.match(permissions, /target \? FILE_SHARE_READ : FILE_SHARE_READ \| FILE_SHARE_WRITE/);
  assert.doesNotMatch(permissions, /FILE_SHARE_DELETE/);
  assert.match(permissions, /FILE_FLAG_BACKUP_SEMANTICS \| FILE_FLAG_OPEN_REPARSE_POINT/);
  assert.match(permissions, /GetFinalPathNameByHandleW/);
  assert.match(permissions, /GetFileInformationByHandle/);
  assert.match(permissions, /info\.nNumberOfLinks != 1/);
  assert.match(permissions, /entry\.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT/);
  assert.match(permissions, /depth > 64 \|\| objects\.size\(\) >= 8192/);
  assert.ok(permissions.indexOf('if (!collect(runtime, 0))') < permissions.indexOf('SetEntriesInAclW'));
  assert.match(permissions, /~Handles\(\).*CloseHandle\(handle\)/);
  assert.match(permissions, /FindClose\(search\)/);
  assert.match(permissions, /~Allocation\(\).*LocalFree\(value\)/);
});

// 直接让 CMake 解释生产选择与入口校验片段，仅设置模拟平台变量；
// 不运行 project、编译器探测或任何生成动作，不冒充 Windows 产品构建。
function configuration(role, entry, arch = 'x64', target = 'windows-x64') {
  const root = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/');
  const selection = product.slice(product.indexOf('set(TUYUFACTORY_PRODUCT'),
    product.indexOf('# Explicitly opt'));
  const validation = flutter.slice(flutter.indexOf('if(NOT DEFINED FLUTTER_TARGET'),
    flutter.indexOf('# TODO:'));
  const script = `cmake_minimum_required(VERSION 3.14)\nfunction(check)\n` +
    `set(WIN32 TRUE)\nset(MSVC TRUE)\nset(CMAKE_SIZEOF_VOID_P 8)\n` +
    `set(CMAKE_GENERATOR_PLATFORM "${arch}")\nset(PROJECT_DIR "${root}")\n` +
    `set(FLUTTER_TARGET "${entry}")\nset(FLUTTER_TARGET_PLATFORM "${target}")\n` +
    selection + validation + `\nmessage(STATUS "selected=\${BINARY_NAME};\${CITIZENSDK_APPLICATION_ID}")\nendfunction()\ncheck()\n`;
  const result = spawnSync(process.env.CMAKE_COMMAND || 'cmake', ['-P', '/dev/stdin'], {
    input: script, encoding: 'utf8', env: {...process.env, TUYU_FACTORY_PRODUCT: role},
  });
  assert.ifError(result.error);
  return {status: result.status, output: result.stdout + result.stderr};
}

test('真实CMake产品选择：正常主机与Client拥有独立可执行文件和SDK身份',
  {skip: process.platform === 'win32' ? '该无生成物CMake标准输入组件测试使用Unix设备路径' : false}, () => {
    for (const [role, binary, identity] of [
      ['host', 'tuyufactory', 'com.tuyufactory'],
      ['client', 'tuyufactory_client', 'com.tuyufactory.client'],
    ]) {
      const result = configuration(role, `lib/main_${role}.dart`);
      assert.equal(result.status, 0, result.output);
      assert.ok(result.output.includes(`selected=${binary};${identity}`));
    }
  });

test('真实CMake拒绝空角色、错误入口、旧默认、错架构和缺少平台',
  {skip: process.platform === 'win32' ? '该无生成物CMake标准输入组件测试使用Unix设备路径' : false}, () => {
    for (const args of [
      ['', 'lib/main_host.dart'], ['employee', 'lib/main_client.dart'],
      ['client', 'lib/main_host.dart'], ['host', 'lib/main_client.dart'],
      ['client', ''], ['host', 'lib/main.dart'],
      ['client', 'lib/main_client.dart', 'ARM64'],
      ['host', 'lib/main_host.dart', 'Win32'],
      ['client', 'lib/main_client.dart', 'x64', ''],
      ['host', 'lib/main_host.dart', 'x64', 'windows-arm64'],
    ]) {
      const result = configuration(...args);
      assert.notEqual(result.status, 0, `must reject ${JSON.stringify(args)}: ${result.output}`);
      assert.match(result.output, /TuyuFactory Windows|TUYU_FACTORY_PRODUCT/);
    }
  });

test('版本资源和Windows官方控制台API不被产品显示名替换', () => {
  const resource = readFileSync(new URL('./Runner.rc', import.meta.url), 'utf8');
  const main = readFileSync(new URL('./main.cpp', import.meta.url), 'utf8');
  const utils = readFileSync(new URL('./utils.cpp', import.meta.url), 'utf8');
  assert.equal((resource.match(/VALUE "InternalName", TUYUFACTORY_BINARY_NAME/g) || []).length, 2);
  assert.equal((resource.match(/VALUE "OriginalFilename", TUYUFACTORY_BINARY_NAME/g) || []).length, 2);
  assert.match(main, /::AttachConsole\(ATTACH_PARENT_PROCESS\)/);
  assert.match(utils, /::AllocConsole\(\)/);
  assert.match(main + utils, /::AttachConsole|::AllocConsole/);
  assert.match(main, /#error TuyuFactory requires exactly one compiled product role/);
  assert.doesNotMatch(main, /TUYU_BOOKING|TUYU\.TuyuBooking/);
});
