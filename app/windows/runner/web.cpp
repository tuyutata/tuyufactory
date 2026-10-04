#include "web.h"

#include <WebView2.h>
#include <WebView2EnvironmentOptions.h>
#include <aclapi.h>
#include <commdlg.h>
#include <flutter/encodable_value.h>
#include <flutter/method_channel.h>
#include <flutter/method_result_functions.h>
#include <flutter/standard_method_codec.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <sddl.h>
#include <winsock2.h>
#include <wrl.h>
#include <ws2tcpip.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <functional>
#include <string>
#include <utility>
#include <vector>

namespace {
using flutter::EncodableList;
using flutter::EncodableMap;
using flutter::EncodableValue;
using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
constexpr size_t kMaxBody = 64 * 1024 * 1024;
constexpr UINT kTimer = 1;

const wchar_t *Caption(const wchar_t *chinese, const wchar_t *english) {
  return PRIMARYLANGID(GetUserDefaultUILanguage()) == LANG_CHINESE ? chinese
                                                                   : english;
}

std::wstring Wide(const std::string &value) {
  const int length =
      MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                          static_cast<int>(value.size()), nullptr, 0);
  if (length <= 0)
    return {};
  std::wstring result(static_cast<size_t>(length), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), result.data(), length);
  return result;
}

std::string Utf8(const wchar_t *value) {
  if (!value)
    return {};
  const int count = static_cast<int>(wcslen(value));
  const int length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value,
                                         count, nullptr, 0, nullptr, nullptr);
  if (length <= 0)
    return {};
  std::string result(static_cast<size_t>(length), '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value, count,
                      result.data(), length, nullptr, nullptr);
  return result;
}

const EncodableValue *Field(const EncodableMap &values, const char *key) {
  auto found = values.find(EncodableValue(key));
  return found == values.end() ? nullptr : &found->second;
}

std::string Text(const EncodableMap &values, const char *key) {
  const auto *value = Field(values, key);
  const auto *string = value ? std::get_if<std::string>(value) : nullptr;
  return string ? *string : std::string();
}

int64_t Generation(const EncodableMap &values) {
  const auto *value = Field(values, "generation");
  if (value) {
    if (const auto *number = std::get_if<int32_t>(value))
      return *number;
    if (const auto *number = std::get_if<int64_t>(value))
      return *number;
  }
  return 0;
}

bool Header(const std::string &name, const std::string &value) {
  if (name.empty() || name.size() > 256 || value.size() > 65536)
    return false;
  for (unsigned char ch : name) {
    if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
          (ch >= '0' && ch <= '9') ||
          std::string("!#$%&'*+-.^_`|~").find(ch) != std::string::npos))
      return false;
  }
  return value.find_first_of("\r\n\0", 0, 3) == std::string::npos;
}

std::string Lower(std::string value) {
  for (auto &ch : value)
    if (ch >= 'A' && ch <= 'Z')
      ch += 'a' - 'A';
  return value;
}

// Fixed Runtime 只能位于本安装包内；拒绝目录联接，不能转向另一安装或用户载荷。
bool OrdinaryPath(const std::wstring &path, bool directory) {
  if (path.size() < 3 || path[1] != L':' || path[2] != L'\\')
    return false;
  for (size_t index = 3; index <= path.size(); ++index) {
    if (index != path.size() && path[index] != L'\\')
      continue;
    const auto attributes = GetFileAttributesW(path.substr(0, index).c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES ||
        (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 ||
        ((attributes & FILE_ATTRIBUTE_DIRECTORY) != 0) !=
            (index < path.size() || directory))
      return false;
  }
  return true;
}

std::wstring FixedRuntime() {
  std::wstring executable(32768, L'\0');
  const DWORD length = GetModuleFileNameW(
      nullptr, executable.data(), static_cast<DWORD>(executable.size()));
  if (length == 0 || length >= executable.size())
    return {};
  executable.resize(length);
  if (!OrdinaryPath(executable, false))
    return {};
  const auto runtime = executable.substr(0, executable.find_last_of(L'\\')) +
                       L"\\data\\webview2";
  if (!OrdinaryPath(runtime, true) ||
      !OrdinaryPath(runtime + L"\\msedgewebview2.exe", false) ||
      !OrdinaryPath(runtime + L"\\msedge.dll", false) ||
      !OrdinaryPath(runtime + L"\\icudtl.dat", false))
    return {};
  return runtime;
}

// ZIP 不携带 NTFS ACL。微软要求 Win10 的非 MSIX Fixed Runtime 为两个
// AppContainer 组提供 RX；Win11 无此附加要求，不能顺带修改其它目录。
bool RuntimePermissions(const std::wstring &runtime) {
  using VersionFunction = LONG(WINAPI *)(OSVERSIONINFOEXW *);
  const auto module = GetModuleHandleW(L"ntdll.dll");
  const auto address = module ? GetProcAddress(module, "RtlGetVersion") : nullptr;
  if (!address)
    return false;
  VersionFunction version_function = nullptr;
  static_assert(sizeof(version_function) == sizeof(address));
  std::memcpy(&version_function, &address, sizeof(version_function));
  OSVERSIONINFOEXW version{};
  version.dwOSVersionInfoSize = sizeof(version);
  if (version_function(&version) != 0 || version.dwMajorVersion < 10)
    return false;
  if (version.dwMajorVersion > 10 || version.dwBuildNumber >= 22000)
    return true;
  if (version.wProductType != VER_NT_WORKSTATION || !OrdinaryPath(runtime, true))
    return false;

  struct Handles {
    std::vector<HANDLE> values;
    ~Handles() { for (const auto handle : values) CloseHandle(handle); }
  } pinned;
  std::vector<HANDLE> objects;
  // 父目录只读锁住且不共享删除；后续操作始终使用回读过的句柄而非再次解析路径。
  const auto open = [&](const std::wstring &path, bool directory, bool target) {
    const auto handle = CreateFileW(
        path.c_str(), target ? MAXIMUM_ALLOWED : FILE_READ_ATTRIBUTES,
        target ? FILE_SHARE_READ : FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
        OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
        nullptr);
    if (handle == INVALID_HANDLE_VALUE)
      return false;
    pinned.values.push_back(handle);
    BY_HANDLE_FILE_INFORMATION info{};
    std::wstring actual(32768, L'\0');
    const auto length = GetFinalPathNameByHandleW(
        handle, actual.data(), static_cast<DWORD>(actual.size()), FILE_NAME_NORMALIZED);
    if (!GetFileInformationByHandle(handle, &info) ||
        (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 ||
        ((info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) != directory ||
        (!directory && info.nNumberOfLinks != 1) || length == 0 || length >= actual.size())
      return false;
    actual.resize(length);
    if (_wcsicmp(actual.c_str(), (L"\\\\?\\" + path).c_str()) != 0)
      return false;
    if (target)
      objects.push_back(handle);
    return true;
  };
  for (size_t index = 3; index < runtime.size(); ++index)
    if (runtime[index] == L'\\' && !open(runtime.substr(0, index), true, false))
      return false;

  std::function<bool(const std::wstring &, size_t)> collect;
  collect = [&](const std::wstring &path, size_t depth) {
    if (depth > 64 || objects.size() >= 8192 || !open(path, true, true))
      return false;
    WIN32_FIND_DATAW entry{};
    const auto search = FindFirstFileExW((path + L"\\*").c_str(), FindExInfoBasic,
                                        &entry, FindExSearchNameMatch, nullptr, 0);
    if (search == INVALID_HANDLE_VALUE)
      return GetLastError() == ERROR_FILE_NOT_FOUND;
    bool valid = true;
    do {
      const std::wstring name(entry.cFileName);
      if (name == L"." || name == L"..")
        continue;
      if ((entry.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 ||
          objects.size() >= 8192) {
        valid = false;
        break;
      }
      const auto child = path + L"\\" + name;
      valid = (entry.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0
                  ? collect(child, depth + 1) : open(child, false, true);
      if (!valid)
        break;
    } while (FindNextFileW(search, &entry));
    if (valid && GetLastError() != ERROR_NO_MORE_FILES)
      valid = false;
    FindClose(search);
    return valid;
  };
  if (!collect(runtime, 0))
    return false;

  struct Allocation {
    void *value = nullptr;
    ~Allocation() { if (value) LocalFree(value); }
  } packages, restricted;
  if (!ConvertStringSidToSidW(L"S-1-15-2-1", &packages.value) ||
      !ConvertStringSidToSidW(L"S-1-15-2-2", &restricted.value))
    return false;
  EXPLICIT_ACCESSW grants[2]{};
  const std::array<PSID, 2> sids{packages.value, restricted.value};
  constexpr DWORD access = FILE_GENERIC_READ | FILE_GENERIC_EXECUTE;
  for (size_t index = 0; index < sids.size(); ++index) {
    grants[index].grfAccessPermissions = access;
    grants[index].grfAccessMode = GRANT_ACCESS;
    grants[index].grfInheritance = NO_INHERITANCE;
    grants[index].Trustee.TrusteeForm = TRUSTEE_IS_SID;
    grants[index].Trustee.TrusteeType = TRUSTEE_IS_WELL_KNOWN_GROUP;
    grants[index].Trustee.ptstrName = static_cast<LPWSTR>(sids[index]);
  }
  const auto readable = [&](PACL acl) {
    // null DACL 原本已允许访问；绝不能把它重建成仅包含两个 SID 的新权限表。
    if (!acl)
      return true;
    for (auto &grant : grants) {
      ACCESS_MASK rights = 0;
      if (GetEffectiveRightsFromAclW(acl, &grant.Trustee, &rights) != ERROR_SUCCESS ||
          (rights & access) != access)
        return false;
    }
    return true;
  };
  for (const auto handle : objects) {
    Allocation security, merged, checked;
    PACL existing = nullptr;
    if (GetSecurityInfo(handle, SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
                        nullptr, nullptr, &existing, nullptr, &security.value) != ERROR_SUCCESS)
      return false;
    if (readable(existing))
      continue;
    PACL acl = nullptr;
    if (SetEntriesInAclW(2, grants, existing, &acl) != ERROR_SUCCESS)
      return false;
    merged.value = acl;
    // MAXIMUM_ALLOWED 句柄按 SetSecurityInfo 官方合同禁止自动向子项传播；
    // 每个已检查对象单独合并 RX，保留既有允许/拒绝 ACE、所有者及审计策略。
    if (!readable(acl) || SetSecurityInfo(handle, SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
                                        nullptr, nullptr, acl, nullptr) != ERROR_SUCCESS)
      return false;
    PACL result = nullptr;
    if (GetSecurityInfo(handle, SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
                        nullptr, nullptr, &result, nullptr, &checked.value) != ERROR_SUCCESS ||
        !readable(result))
      return false;
  }
  return true;
}

bool EnvironmentAllowed() {
  // WebView2 环境变量可以追加浏览器参数、启用调试或替换目录。全部拒绝，
  // 不修改进程环境掩盖用户策略；也不读取或记录这些变量的内容。
  LPWCH environment = GetEnvironmentStringsW();
  if (!environment)
    return false;
  bool allowed = true;
  for (const wchar_t *entry = environment; *entry; entry += wcslen(entry) + 1)
    if (_wcsnicmp(entry, L"WEBVIEW2_", 9) == 0) {
      allowed = false;
      break;
    }
  FreeEnvironmentStringsW(environment);
  if (!allowed)
    return false;
  // 官方 Loader 还会读取此策略树，HKLM/HKCU 和两种视图均检查。
  // 只要存在策略或无法确认不存在就拒绝打开，绝不删除系统策略或降级到 Edge。
  for (const auto hive : {HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER}) {
    for (const REGSAM view : {KEY_WOW64_64KEY, KEY_WOW64_32KEY}) {
      HKEY key = nullptr;
      const auto result = RegOpenKeyExW(
          hive, L"SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2", 0,
          KEY_READ | view, &key);
      if (result == ERROR_SUCCESS)
        RegCloseKey(key);
      if (result != ERROR_FILE_NOT_FOUND && result != ERROR_PATH_NOT_FOUND)
        return false;
    }
  }
  return true;
}
} // namespace

class Web::State : public std::enable_shared_from_this<Web::State> {
public:
  State(flutter::BinaryMessenger *messenger, HWND owner) : owner_(owner) {
    channel_ = std::make_unique<flutter::MethodChannel<EncodableValue>>(
        messenger, "tuyufactory/web",
        &flutter::StandardMethodCodec::GetInstance());
  }

  void Register() {
    std::weak_ptr<State> weak = shared_from_this();
    channel_->SetMethodCallHandler([weak](const auto &call, auto result) {
      auto state = weak.lock();
      if (!state) {
        result->Error("closed", "员工窗口已关闭");
        return;
      }
      if (call.method_name() == "close") {
        const auto *args = call.arguments()
                               ? std::get_if<EncodableMap>(call.arguments())
                               : nullptr;
        if (!args || Generation(*args) <= 0) {
          result->Error("arguments", "关闭窗口参数无效");
          return;
        }
        // 旧窗口的异步清理只能关闭自己，不能关闭已经打开的新会话。
        if (Generation(*args) == state->caller_generation_)
          state->Close(false);
        result->Success();
      } else if (call.method_name() == "open") {
        const auto *args = call.arguments()
                               ? std::get_if<EncodableMap>(call.arguments())
                               : nullptr;
        if (!args) {
          result->Error("arguments", "窗口参数无效");
          return;
        }
        state->Open(*args, std::move(result));
      } else {
        result->NotImplemented();
      }
    });
  }

  ~State() {
    channel_->SetMethodCallHandler(nullptr);
    Close(false);
    if (socket_ != INVALID_SOCKET)
      closesocket(socket_);
    if (winsock_)
      WSACleanup();
  }

  void Close(bool notify) {
    ++generation_;
    // Complete可能同步重入；先摘下列表，不能边遍历共享容器边结束COM请求。
    std::vector<std::shared_ptr<Pending>> ending;
    ending.swap(pending_);
    for (auto &pending : ending)
      Finish(pending, nullptr);
    if (controller_)
      controller_->Close();
    controller_.Reset();
    view_.Reset();
    environment_.Reset();
    if (window_) {
      HWND old = window_;
      window_ = nullptr;
      KillTimer(old, kTimer);
      DestroyWindow(old);
    }
    if (opening_) {
      opening_->Error("closed", "员工窗口未能打开");
      opening_.reset();
    }
    if (notify)
      Event("closed");
  }

private:
  struct Pending {
    ComPtr<ICoreWebView2WebResourceRequestedEventArgs> args;
    ComPtr<ICoreWebView2Deferral> deferral;
    ComPtr<ICoreWebView2Environment> environment;
    ULONGLONG deadline = 0;
    bool done = false;
  };

  bool Allowed(const std::wstring &url) const {
    // origin 已由严格的固定主机字段重建；边界分隔符阻止同前缀恶意域名。
    return url == origin_ ||
           (url.size() > origin_.size() &&
            url.compare(0, origin_.size(), origin_) == 0 &&
            (url[origin_.size()] == L'/' || url[origin_.size()] == L'?' ||
             url[origin_.size()] == L'#'));
  }

  static LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM wparam,
                                     LPARAM lparam) {
    auto *state =
        reinterpret_cast<State *>(GetWindowLongPtr(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) {
      state = static_cast<State *>(
          reinterpret_cast<CREATESTRUCT *>(lparam)->lpCreateParams);
      SetWindowLongPtr(window, GWLP_USERDATA,
                       reinterpret_cast<LONG_PTR>(state));
    }
    if (!state)
      return DefWindowProc(window, message, wparam, lparam);
    if (message == WM_CLOSE) {
      state->Close(true);
      return 0;
    }
    if (message == WM_SIZE) {
      state->Resize();
      return 0;
    }
    if (message == WM_TIMER && wparam == kTimer) {
      const auto now = GetTickCount64();
      if (state->opening_ && now >= state->opening_deadline_) {
        state->Fail();
        return 0;
      }
      const auto elapsed = state->pending_;
      for (const auto &pending : elapsed)
        if (!pending->done && pending->deadline <= now)
          state->Finish(pending, nullptr);
      state->pending_.erase(
          std::remove_if(state->pending_.begin(), state->pending_.end(),
                         [](const auto &pending) { return pending->done; }),
          state->pending_.end());
      return 0;
    }
    if (message == WM_COMMAND) {
      if (LOWORD(wparam) == 102) {
        state->Close(true);
        return 0;
      }
      if (state->view_) {
        if (LOWORD(wparam) == 100)
          state->view_->GoBack();
        if (LOWORD(wparam) == 101)
          state->view_->GoForward();
      }
      return 0;
    }
    return DefWindowProc(window, message, wparam, lparam);
  }

  void Resize() {
    if (!window_ || !controller_)
      return;
    RECT bounds;
    GetClientRect(window_, &bounds);
    bounds.top = 44;
    controller_->put_Bounds(bounds);
    controller_->NotifyParentWindowPositionChanged();
  }

  void Fail() {
    if (opening_) {
      opening_->Error("webview", "WebView2 或安全容器初始化失败");
      opening_.reset();
    }
    Event("failed");
    Close(false);
  }

  void Event(const char *method) {
    channel_->InvokeMethod(
        method, std::make_unique<EncodableValue>(
                    EncodableMap{{EncodableValue("generation"),
                                  EncodableValue(caller_generation_)}}));
  }

  void Open(const EncodableMap &args,
            std::unique_ptr<flutter::MethodResult<EncodableValue>> result) {
    if (window_ || opening_) {
      result->Error("busy", "员工窗口已经打开");
      return;
    }
    const auto hostname = Text(args, "hostname");
    const auto fingerprint = Text(args, "certificate_sha256");
    const auto origin = Text(args, "origin");
    const auto caller_generation = Generation(args);
    const auto *port = Field(args, "https_port");
    if (caller_generation <= 0 || hostname.size() != 54 ||
        hostname.compare(0, 12, "tuyufactory-") != 0 ||
        hostname.compare(48, 6, ".local") != 0 || fingerprint.size() != 64 ||
        !port || !std::holds_alternative<int32_t>(*port) ||
        std::get<int32_t>(*port) != 59460 ||
        origin != "https://" + hostname + ":59460") {
      result->Error("arguments", "固定主机身份无效");
      return;
    }
    for (size_t i = 12; i < 48; ++i) {
      const bool dash = i == 20 || i == 25 || i == 30 || i == 35;
      const char ch = hostname[i];
      if (dash ? ch != '-'
               : !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) {
        result->Error("arguments", "固定主机身份无效");
        return;
      }
    }
    for (char ch : fingerprint)
      if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) {
        result->Error("arguments", "固定主机指纹无效");
        return;
      }
    if (!EnvironmentAllowed()) {
      result->Error("environment", "WebView2 环境或策略覆盖不允许");
      return;
    }
    const auto runtime = FixedRuntime();
    if (runtime.empty()) {
      result->Error("runtime", "安装包内的 WebView2 Runtime 缺失或路径无效");
      return;
    }
    if (!RuntimePermissions(runtime)) {
      result->Error("runtime", "WebView2 Runtime 的本机读取执行权限无法安全准备");
      return;
    }
    origin_ = Wide(origin);
    caller_generation_ = caller_generation;
    opening_ = std::move(result);
    opening_deadline_ = GetTickCount64() + 30000;
    PWSTR local = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_DEFAULT,
                                    nullptr, &local))) {
      Fail();
      return;
    }
    std::wstring data(local);
    CoTaskMemFree(local);
    if (!OrdinaryPath(data, true)) {
      Fail();
      return;
    }
    // 只创建 Client 自己的数据根；已有文件或联接不能变成共享员工会话目录。
    for (const auto *part : {L"com.tuyufactory.client", L"web"}) {
      data += std::wstring(L"\\") + part;
      if ((!CreateDirectoryW(data.c_str(), nullptr) &&
           GetLastError() != ERROR_ALREADY_EXISTS) || !OrdinaryPath(data, true)) {
        Fail();
        return;
      }
    }
    sockaddr_in endpoint{};
    int endpoint_size = sizeof(endpoint);
    if (socket_ == INVALID_SOCKET) {
      if (!winsock_) {
        WSADATA startup;
        if (WSAStartup(MAKEWORD(2, 2), &startup)) {
          Fail();
          return;
        }
        winsock_ = true;
      }
      socket_ = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
      BOOL exclusive = TRUE;
      endpoint.sin_family = AF_INET;
      endpoint.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
      if (socket_ == INVALID_SOCKET ||
          setsockopt(socket_, SOL_SOCKET, SO_EXCLUSIVEADDRUSE,
                     reinterpret_cast<const char *>(&exclusive),
                     sizeof(exclusive)) == SOCKET_ERROR ||
          bind(socket_, reinterpret_cast<sockaddr *>(&endpoint),
               sizeof(endpoint)) == SOCKET_ERROR) {
        if (socket_ != INVALID_SOCKET)
          closesocket(socket_);
        socket_ = INVALID_SOCKET;
        Fail();
        return;
      }
    }
    // 整个Flutter进程复用同一个拒绝端口；关闭再打开不改变仍在退出中的浏览器参数。
    if (getsockname(socket_, reinterpret_cast<sockaddr *>(&endpoint),
                    &endpoint_size) == SOCKET_ERROR) {
      Fail();
      return;
    }
    // 独占保留但不监听：所有漏拦的网络都失败，不建立第二条远端业务连接。
    const auto arguments =
        L"--proxy-server=https://127.0.0.1:" +
        std::to_wstring(ntohs(endpoint.sin_port)) +
        L" --proxy-bypass-list=<-loopback> "
        L"--force-webrtc-ip-handling-policy=disable_non_proxied_udp";
    auto options = Microsoft::WRL::Make<CoreWebView2EnvironmentOptions>();
    if (FAILED(options->put_AdditionalBrowserArguments(arguments.c_str())) ||
        FAILED(options->put_ExclusiveUserDataFolderAccess(TRUE))) {
      Fail();
      return;
    }
    WNDCLASS cls{};
    cls.lpfnWndProc = WindowProc;
    cls.hInstance = GetModuleHandle(nullptr);
    cls.lpszClassName = L"TuyuFactoryClientWeb";
    cls.hCursor = LoadCursor(nullptr, IDC_ARROW);
    cls.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    if (!RegisterClass(&cls) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
      Fail();
      return;
    }
    window_ =
        CreateWindowEx(0, cls.lpszClassName,
                       Caption(L"途遇厂家分机 · 员工工作台",
                               L"TuyuFactory Client · Employee Workspace"),
                       WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1200,
                       820, owner_, nullptr, cls.hInstance, this);
    if (!window_) {
      Fail();
      return;
    }
    const wchar_t *labels[] = {Caption(L"后退", L"Back"),
                               Caption(L"前进", L"Forward"),
                               Caption(L"关闭", L"Close")};
    for (int i = 0; i < 3; ++i)
      CreateWindowEx(0, L"BUTTON", labels[i],
                     WS_CHILD | WS_VISIBLE | WS_TABSTOP, 8 + i * 88, 6, 80, 30,
                     window_,
                     reinterpret_cast<HMENU>(static_cast<INT_PTR>(100 + i)),
                     cls.hInstance, nullptr);
    SetTimer(window_, kTimer, 1000, nullptr);
    const auto generation = generation_;
    std::weak_ptr<State> weak = shared_from_this();
    const auto hr = CreateCoreWebView2EnvironmentWithOptions(
        runtime.c_str(), data.c_str(), options.Get(),
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [weak,
             generation](HRESULT error,
                         ICoreWebView2Environment *environment) -> HRESULT {
              auto state = weak.lock();
              if (!state || generation != state->generation_)
                return S_OK;
              if (FAILED(error) || !environment) {
                state->Fail();
                return S_OK;
              }
              state->environment_ = environment;
              const auto created = environment->CreateCoreWebView2Controller(
                  state->window_,
                  Callback<
                      ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                      [weak, generation](
                          HRESULT error,
                          ICoreWebView2Controller *controller) -> HRESULT {
                        auto state = weak.lock();
                        if (!state || generation != state->generation_) {
                          if (controller)
                            controller->Close();
                          return S_OK;
                        }
                        if (FAILED(error) || !controller) {
                          state->Fail();
                          return S_OK;
                        }
                        state->controller_ = controller;
                        if (FAILED(
                                controller->get_CoreWebView2(&state->view_)) ||
                            !state->Configure()) {
                          state->Fail();
                          return S_OK;
                        }
                        state->Resize();
                        if (FAILED(state->view_->Navigate(
                                (state->origin_ + L"/login").c_str()))) {
                          state->Fail();
                          return S_OK;
                        }
                        ShowWindow(state->window_, SW_SHOW);
                        state->opening_->Success();
                        state->opening_.reset();
                        return S_OK;
                      })
                      .Get());
              if (FAILED(created))
                state->Fail();
              return S_OK;
            })
            .Get());
    if (FAILED(hr))
      Fail();
  }

  bool Configure() {
    ComPtr<ICoreWebView2_22> resources;
    ComPtr<ICoreWebView2_4> downloads;
    ComPtr<ICoreWebView2Settings> settings;
    ComPtr<ICoreWebView2Settings4> private_settings;
    if (FAILED(view_.As(&resources)) || FAILED(view_.As(&downloads)) ||
        FAILED(view_->get_Settings(&settings)) ||
        FAILED(settings.As(&private_settings)) ||
        FAILED(private_settings->put_IsPasswordAutosaveEnabled(FALSE)) ||
        FAILED(private_settings->put_IsGeneralAutofillEnabled(FALSE)) ||
        FAILED(settings->put_IsWebMessageEnabled(FALSE)) ||
        FAILED(settings->put_AreHostObjectsAllowed(FALSE)) ||
        FAILED(settings->put_AreDevToolsEnabled(FALSE)) ||
        FAILED(settings->put_AreDefaultContextMenusEnabled(FALSE)) ||
        FAILED(settings->put_IsStatusBarEnabled(FALSE)) ||
        FAILED(resources->AddWebResourceRequestedFilterWithRequestSourceKinds(
            L"*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
            COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL)))
      return false;
    std::weak_ptr<State> weak = shared_from_this();
    EventRegistrationToken token{};
    const auto generation = generation_;
    auto navigation = Callback<ICoreWebView2NavigationStartingEventHandler>(
        [weak, generation](
            ICoreWebView2 *,
            ICoreWebView2NavigationStartingEventArgs *args) -> HRESULT {
          auto state = weak.lock();
          LPWSTR uri = nullptr;
          const bool allowed = state && state->generation_ == generation &&
                               SUCCEEDED(args->get_Uri(&uri)) && uri &&
                               state->Allowed(uri);
          CoTaskMemFree(uri);
          args->put_Cancel(!allowed);
          return S_OK;
        });
    if (FAILED(view_->add_NavigationStarting(navigation.Get(), &token)) ||
        FAILED(view_->add_FrameNavigationStarting(navigation.Get(), &token)))
      return false;
    if (FAILED(view_->add_NewWindowRequested(
            Callback<ICoreWebView2NewWindowRequestedEventHandler>(
                [weak, generation](
                    ICoreWebView2 *,
                    ICoreWebView2NewWindowRequestedEventArgs *args) -> HRESULT {
                  args->put_Handled(TRUE);
                  auto state = weak.lock();
                  LPWSTR uri = nullptr;
                  BOOL user = FALSE;
                  if (state && state->generation_ == generation &&
                      SUCCEEDED(args->get_Uri(&uri)) &&
                      SUCCEEDED(args->get_IsUserInitiated(&user)) && user &&
                      uri && state->Allowed(uri))
                    state->view_->Navigate(uri);
                  CoTaskMemFree(uri);
                  return S_OK;
                })
                .Get(),
            &token)))
      return false;
    if (FAILED(view_->add_PermissionRequested(
            Callback<ICoreWebView2PermissionRequestedEventHandler>(
                [weak, generation](ICoreWebView2 *,
                                   ICoreWebView2PermissionRequestedEventArgs
                                       *args) -> HRESULT {
                  args->put_State(COREWEBVIEW2_PERMISSION_STATE_DENY);
                  ComPtr<ICoreWebView2PermissionRequestedEventArgs3> transient;
                  if (FAILED(args->QueryInterface(IID_PPV_ARGS(&transient))) ||
                      FAILED(transient->put_SavesInProfile(FALSE)))
                    return S_OK;
                  auto state = weak.lock();
                  LPWSTR uri = nullptr;
                  BOOL user = FALSE;
                  COREWEBVIEW2_PERMISSION_KIND kind{};
                  if (state && state->generation_ == generation &&
                      SUCCEEDED(args->get_Uri(&uri)) && uri &&
                      state->Allowed(uri) &&
                      SUCCEEDED(args->get_IsUserInitiated(&user)) && user &&
                      SUCCEEDED(args->get_PermissionKind(&kind)) &&
                      kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA &&
                      MessageBox(
                          state->window_,
                          Caption(L"允许当前厂家工作台使用摄像头？",
                                  L"Allow this factory workspace to use the "
                                  L"camera?"),
                          Caption(L"途遇厂家分机", L"TuyuFactory Client"),
                          MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2) ==
                          IDYES &&
                      state->generation_ == generation && state->window_)
                    args->put_State(COREWEBVIEW2_PERMISSION_STATE_ALLOW);
                  CoTaskMemFree(uri);
                  return S_OK;
                })
                .Get(),
            &token)))
      return false;
    if (FAILED(downloads->add_DownloadStarting(
            Callback<ICoreWebView2DownloadStartingEventHandler>(
                [weak, generation](
                    ICoreWebView2 *,
                    ICoreWebView2DownloadStartingEventArgs *args) -> HRESULT {
                  args->put_Cancel(TRUE);
                  auto state = weak.lock();
                  ComPtr<ICoreWebView2DownloadOperation> operation;
                  LPWSTR uri = nullptr;
                  if (!state || state->generation_ != generation ||
                      FAILED(args->get_DownloadOperation(&operation)) ||
                      FAILED(operation->get_Uri(&uri)))
                    return S_OK;
                  // 同源blob来自已验证页面，不触发远端网络；仍需用户明确选保存位置。
                  const bool allowed =
                      uri &&
                      (state->Allowed(uri) || (wcsncmp(uri, L"blob:", 5) == 0 &&
                                               state->Allowed(uri + 5)));
                  CoTaskMemFree(uri);
                  if (!allowed)
                    return S_OK;
                  std::array<wchar_t, 32768> destination{};
                  OPENFILENAME dialog{};
                  dialog.lStructSize = sizeof(dialog);
                  dialog.hwndOwner = state->window_;
                  dialog.lpstrFile = destination.data();
                  dialog.nMaxFile = static_cast<DWORD>(destination.size());
                  dialog.lpstrTitle = Caption(L"保存厂家工作台文件",
                                              L"Save factory workspace file");
                  dialog.Flags = OFN_EXPLORER | OFN_PATHMUSTEXIST |
                                 OFN_NOCHANGEDIR | OFN_OVERWRITEPROMPT;
                  if (GetSaveFileName(&dialog) &&
                      state->generation_ == generation && state->window_ &&
                      SUCCEEDED(args->put_ResultFilePath(destination.data()))) {
                    args->put_Handled(TRUE);
                    args->put_Cancel(FALSE);
                  }
                  return S_OK;
                })
                .Get(),
            &token)))
      return false;
    if (FAILED(view_->add_WebResourceRequested(
            Callback<ICoreWebView2WebResourceRequestedEventHandler>(
                [weak, generation, environment = environment_](
                    ICoreWebView2 *, ICoreWebView2WebResourceRequestedEventArgs
                                         *args) -> HRESULT {
                  auto state = weak.lock();
                  if (state && state->generation_ == generation)
                    state->Request(args);
                  else {
                    auto expired = std::make_shared<Pending>();
                    expired->args = args;
                    expired->environment = environment;
                    Response(expired, 503, L"Cache-Control: no-store\r\n", {});
                  }
                  return S_OK;
                })
                .Get(),
            &token)))
      return false;
    return true;
  }

  static bool Response(const std::shared_ptr<Pending> &pending, int status,
                       const std::wstring &headers,
                       const std::vector<uint8_t> &body) {
    ComPtr<IStream> stream;
    stream.Attach(
        SHCreateMemStream(body.data(), static_cast<UINT>(body.size())));
    if (!stream)
      return false;
    ComPtr<ICoreWebView2WebResourceResponse> response;
    return SUCCEEDED(pending->environment->CreateWebResourceResponse(
               stream.Get(), status,
               status == 503 ? L"Service Unavailable" : L"Response",
               headers.c_str(), &response)) &&
           SUCCEEDED(pending->args->put_Response(response.Get()));
  }

  static void Finish(const std::shared_ptr<Pending> &pending,
                     const EncodableValue *value) {
    if (pending->done)
      return;
    pending->done = true;
    const auto *map = value ? std::get_if<EncodableMap>(value) : nullptr;
    const auto *status = map ? Field(*map, "status") : nullptr;
    const auto *headers_value = map ? Field(*map, "headers") : nullptr;
    const auto *body_value = map ? Field(*map, "body") : nullptr;
    const auto *headers =
        headers_value ? std::get_if<EncodableList>(headers_value) : nullptr;
    const auto *body =
        body_value ? std::get_if<std::vector<uint8_t>>(body_value) : nullptr;
    if (status && std::holds_alternative<int32_t>(*status) && headers && body &&
        std::get<int32_t>(*status) >= 200 &&
        std::get<int32_t>(*status) <= 599 && headers->size() <= 256 &&
        body->size() <= kMaxBody) {
      std::string block;
      bool valid = true;
      for (const auto &entry : *headers) {
        const auto *pair = std::get_if<EncodableList>(&entry);
        if (!pair || pair->size() != 2 ||
            !std::holds_alternative<std::string>((*pair)[0]) ||
            !std::holds_alternative<std::string>((*pair)[1])) {
          valid = false;
          break;
        }
        const auto &name = std::get<std::string>((*pair)[0]);
        const auto &text = std::get<std::string>((*pair)[1]);
        if (!Header(name, text)) {
          valid = false;
          break;
        }
        // 多条 Set-Cookie 原样交给浏览器；不拆分属性、不把 HttpOnly 凭据注入
        // JS。
        block += name + ": " + text + "\r\n";
        if (block.size() > 262144) {
          valid = false;
          break;
        }
      }
      const auto wide = Wide(block);
      if (valid && (block.empty() || !wide.empty()))
        Response(pending, std::get<int32_t>(*status), wide, *body);
    }
    // 每个请求在挂起前已有503响应；失败/超时/退出保留该响应，绝不默认联网。
    if (pending->deferral)
      pending->deferral->Complete();
  }

  void Request(ICoreWebView2WebResourceRequestedEventArgs *args) {
    auto pending = std::make_shared<Pending>();
    pending->args = args;
    pending->environment = environment_;
    pending->deadline = GetTickCount64() + 122000;
    const std::vector<uint8_t> failed{'U', 'n', 'a', 'v', 'a', 'i',
                                      'l', 'a', 'b', 'l', 'e'};
    if (!Response(pending, 503,
                  L"Content-Type: text/plain\r\nCache-Control: no-store\r\n",
                  failed)) {
      Fail();
      return;
    }
    if (pending_.size() >= 128 || FAILED(args->GetDeferral(&pending->deferral)))
      return;
    pending_.push_back(pending);
    ComPtr<ICoreWebView2WebResourceRequest> request;
    LPWSTR uri = nullptr;
    LPWSTR method = nullptr;
    if (FAILED(args->get_Request(&request)) || FAILED(request->get_Uri(&uri))) {
      Finish(pending, nullptr);
      return;
    }
    const std::wstring url = uri ? uri : L"";
    CoTaskMemFree(uri);
    if (!Allowed(url) || FAILED(request->get_Method(&method))) {
      Finish(pending, nullptr);
      return;
    }
    EncodableMap payload;
    payload[EncodableValue("generation")] = EncodableValue(caller_generation_);
    payload[EncodableValue("url")] = EncodableValue(Utf8(url.c_str()));
    payload[EncodableValue("method")] = EncodableValue(Utf8(method));
    CoTaskMemFree(method);
    ComPtr<IStream> stream;
    if (FAILED(request->get_Content(&stream))) {
      Finish(pending, nullptr);
      return;
    }
    std::vector<uint8_t> bytes;
    if (stream) {
      std::array<uint8_t, 16384> buffer{};
      ULONG count = 0;
      HRESULT read;
      do {
        read = stream->Read(buffer.data(), static_cast<ULONG>(buffer.size()),
                            &count);
        if (FAILED(read) || bytes.size() + count > kMaxBody) {
          Finish(pending, nullptr);
          return;
        }
        bytes.insert(bytes.end(), buffer.begin(), buffer.begin() + count);
      } while (count && read != S_FALSE);
    }
    payload[EncodableValue("body")] = EncodableValue(std::move(bytes));
    ComPtr<ICoreWebView2HttpRequestHeaders> headers;
    ComPtr<ICoreWebView2HttpHeadersCollectionIterator> iterator;
    EncodableList pairs;
    if (FAILED(request->get_Headers(&headers)) ||
        FAILED(headers->GetIterator(&iterator))) {
      Finish(pending, nullptr);
      return;
    }
    BOOL more = FALSE;
    if (FAILED(iterator->get_HasCurrentHeader(&more))) {
      Finish(pending, nullptr);
      return;
    }
    while (more) {
      LPWSTR name = nullptr;
      LPWSTR value = nullptr;
      if (FAILED(iterator->GetCurrentHeader(&name, &value))) {
        Finish(pending, nullptr);
        return;
      }
      auto key = Utf8(name);
      auto text = Utf8(value);
      CoTaskMemFree(name);
      CoTaskMemFree(value);
      if (!Header(key, text) || pairs.size() >= 256) {
        Finish(pending, nullptr);
        return;
      }
      if (Lower(key) != "cookie")
        pairs.emplace_back(
            EncodableList{EncodableValue(key), EncodableValue(text)});
      if (FAILED(iterator->MoveNext(&more))) {
        Finish(pending, nullptr);
        return;
      }
    }
    ComPtr<ICoreWebView2_2> cookies_view;
    ComPtr<ICoreWebView2CookieManager> cookies;
    if (FAILED(view_.As(&cookies_view)) ||
        FAILED(cookies_view->get_CookieManager(&cookies))) {
      Finish(pending, nullptr);
      return;
    }
    const auto generation = generation_;
    std::weak_ptr<State> weak = shared_from_this();
    const auto hr = cookies->GetCookies(
        url.c_str(),
        Callback<ICoreWebView2GetCookiesCompletedHandler>(
            [weak, generation, pending, payload = std::move(payload),
             pairs = std::move(pairs)](
                HRESULT error,
                ICoreWebView2CookieList *cookies) mutable -> HRESULT {
              auto state = weak.lock();
              if (!state || state->generation_ != generation || pending->done) {
                Finish(pending, nullptr);
                return S_OK;
              }
              UINT count = 0;
              if (FAILED(error) || !cookies ||
                  FAILED(cookies->get_Count(&count)) || count > 256) {
                Finish(pending, nullptr);
                return S_OK;
              }
              std::string cookie;
              for (UINT i = 0; i < count; ++i) {
                ComPtr<ICoreWebView2Cookie> item;
                LPWSTR name = nullptr;
                LPWSTR value = nullptr;
                if (FAILED(cookies->GetValueAtIndex(i, &item)) ||
                    FAILED(item->get_Name(&name)) ||
                    FAILED(item->get_Value(&value))) {
                  CoTaskMemFree(name);
                  CoTaskMemFree(value);
                  Finish(pending, nullptr);
                  return S_OK;
                }
                const auto key = Utf8(name);
                const auto text = Utf8(value);
                CoTaskMemFree(name);
                CoTaskMemFree(value);
                if (!Header(key, text) ||
                    key.find_first_of(";=") != std::string::npos ||
                    text.find(';') != std::string::npos ||
                    cookie.size() + key.size() + text.size() > 65536) {
                  Finish(pending, nullptr);
                  return S_OK;
                }
                if (!cookie.empty())
                  cookie += "; ";
                cookie += key + "=" + text;
              }
              if (!cookie.empty())
                pairs.emplace_back(EncodableList{EncodableValue("Cookie"),
                                                 EncodableValue(cookie)});
              payload[EncodableValue("headers")] =
                  EncodableValue(std::move(pairs));
              state->channel_->InvokeMethod(
                  "request",
                  std::make_unique<EncodableValue>(std::move(payload)),
                  std::make_unique<
                      flutter::MethodResultFunctions<EncodableValue>>(
                      [weak, generation,
                       pending](const EncodableValue *response) {
                        auto state = weak.lock();
                        Finish(pending,
                               state && state->generation_ == generation
                                   ? response
                                   : nullptr);
                      },
                      [pending](const std::string &, const std::string &,
                                const EncodableValue *) {
                        Finish(pending, nullptr);
                      },
                      [pending]() { Finish(pending, nullptr); }));
              return S_OK;
            })
            .Get());
    if (FAILED(hr))
      Finish(pending, nullptr);
  }

  HWND owner_ = nullptr;
  HWND window_ = nullptr;
  SOCKET socket_ = INVALID_SOCKET;
  bool winsock_ = false;
  uint64_t generation_ = 0;
  int64_t caller_generation_ = 0;
  ULONGLONG opening_deadline_ = 0;
  std::wstring origin_;
  std::unique_ptr<flutter::MethodChannel<EncodableValue>> channel_;
  std::unique_ptr<flutter::MethodResult<EncodableValue>> opening_;
  ComPtr<ICoreWebView2Environment> environment_;
  ComPtr<ICoreWebView2Controller> controller_;
  ComPtr<ICoreWebView2> view_;
  std::vector<std::shared_ptr<Pending>> pending_;
};

Web::Web(flutter::BinaryMessenger *messenger, HWND owner)
    : state_(std::make_shared<State>(messenger, owner)) {
  state_->Register();
}
Web::~Web() = default;
