#ifndef RUNNER_WEB_H_
#define RUNNER_WEB_H_

#include <flutter/binary_messenger.h>
#include <windows.h>

#include <memory>

// 分机拥有的上游原生窗口；不注册网页到 SDK 的桥接接口。
class Web {
public:
  Web(flutter::BinaryMessenger *messenger, HWND owner);
  ~Web();
  Web(const Web &) = delete;
  Web &operator=(const Web &) = delete;

private:
  class State;
  std::shared_ptr<State> state_;
};

#endif
