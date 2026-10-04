#include <flutter/dart_project.h>
#include <flutter/flutter_view_controller.h>
#include <windows.h>
#include <iterator>
#include <string>
#include <propkey.h>
#include <propsys.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <wrl/client.h>

#include "resource.h"

#include "flutter_window.h"
#include "utils.h"


namespace {

// 安装身份只来自本产品编译目标；不能缺少角色时默认成为主机。
#if defined(TUYUFACTORY_CLIENT) && !defined(TUYUFACTORY_HOST)
constexpr wchar_t kApplicationId[] = L"TUYU.TuyuFactory.Client";
#elif defined(TUYUFACTORY_HOST) && !defined(TUYUFACTORY_CLIENT)
constexpr wchar_t kApplicationId[] = L"TUYU.TuyuFactory.Host";
#else
#error TuyuFactory requires exactly one compiled product role
#endif

std::wstring ApplicationExecutable() {
  std::wstring path(32768, L'\0');
  const DWORD length = ::GetModuleFileNameW(nullptr, path.data(),
                                          static_cast<DWORD>(path.size()));
  if (length == 0 || length >= path.size()) return {};
  path.resize(length);
  return path;
}

std::wstring ApplicationDisplayName() {
  const LANGID previous = ::GetThreadUILanguage();
  const LANGID language = PRIMARYLANGID(::GetUserDefaultUILanguage()) == LANG_CHINESE
      ? MAKELANGID(LANG_CHINESE, SUBLANG_CHINESE_SIMPLIFIED)
      : MAKELANGID(LANG_ENGLISH, SUBLANG_ENGLISH_US);
  ::SetThreadUILanguage(language);
  wchar_t title[128] = {};
  const int length = ::LoadStringW(::GetModuleHandleW(nullptr),
      IDS_TUYU_APPLICATION_NAME, title, static_cast<int>(std::size(title)));
  ::SetThreadUILanguage(previous);
  return length > 0 ? std::wstring(title, length) : std::wstring(L"TuyuFactory");
}

HRESULT SetShellString(IPropertyStore* properties, REFPROPERTYKEY key,
                       const std::wstring& text) {
  // SetValue copies the string; this PROPVARIANT does not own its memory.
  PROPVARIANT value = {};
  value.vt = VT_LPWSTR;
  value.pwszVal = const_cast<wchar_t*>(text.c_str());
  return properties->SetValue(key, value);
}

void LocalizeWindow(HWND window, const std::wstring& executable) {
  if (executable.empty()) return;
  Microsoft::WRL::ComPtr<IPropertyStore> properties;
  HRESULT result = ::SHGetPropertyStoreForWindow(window,
      IID_PPV_ARGS(properties.GetAddressOf()));
  if (FAILED(result)) return;
  result = SetShellString(properties.Get(), PKEY_AppUserModel_ID, kApplicationId);
  if (SUCCEEDED(result)) result = SetShellString(properties.Get(),
      PKEY_AppUserModel_RelaunchCommand, L"\"" + executable + L"\"");
  if (SUCCEEDED(result)) result = SetShellString(properties.Get(),
      PKEY_AppUserModel_RelaunchDisplayNameResource,
      L"@" + executable + L",-" + std::to_wstring(IDS_TUYU_APPLICATION_NAME));
  if (SUCCEEDED(result)) result = properties->Commit();
  if (FAILED(result)) ::OutputDebugStringW(L"TUYU: unable to set localized taskbar name.\n");
}

void LocalizeShortcutDirectory(const std::wstring& directory,
                              const std::wstring& executable, bool recursive) {
  WIN32_FIND_DATAW item = {};
  HANDLE search = ::FindFirstFileW((directory + L"\\*").c_str(), &item);
  if (search == INVALID_HANDLE_VALUE) return;
  do {
    const std::wstring name(item.cFileName);
    if (name == L"." || name == L".." ||
        (item.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) continue;
    const std::wstring path = directory + L"\\" + name;
    if ((item.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) {
      if (recursive) LocalizeShortcutDirectory(path, executable, true);
      continue;
    }
    if (name.size() < 4 || ::_wcsicmp(name.c_str() + name.size() - 4, L".lnk") != 0) continue;
    Microsoft::WRL::ComPtr<IShellLinkW> link;
    if (FAILED(::CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER,
                                 IID_PPV_ARGS(link.GetAddressOf())))) continue;
    Microsoft::WRL::ComPtr<IPersistFile> file;
    if (FAILED(link.As(&file)) || FAILED(file->Load(path.c_str(), STGM_READ))) continue;
    wchar_t target[32768] = {};
    if (FAILED(link->GetPath(target, static_cast<int>(std::size(target)), nullptr,
                            SLGP_RAWPATH))) continue;
    wchar_t expanded[32768] = {};
    const DWORD length = ::ExpandEnvironmentStringsW(target, expanded,
        static_cast<DWORD>(std::size(expanded)));
    if (length == 0 || length > std::size(expanded) ||
        ::_wcsicmp(expanded, executable.c_str()) != 0) continue;
    // Only update display metadata on links targeting this exact executable.
    const HRESULT result = ::SHSetLocalizedName(path.c_str(), executable.c_str(),
                                               IDS_TUYU_APPLICATION_NAME);
    if (SUCCEEDED(result)) ::SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATHW,
                                           path.c_str(), nullptr);
    else ::OutputDebugStringW(L"TUYU: unable to localize an application shortcut.\n");
  } while (::FindNextFileW(search, &item));
  ::FindClose(search);
}

void LocalizeExistingShortcuts(const std::wstring& executable) {
  if (executable.empty()) return;
  // ZIP delivery has no installer. Do not create shortcuts, request elevation,
  // rename physical links, follow directory junctions, or edit other apps.
  const KNOWNFOLDERID* folders[] = {
      &FOLDERID_Desktop, &FOLDERID_PublicDesktop,
      &FOLDERID_Programs, &FOLDERID_CommonPrograms};
  for (size_t index = 0; index < std::size(folders); ++index) {
    PWSTR folder = nullptr;
    if (SUCCEEDED(::SHGetKnownFolderPath(*folders[index], 0, nullptr, &folder))) {
      LocalizeShortcutDirectory(folder, executable, index >= 2);
    }
    ::CoTaskMemFree(folder);
  }
  PWSTR roaming = nullptr;
  if (SUCCEEDED(::SHGetKnownFolderPath(FOLDERID_RoamingAppData, 0, nullptr, &roaming))) {
    LocalizeShortcutDirectory(std::wstring(roaming) +
        L"\\Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar",
        executable, false);
  }
  ::CoTaskMemFree(roaming);
}

}  // namespace

int APIENTRY wWinMain(_In_ HINSTANCE instance, _In_opt_ HINSTANCE prev,
                      _In_ wchar_t *command_line, _In_ int show_command) {
  // Attach to console when present (e.g., 'flutter run') or create a
  // new console when running with a debugger.
  if (!::AttachConsole(ATTACH_PARENT_PROCESS) && ::IsDebuggerPresent()) {
    CreateAndAttachConsole();
  }

  // Initialize COM, so that it is available for use in the library and/or
  // plugins.
  ::CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  ::SetCurrentProcessExplicitAppUserModelID(kApplicationId);
  const std::wstring executable = ApplicationExecutable();
  const std::wstring display_name = ApplicationDisplayName();

  flutter::DartProject project(L"data");

  std::vector<std::string> command_line_arguments =
      GetCommandLineArguments();

  project.set_dart_entrypoint_arguments(std::move(command_line_arguments));

  FlutterWindow window(project);
  Win32Window::Point origin(10, 10);
  Win32Window::Size size(1280, 720);
  if (!window.Create(display_name.c_str(), origin, size)) {
    return EXIT_FAILURE;
  }
  window.SetQuitOnClose(true);
  LocalizeWindow(window.GetHandle(), executable);
  LocalizeExistingShortcuts(executable);

  ::MSG msg;
  while (::GetMessage(&msg, nullptr, 0, 0)) {
    ::TranslateMessage(&msg);
    ::DispatchMessage(&msg);
  }

  ::CoUninitialize();
  return EXIT_SUCCESS;
}
