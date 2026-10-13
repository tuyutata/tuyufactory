# 途遇厂家端技术文档

> 当前塔塔鹿鹿：每仓 `.github/tatalulu.yml` 只登记仓库身份；控制台 `.github/tatalulu.mjs` 保存并推送后，以 GitHub `main` 回查结果收口。本文早期推送触发检查记录仅供历史追溯。

## 平台编译现场

本产品编译任务使用本仓 `target/build/<平台>` 独立临时目录，平台键为 `host-macos`、`host-windows`、`host-linux-arm`、`host-linux-amd`、`client-ios`、`client-android`、`client-macos`、`client-windows`。不同平台同时领取并执行；同平台已有活跃任务时立即拒绝再次领取。资源准备、工程副本、缓存和编译输出只写本平台现场；确认进程及后代退出、结果被调用方消费后，删除整个平台目录。`target/build` 仅是父目录，`target/test` 仍用于独立测试。独立执行和控制台调度调用同一本仓编译入口与清理接口。

厂家运行包和分机的完成方式由本仓对应目标确认。桌面App必须对应厂家自己的启动入口；跨平台源码编译不夹带正式运行包；移动端安装终态不能由普通编译结果代替。

厂家运行包由scripts/build.mjs的本仓Shell执行入口负责。Shell和Node取自本产品环境或当前Node进程，已撤销旧控制台专用环境变量回退；scripts/build.mjs shell runtime只交付自身公开参数。

## 工具与依赖的声明和供给职责（2026-10-08）

本产品完全独立管理全部流程所需的工具、依赖及其它资源需求。需求唯一依据为本仓源码、公开声明、锁文件及本产品拥有的准备配方，包括准确版本、平台、官方来源、摘要或固定提交、闭包、验真方式和失败条件；塔塔控制台按当前产品声明提供资源，不维护另一份产品需求或替产品决定版本、来源与流程步骤。

本产品必须能在没有塔塔控制台时完全独立执行全部已实现流程。独立执行时，本产品自行完成可信引导、资源获取、验真、保存、复用及任务工作视图准备，不依赖控制台源码、私有资料、安装位置或资源库。

通过塔塔控制台执行本产品流程时，本产品向控制台声明所需资源并使用其已准备好的供给。控制台先核对并复用已有的匹配工具与依赖；没有的由控制台按本产品声明下载、准备、验真并保存到控制台工具库或依赖库，再交付本产品复用。本产品负责核验交付与自身需求一致并使用资源，不因控制台缺件或供给失败改为自行下载，也不另建同一资源的永久副本；可写包管理器视图与流程过程数据仍归本产品当前任务工作目录。

两种执行方式使用本产品同一声明、锁和流程实现，仅资源供给职责随执行方式改变。该职责适用于本产品全部平台与已实现流程。独立模式下资源缺失由产品处理；控制台模式下资源缺失由控制台处理。显式离线缺件、交付失败、损坏、错误摘要、来源漂移或越界必须据实失败，不自动升级、覆盖可疑原件或切换执行方式。

以上为当前职责规范；本次只更新文档，不代表现有资源协议与运行代码已完成接入或通过真实流程验收。历史记录中的“可选供给”或“产品负责缺件获取”仅描述当时实现，不作为当前职责依据。

本仓正式资产只读验真入口为`scripts/publish.mjs verify --platform <平台> --tag <正式Tag> --directory <绝对资产目录>`：核对本地资产、清单、SHA256SUMS与GitHub Release资产摘要、Tag提交、成功Run及本平台最新版本，只输出验真回执，不上传或部署。自动化的正式版本解析由本仓`.github/workflows/`拥有，不调用本机Build。编译声明归`scripts/build.mjs describe`，本机运行包与验证由Build拥有；正式平台组包由本仓`.github/workflows/`独立拥有。根`scripts/`递归只保留Build与Publish两个文件；静态检查不能替代真实流程验收。

## 当前工作目录归属（第8步，2026-10-06）

本产品测试、编译的当前工作目录及收尾只按本文“本机固定执行目录”执行。独立入口与控制台调用共用本仓流程；永久工具与依赖原件保留在所属执行方式的源码外原件库，本轮可写资源视图、工程、下载半包和测试夹具只进入本产品当前现场。

第8、9步完成目录与路径实现、根文档迁移及测试源码维护，未运行测试、门禁、编译或安装。本文唯一原件位于<本仓根>/TuyuFactory.md；产品接口及流程直接以本仓实际代码和声明为准，业务字典库与其检查已撤销，不另建登记副本。历史验收事实不表示本轮改造已经通过验收，统一测试在第10步进行。根技术文档由本仓门禁按原文、JSON解码值及既有补丁快照扫描机密，仅报告路径；文档迁出不减少资料安全检查。

## 正式软件版本

主机和分机分别拥有自己的平台 Release Tag 与版本序列；共同使用的 `app/pubspec.yaml`
只提供首版 `1.0.0+1` 种子。没有已发布正式 Release 的身份首次成功发布
为 `v1.0.0`。失败不占号，后续版本只按相同产品和平台的成功正式 Release 递增；
安装包显示其自身版本，不读取另一产品或平台的版本。

## 聊天功能的唯一产品归属

**聊天客户端的逻辑功能只能在 TataChatSDK 中实现；聊天服务端的逻辑功能只能在 CitizenServe.tatachat 中实现。公民、途遇及其他产品只依赖使用。**

TuyuFactory 涉及聊天时只作为依赖使用方；本条不代表尚未接入聊天的产品已经具备聊天能力。

- 消息、会话、群组、加密、协议、传输、同步、重试、聊天存储、附件、通话及聊天界面行为，按客户端与服务端职责分别归 TataChatSDK 和 CitizenServe.tatachat；新增功能、缺陷修复和平台差异也必须在所属产品内完成。
- 消费产品只提供产品入口、身份与业务权益结果、服务地址及授权、主题和公开接口要求的平台配置；只通过公开接口接入，禁止复制、重写、包装成另一套聊天内核或维护产品专属聊天实现。CitizenServe、TuyuServe 的产品身份与权益授权不包含聊天数据面的实现职责。
- 本机开发直接依赖仓库路径；公民、途遇等产品的正式版本依赖塔塔聊天正式 Release；第三方市场分发使用公开市场版本。依赖使用不以公开市场发布为前置条件，也不改变实现归属。

主机与分机受控缓存分别固定为 `tuyufactory/target/<host-platform|client-platform>/<build|ci|release|publish>/`。共用源码不等于共用生成目录：Flutter视图、SDK中间物、Gradle、Cargo、Xcode、临时文件、日志和候选必须留在准确产品端流程目录。

当前依赖边界：TuyuFactory 的锁文件和产品脚本自行决定依赖、版本、来源及工具；控制台不做产品依赖或工具门禁。唯一 `rely/` 只保存产品主动取得的离线原件。

本机 Build 由 Worker 创建任务、清空准确产品平台缓存后直接启动产品入口；后续工具、依赖和编译条件均归产品流程。Android产品函数把本轮Flutter配置选出的SDK和调用方JDK传给同一次Gradle调用，本机未提供JDK时使用Android Studio随包JBR，不增加Worker前置检查。移动端成功后安装，macOS 成功软件进入 `<产品根>/target/<平台>/`，其余平台只记录编译结果。

TuyuFactory 是多平台产品，主机与分机各平台分别使用`<产品根>/target/<平台>/<流程>/`。依赖展开、Flutter/Pub、Gradle、Cargo、CocoaPods、日志和临时状态均不得跨平台或跨产品共用；本机Flutter从准确平台缓存中的只读符号链接工程视图读取产品源码，所有生成状态留在该缓存。Build不执行`flutter analyze`、`flutter test`或`cargo test`，这些检查不能插在编译前阻塞Build。

Android SDK、NDK 与其它工具均由 TuyuFactory 产品流程自行选择和校验；Worker 不读取、不注入、不验真，也不以工具状态阻塞 Build。

本文是途遇厂家端（TuyuFactory）唯一技术事实文档。

## 受控工具接入边界

CMake 的版本、来源和执行入口由 TuyuFactory 产品 Action 决定。产品可读取塔塔工具登记，也可使用自己的正常工具入口；Worker 不准备、不展开、不验真 CMake。

Node 与 Yarn 由产品 Action 自行选择并用于实际打包；任务缓存只保存本次执行状态。塔塔工具库可提供可选来源，但控制台不以其登记内容阻塞任何平台任务。

受控移动流程合同测试按产品实际声明验证com.tuyufactory.client和Client入口，不再认定厂家尚未配置身份；签名材料和设备安装继续单独验收，身份登记通过不能代替它们。

厂家分机Android工程位于`<本仓根>/app/android/`。当前产品配置统一使用Gradle9.1.0、AGP9.0.1与KGP2.2.20，并保持内置Kotlin和新DSL；根buildscript在同一依赖图声明AGP与KGP，settings不再另行解析AGP而暴露其自带KGP2.2.10。应用脚本显式导入JDK类型，Kotlin与资源源集通过AGP9公开`directories`集合登记，不再使用已弃用的`setSrcDirs`。AGP、Kotlin、Gradle与Java仍由产品工程和产品流程自行决定；控制台不要求受控Gradle版本或路径，不把工具检查作为Build门禁。com.tuyufactory.client安装身份和main_client.dart入口保持不变；真实产品编译和设备安装必须分别验收。

### 一个工程、两个独立安装产品

- 一个 Flutter 工程，编译期选择 `host` 或 `client`；禁止安装后运行时切换。
- 分机的工程目标、目录与应用身份统一使用 `client`，不用 `employee` 或 `mobile` 代替安装产品身份。
- 当前入口为 `app/lib/main_host.dart` 和 `app/lib/main_client.dart`，构建必须显式选择入口；没有默认 `main.dart` 或运行时角色选择。
- 当前职责目录为 `app/lib/host/`、`app/lib/client/` 和 `app/lib/shared/`。`shared` 仅位于本产品工程内，不建立仓库级共享目录，不建立产品侧 CitizenSDK 封装。
- Host/Client 已分别持有 CitizenSDK 并消费同一公开生命周期与钱包 API。分机已实现主机发现、首次信任保存、固定 TLS 连接和四端原生 ERPNext 容器接线；不导入主机 FFI 或管理员界面，八包真实验收尚未完成。
- 公开平台固定使用表中的名称；架构和安装产品类型不混入平台字段。Flutter 官方 `ios/`、`android/`、`macos/`、`linux/`、`windows/` 目录保持官方名称。

| 安装产品 | 平台 | 架构基线 | 厂家业务运行时 | CitizenSDK |
| --- | --- | --- | --- | --- |
| host | macOS | ARM64 | 包含 | 同一完整 SDK |
| host | Windows | x86-64 | 包含 | 同一完整 SDK |
| host | LinuxARM | ARM64 | 包含 | 同一完整 SDK |
| host | LinuxAMD | AMD64 | 包含 | 同一完整 SDK |
| client | iOS | 设备 ARM64；一包适配 iPhone/iPad | 不包含 | 同一完整 SDK |
| client | Android | ARM64；一包适配手机/平板 | 不包含 | 同一完整 SDK |
| client | macOS | ARM64 | 不包含 | 同一完整 SDK |
| client | Windows | x86-64 | 不包含 | 同一完整 SDK |

最终为八个安装包，不增加 Linux Client。macOS/Windows 的 Host 和 Client 应使用不同安装身份、数据目录与可执行文件名，避免覆盖安装；具体标识须先核对现有身份，不擅自破坏升级关系。

### CitizenSDK：两端完整、同源、只集成

安装包验真只消费 `packages/citizen_sdk/chain/` 下的 manifest、chainspec 与 light_sync_state 三个JSON，按各平台Flutter标准容器定位；缺少任一文件即失败，旧资源目录不能代替该位置。

- Host 与 Client 都直接集成并打开相同的完整 `CitizenSdk`，包含轻节点、钱包、会话和签名能力。
- 两者是独立设备上的独立 SDK 实例，本机钱包、轻节点状态和会话各自归属当前设备，不复制或共享秘密数据。
- 正式发布使用 CitizenSDK Git 依赖并锁定明确提交；Host/Client 使用相同提交，不能残留本机 path override。Git 地址和提交须从权威 SDK 登记核实，不能照抄过时示例。
- 只调用 SDK 公开接口，不修改、裁剪、替换或重复实现 SDK 内部功能；不增加产品侧 SDK wrapper，不提供只读或限制版替身。
- 钱包秘密输入、生成、导入和安全确认由 CitizenSDK 自己负责，厂家端不读取助记词或私钥，不向 ERPNext Web 容器暴露 SDK 秘密或任意签名能力。
- CitizenSDK 自身必要的轻节点数据库、钱包安全存储和原生库必须保留。Client 不携带“厂家业务数据库”不等于禁止 SDK 自身持久化，不能借载荷隔离裁剪 SDK。
- SDK 网络不可用与本地 ERP 服务可用性分别报告；不能因链网络暂不可用而关闭本地厂家业务。SDK 初始化能力不足不得使用假实现冒充成功。
- SDK 需要改进时，只提出问题证据、需要的公开接口/平台能力、复现条件和验收标准，由 CitizenSDK 线程负责。这里不修改 SDK，也不以厂家端复制实现绕过。

### CitizenSDK 当前公开消费边界

两端各自 `open()`，先订阅 `events` 再 `start()`，读取公开能力和钱包资料，正常退出等待 `stop()` 后 `close()`。Host 的 SDK 与 PostgreSQL/ERPNext 状态独立；钱包直接使用 SDK 安全 UI，不向 ERP 页面提供秘密或签名桥。

Host macOS 身份为 `com.tuyufactory`，Client 为 `com.tuyufactory.client`；Windows 由编译期配置固定两者身份。用户确认 iOS/Android 同用 `com.tuyufactory.client`，对应工程已建立。剩余平台 SDK 原生投影及正式包载荷仍须完成；源码调用、Pod/CMake 配置不代表原生运行和八包验收。本次不修改 SDK。

### 上游功能原样保留

- Frappe/ERPNext 是业务、员工账户、角色、权限、表单、工作流和业务数据的权威。
- 不修改 `imported/frappe/`、`imported/erpnext/` 的功能，不在本任务升级来源清单锁定的 subtree 提交。
- 不重写商品、库存、报价、订单、BOM、生产、质检、发货或售后功能。
- 不创建第二套 Flutter 业务页面、业务 Repository、业务数据库或业务状态机。
- 不创建自有 `tuyufactory_bridge` 业务系统或自定义员工业务 API。
- Host 启动并承载上游完整系统；Client 通过应用内 Web 容器加载 Host 上的同一套 ERPNext/Frappe 原生界面，而不是启动外部浏览器代替 Client 应用。
- 四平台 Client 功能来自同一上游站点和资源。Flutter 只处理 SDK 生命周期、钱包入口、主机连接、安全状态、应用导航以及上传/下载/相机等必要平台集成。
- 上游没有适配好的能力如构成阻塞，先报告，不擅自修改上游或重写替代业务。

### 账户、网络和数据边界

- 途遇系统管理员继续复用现有 `tuyuserve/account`，只消费依赖，不修改该模块或另建账户实现。
- CitizenSDK 设备身份、途遇本机系统管理员和 ERPNext 员工权限分属不同作用域，不互相覆盖。
- ERPNext 员工继续使用原生登录、Cookie、CSRF、会话、角色和权限。SDK 身份不能自动授予 ERPNext 或系统管理员权限。
- 厂家 PostgreSQL 和 Frappe/ERPNext 业务进程只存在于 Host。Client 不能直连 PostgreSQL，不能导入厂家主机 FFI、启动厂家业务运行时或读取主机秘密。
- 局域网入口只承担安全传输和现有上游 HTTP/实时连接/资源/文件的转发，不重新定义业务协议。
- 不擅自增加 `/v1` 路由、版本后缀或协议版本；既有途遇与上游协议原样使用，不机械删除上游必须保留的既有字段。
- TLS 身份校验不能降级为接受任意证书。首次主机信任方式须与既有协议和用户决定一致，不能编造“已有验签接口”。
- 固定唯一厂家站点，不能由任意 Host 头选择其他站点；局域网不得暴露 PostgreSQL、主机秘密和本机系统管理接口。
- 员工连接、管理员本地登录和 ERPNext 操作不经过 Cloudflare、TuyuServe 或公网隧道。
- 商品公开和隧道能力是 Host 的独立职责，不得借本任务改写 TuyuServe 或其他产品。
- Host 退出/后台运行策略先核查并明确呈报。不能未经该步确认自动新增系统服务、自启动权限或改变现有停机语义。

## 主机 LAN 安全入口（第4步已实现部分）

- Rust Gateway持有独立Python进程及stdin生存管道；每次启动默认关闭。启停先调用唯一账户模块的require_session及list，核对会话有效期与数据库active状态；初始化状态不等于已认证。
- 厂家增加管理员挑战、签名响应登录和网关snapshot/enable/disable FFI。初始化消费现有LoginResponse。页面提供挑战文本及响应提交，提交后清空响应；完整扫码设备体验未在本步验收。签名、会话及策略仍只有tuyuserve/account一份实现。
- employee_gateway.py在管理员开启后监听0.0.0.0:59460，唯一目标为https://127.0.0.1:59443，固定站点factory.localhost并验证上游证书及主机名。外部Host和转发头不能选择内部服务；数据库、主机FFI和秘密文件无公开路由。
- 首次启用生成并保存证书对于本机数据根tls，直接包含证书与私钥两个文件，主机名固定为tuyufactory-<instance_id>.local；证书明确声明ExtendedKeyUsage.SERVER_AUTH，满足Apple严格服务器用途校验。重复启用复用，证书或私钥单项缺失时拒绝自动换身份；既有证书不会被自动重签或替换，不符合验证条件时连接失败。最低TLS1.2、握手超时10秒、最多32并发，请求正文上限64MiB并流式转发。
- 保持原生路径、Cookie、CSRF、资源和文件操作；不把客户端Origin改为可信来源，不重写上游业务响应。内部绝对重定向映射到当前LAN HTTPS origin，外部或明文重定向拒绝；上游HTTP错误原样返回。
- /tuyu/status仅返回最小公开元数据和上游TLS可达状态，不代表员工登录或业务健康验收。_tuyufactory._tcp.local广播实例ID、端口与公开证书指纹。用户本轮确认沿用商家既有TUYU/1标识，没有新建版本化业务API。IPv4 LAN不可用或mDNS启动失败时明确失败。
- 管理页定时回读进程状态、地址与指纹，读取失败撤下旧页面授权。主机正常停止先关LAN再停ERP/PostgreSQL；意外退出使生存管道关闭，网关停止。没有新增常驻或自启动策略。
- Client首次只接受一个主机，用户核对主机屏幕的实例与完整证书指纹后验证TLS，再保存地址、固定TLS hostname、实例ID与证书指纹；后续直连，离线和证书变化不能换主机。mDNS及同站点返回指纹本身不能证明首次身份。固定IP连接同时验证固定TLS hostname和证书；四平台容器使用下节的原生传输接入，不把状态验证自动视为网页安全。
- 上游实时入口尚未接通，realtime_available=false；Socket.IO轮询和Upgrade明确返回503。第4步完整完成前须取得上游支持的实时合同，本步没有修改ERPNext/Frappe。

### 第5步实现：四平台原生容器与安全连接

再次核对商家实际源码后，保留其一个工程/两产品、公开 SDK 消费及固定主机连接结构；其 `EmployeeLoginPage` 是 Flutter 业务适配器表单，不是厂家可搬用的 ERPNext 原生容器。未引入候选 `flutter_inappwebview`：证书错误事件本身不能覆盖所有连接的 pin 校验。现使用 iOS/macOS WKWebView、Android WebView 和 Windows WebView2 的产品原生接入，直接加载 Host 的 `/login`，不改上游业务或员工账户。

用户已确认移动身份，厂家Client实际声明与iOS Bundle ID、Android applicationId/namespace 统一为 `com.tuyufactory.client`。iOS16起、Android24起，ARM64，分别适配 iPhone/iPad 和 Android 手机/平板；两者强制 `main_client.dart`，不携带厂家主机系统。签名身份、描述文件、实际安装和设备权限保留真实验收，不由固定字符串冒充已签名。

- `FactoryWeb` 在固定主机验证后打开原生容器；私有 MethodChannel 只传公开身份、origin、正整数 generation，Windows 额外传受限 HTTP 请求/响应。打开单飞，关闭、断线、退出均回收传输；旧窗口结果只能关闭旧代次，不能提交旧 POST 或影响新页面。没有网页 JavaScript→SDK 桥，不暴露钱包、助记词或任意签名。
- Apple/Android 使用临时 `127.0.0.1` 高位端口的 TCP 密文转发，唯一远端是刚验证的保存地址与59460。该通道不终止 TLS、不解析 HTTP、不持有证书私钥、不开放代理协议。浏览器面对的仍是 Host 原证书；验证保存的固定 hostname、当前叶证书摘要、有效期及服务器用途。不是把 localhost 名称或任意自签名证书视为可信。
- Apple 两端共用 `app/macos/Runner/Web.swift`。WKWebView 与 WKDownload 使用同一 `SecPolicyCreateSSL(true, savedHostname)`/叶证书锚/SecTrust 实际验证；加载前的 WKContentRuleList 默认拒绝非当前 HTTPS origin 的资源。导航、弹窗、媒体授权和文件面板均检查来源与当前窗口。Cookie/CSRF 原样交给原生 WebKit 和上游，不读取凭据到 Flutter 登录表单。
- Android 仅对 `127.0.0.1` 配置空信任锚，避免系统公信证书绕开当前握手 pin 检查；其它网络域的系统策略不变，不改 SDK。空锚策略有[AOSP CTS 原始用例](https://android.googlesource.com/platform/cts/+/bb20ec7/tests/tests/networksecurityconfig/networksecurityconfig-nested-domains/res/xml/network_security_config.xml)依据。仅在当前 SSL challenge 中取真实 DER，完成摘要、自签名、有效期、SAN、服务器 EKU 与 critical extension 验证后才接受该证书；创建/关闭清除 SSL 决策缓存，过期失败关闭。不是无条件忽略 SSL 错误，也不是另一次探测后放行任意证书。
- Android 的同源 WebView 资源/导航限制与主机 CSP 联合生效，拒绝明文、本机文件和非主机网络。文件选择使用系统文档选择器，相机明确请求权限且使用受限 FileProvider；下载用同 pin/hostname 的 TLS TrustManager，最多5次同源跳转，64MiB以内完成临时下载后由用户选择保存。取消/关闭回收照片、URI 权限、网络及挂起回调。
- Windows Client 独占原生 WebView2 窗口。全部资源类别及请求来源先设503后挂起，Dart 用固定 IP、固定 hostname 与证书传输 HTTP；保留二进制 POST、原生 CookieManager 的 Cookie 和重复 Set-Cookie，不重放业务请求。未拦截网络指向占有但不监听的回环 HTTPS 代理端口，禁止代理绕过及非代理 WebRTC UDP；拒绝站外导航。初始化30秒、业务请求122秒超时。实际 WebView2 对注入 Set-Cookie 的行为与漏拦网络负向验收必须在 Windows 验证，源码测试不作替代。
- Windows CMake仅为Client编入容器，消费本次已验真的TUYUFACTORY_WEBVIEW2_PACKAGE及摘要；本产品native/dependencies.json唯一声明SDK 1.0.3537.50和Fixed Runtime 152.0.4191.62的官方HTTPS来源与SHA256，与既有登记一致，不升级。产品自己的dependencies.mjs只在准确Windows x64源码外任务根准备；CMake只回验归档字节并解包到当前构建根，不联网安装。
- 主机网关只额外允许规范的 `127.0.0.1:<高位端口>` 传输 origin；站点仍固定 `factory.localhost`，不信任外部转发头，不改 Cookie/CSRF。CSP 禁止非当前来源的网络、frame 外跳及 worker；connect-src 只允许当前 HTTPS origin，不开放未实现的 WSS。策略不重写上游 HTML 或员工功能。
- Q6实时链路仍受上游 PostgreSQL NOTIFY/Redis 订阅不一致阻塞，Socket.IO/Upgrade明确503；不由厂家重写实时系统。它不等于员工登录已验证失败，也不能在只有组件测试时宣称真实 ERPNext 登录已经成功。

- `client/mdns_discovery.dart`读取厂家主机的完整mDNS公告，按同一实例关联PTR、SRV、TXT、A记录；只接受厂家产品、既有协议、固定端口和LAN IPv4地址。对报文长度、记录数、压缩指针、TXT重复项和候选数量设界限；忽略畸形、查询和告别包，同实例身份或地址冲突拒绝继续。首次零台或多台都不自动选主机。
- `client/host_connection.dart`串行执行发现、等待用户核对、验证、保存、固定重连。用户取消不连接或保存；保存成功后不再发现。存储错误与连接错误均失败关闭，不将文件损坏解释成首次安装，也不从主机状态响应更新保存地址。前台每15秒复核，后台停止定时复核，恢复时验证固定主机；失败后由用户重试。退出取消发现/连接与定时器，晚到结果不写信任资料或通知已销毁页面。
- `client/host_store.dart`使用path_provider取得当前Client应用支持目录，直接保存公开`host.json`，不增加单文件包装目录。保存采用排他临时文件、刷新后改名；已有正式文件或临时占用拒绝覆盖。读取拒绝符号链接、超大或格式错误文件。文件不包含员工登录凭据、管理员会话或SDK秘密；不同安装身份的数据隔离仍须在第7步真实验收。
- `client/pinned_https_client.dart`先取得服务器公开证书并拒绝未验证握手，不发送应用数据；比对用户已核对或本机已保存的指纹后，建立仅信任该证书的SecurityContext。固定IP的TCP连接必须先用固定hostname完成TLS，再比对实际证书摘要，随后才交给HttpClient读取`/tuyu/status`。不设置放行证书错误的回调，不使用代理，不跟随重定向，响应最多8192字节并核对产品、实例、端口、主机名、指纹与当前实时合同。状态通过不是员工登录或完整ERP健康证明。
- 证书导入遵循Dart平台API：iOS单张DER，其余平台PEM；自定义connectionFactory自行完成TLS，不能只返回普通Socket。参考[Dart SecureSocket.secure](https://api.dart.dev/dart-io/SecureSocket/secure.html)及[SecurityContext证书导入](https://api.dart.dev/dart-io/SecurityContext/setTrustedCertificates.html)。macOS实际组件验证使用厂家生产证书生成器，不使用接受所有证书的测试捷径。
- `connection_page.dart`分别显示SDK与LAN状态、地址、实例、公开指纹、首次确认/取消和重试；存储、发现、无主机、多主机、安全验证失败有中英文提示，窄屏可滚动。页面不提供ERP替代业务或本机管理员能力。
- 本机读取同源CitizenSDK不变；摘要使用现有crypto 3.0.7，存储使用path_provider 2.1.6及其锁定依赖。不修改SDK、商家或上游。Android发现已接multicast lock原生通道；iOS已登记本地网络/Bonjour及multicast entitlement，真实签名配置必须允许该权限，否则明确失败。
- 本轮完成四平台容器功能接线与组件验证，准确数字在任务卡；没有执行产品构建或四端真实员工登录。Apple/Android原生组件类型和证书运行测试、Dart/Python真实TLS及Windows源码合同是不同等级证据；八包安装、实际Cookie/CSRF、文件/相机、权限及跨设备运行仍在第7步统一执行，不将组件通过写成全平台已验收。

- `app/lib/shared/product.dart` 以只读 `targets` 表登记 Host 四端与 Client 四端；`supportedPlatforms` 从该表去重生成只读平台全集，不维护第二份平台清单。此表是厂家 Flutter 内的安装目标元数据，不是发布字段、受控路由或运行时角色选择器。
- 账户产品标识 `tuyufactory`、现有主机安装身份 `com.tuyufactory` 与用户数据目录保持不变；主机启动通过显式 `main_host.dart` 保留原装配。目标声明不代表 Client 业务、SDK、LinuxAMD 或八包运行验收已经完成。
- `SecureEndpoint` 只解析无用户信息的 HTTPS 地址，不发起连接，不验证证书或主机身份；成功解析不能代替连接层的证书和主机名校验。
- 主机页面测试直接使用现有 `FactoryRuntimeModel` 与页面，通过 `FactoryNativeRuntime` 注入受控结果；不直接指定页面状态，不加载厂家原生动态库、数据库或 CitizenSDK。此测试不替代安装包、真实数据库、员工登录或 TLS 运行验收。
- 启动状态判定：`initialize()` 应用原生快照后，仅在 `snapshot.ready` 为真时查询管理员并进入 `ready` 或 `needsAdministrator`。未就绪时保留组件快照的失败阶段与错误，统一通知页面展示重试入口；既有管理员或 HTTPS 入口都不能证明主机已就绪。没有组件错误文字时使用现有本地化失败提示，不显示管理员初始化表单。
- 失败恢复回归：组合覆盖已有/没有管理员、有/无组件错误，核对失败时不查询或初始化管理员；通过页面重试重新启动，原生已就绪后才按真实返回的管理员状态进入对应页面。测试不会重写原生账户行为、数据库路径、停机策略或上游员工功能；实际运行结果统一记录在既有任务卡。
- 分机回归直接调用生产入口并检查中英文及窄屏/宽屏页面；源码合同递归跟踪本产品 import/export/part 的全部条件分支，对越界、缺失文件和未登记系统依赖失败关闭。它检查产品源码边界，不宣称审计 Flutter、SDK 或其他上游依赖内部实现，也不替代原生包载荷检查。

### 八目标产品侧打包隔离

五个平台工程必须消费显式入口与准确架构。Windows缺角色不再默认主机，Linux只接受显式host且Flutter官方目标必须匹配真实CPU；macOS取消默认Host身份，Assemble与Embed分别验证入口、TUYU_FACTORY_*、最终Bundle与可执行身份；iOS不再覆盖调用者的错误入口，手机/平板只接受client ARM64。Android缺少当前厂家任务或同源SDK投影时直接拒绝。名称、图标和初始化沿用既有实现。

`scripts/build.mjs verify --package ROOT ROLE PLATFORM payload|signed`对已展开的桌面/Apple安装目录执行真实文件、原生身份、SDK组件与架构检查；CI明确使用payload检查，不向CI索取发布密钥，Apple正式资产增加系统验签。本机APK由`scripts/build.mjs module client`验真，自动化APK由所属`.github/workflows/release-client-android.mjs`验真；两者均核对系统签名、清单和ZIP载荷，并原样复制。Mach-O同时检查ARM64和macOS/iOS目标，拒绝模拟器与fat混合包；PE要求x64/PE32+，ELF要求准确机器码。链接必须留在当前包内，Apple framework合法内部链接可遍历，循环、断链、特殊文件及大小写冲突拒绝。

主机需要完整厂家原生库、运行件、schema与上游资源；client拒绝厂家business、PostgreSQL、ERPNext/Frappe和厂家主机接口，包括改名后仍含主机导出标识的原生库。两者都保留完整SDK的Core/Host/平台插件及链资产，SDK自身数据库不列为禁止项。文件与头部检查不能单独证明SDK原生二进制的源码提交；实际同版投影仍必须由SDK公开交付与原生构建接入提供。

`scripts/build.mjs module client PLATFORM SOURCE OUTPUT APPLICATION payload|signed`只消费当前任务的已编译client输入，不调用Flutter、SDK构建、签名或发布。SDK各环境解析都必须对应声明与锁定Git提交及本次Pub视图，无本机覆盖或源码差异。输入先验、目标排他占有、复制后再次验真，失败只清理本次目标，不覆盖成功包。`--artifact PLATFORM SOURCE APPLICATION payload|signed`验证最终APK、AAB、IPA和桌面ZIP；AAB回读官方protobuf清单身份，Android正式ZIP逐个验证APK/AAB，Apple归档解包后再次检查实际App与签名，不能只凭资产名放行。

Windows主EXE使用既有AppUserModelID `TUYU.TuyuFactory.Host/Client`，SDK插件使用`com.tuyufactory`/`com.tuyufactory.client`，两种身份分别核验，不能混为一个字段。主机业务数据为`%LOCALAPPDATA%\TuyuFactory`，client连接资料通过既有path_provider位于`%APPDATA%\com\TuyuFactory`；WebView资料为`%LOCALAPPDATA%\com.tuyufactory.client\web`，SDK数据仍归各自应用身份。本次不改变既有业务数据路径。

Windows client只加载EXE旁data/webview2中的Fixed Runtime，缺失或路径经过联接即失败，不寻找系统Edge或接受环境覆盖。本产品prepareWebView2以固定摘要、CAB边界、全部成员、微软原生信任链、文件版本和PE x64架构验真；prepareWebView2SDK取得同一固定NuGet SDK归档。只清理本轮拥有且身份未变的候选。六个桌面Release直接导入同角色同平台CI实际入口，不使用不存在的ci.mjs；不改变发布签名、CI来源或归档校验。

Windows 10的非MSIX分发不能依赖构建机ACL随ZIP保留；启动前对固定Runtime逐对象合并两个AppContainer组的最小读取/执行权限，保留既有授权，拒绝目录联接、多硬链接和权限回读失败，不修改全局注册表或其它目录。Windows 11不额外更改权限。这是运行消费者代码合同，真实Windows启动仍需后续安装验收。

SDK原生依赖直接复用受控既有`prepareCitizenSdkDependencies`，不需要SDK增加接口。厂家先验证实际源码、正式Git提交及版本，按真实任务准备SDK自身Cargo/Pub锁闭包，再在本次独占目录生成静态库、头文件及`native-dependencies.json`，由SDK公开校验器重新验真后传入`CITIZENSDK_DEPENDENCY_RECEIPT`。拒绝外部旧收据或混用前缀。原件引用按厂家真实仓库、产品、平台、流程登记；本机build仅映射SDK收据模式为ci，不改变缓存归属。

LinuxARM/LinuxAMD必须使用真实对应架构，复用受控既有环境准备器提供的GLIBC 2.31用户态；静态依赖与SDK均在同一断网、非特权、只读根容器中构建，公开Flutter消费者保留原权限及显示环境检查。源码、Flutter和Pub输入只读挂载，不传入令牌或用户主目录。容器、AppArmor策略、镜像依次按实际ID及本次标签回收；清理失败通过退出码75通知外层保留工作目录，禁止误删仍在使用的策略和输入。

Windows产品作业自行使用其MSVC、Cargo和Bash环境。移动与桌面产品自行决定Rust、Flutter、Android NDK、CMake和Gradle需求；塔塔控制台不准备、不验真、不比较这些工具，也不因缺少受控对象拒绝产品入口。SDK源代码、上游业务功能和正式Git锁均由产品维护；实际编译、签名、安装及跨设备验收由各自产品流程产生结果。

### 源码与依赖

- Host 与 Client 两个安装目标均直接调用 SDK 公开入口，固定依赖相同。
- Client 源码依赖图不引用厂家 Host FFI、管理员页面或数据库生命周期。
- 不出现运行时主机/分机开关，不以隐藏页面代替编译隔离。
- 不修改 SDK 或上游业务功能，不引入自定义业务协议和业务替代实现。
- 正式依赖检查拒绝厂家本机 SDK path override；本机开发证据必须表明直接使用 SDK 源码而非拷贝。

### 安装包

- 八个产品/平台组合均有独立真实验收记录；安装包类型、主机/Client身份和CPU架构准确。
- Client 载荷检查针对厂家业务运行时、厂家主机原生库、业务 schema 与秘密，而不是对整个 SDK 依赖做无差别删减。
- macOS/Windows Host 与 Client 安装、数据、更新身份不能互相覆盖。
- 不用声明文件、平台占位或“编译了 Flutter 壳”冒充完整包成功。

### 网络、上游和用户设备

- 不信任伪造主机、被替换证书或非授权来源；不把 SDK 钱包秘密注入 Web 内容。
- ERPNext原生员工登录、会话过期、退出、权限拒绝、CSRF和原生工作流结果保持上游行为。
- iOS包含iPhone/iPad验收；Android包含手机/平板验收；macOS/Windows使用相同上游功能。
- 文件、相机、下载与跳转受应用来源和权限约束，不能通过 Web 容器访问本机任意文件或签名任意消息。
- 断线明确报错，不能伪造成功或私自增加离线业务写队列。
- 明确主机关闭、服务停止及重启后的 Client 行为；不把公网或链同步故障混同为本地 ERP 故障。

#### 1. 产品定义

- 中文名称：途遇厂家端
- 英文名称：`TuyuFactory`
- 仓库目录：`tuyufactory/`
- 部署者：生产厂家
- 服务对象：安装 TuyuBooking 的商家
- 部署方式：厂家自己的电脑或服务器
- 正式平台：`iOS`、`Android`、`macOS`、`LinuxARM`、`LinuxAMD`、`Windows`
- 控制台产品：主机端 `tuyufactory-host` 使用 `macOS`、`Windows`、`LinuxARM`、`LinuxAMD`；分机端 `tuyufactory-client` 使用 `iOS`、`Android`、`macOS`、`Windows`。主机端与分机端的 macOS、Windows 是不同产品产物，不共享流程或记录。

TuyuFactory 与 TuyuBooking 是对等、独立部署的业务系统。厂家商品通过公开发现机制出现在 TuyuBooking 的“途遇商城”中，实时价格、库存和销售订单仍由厂家自己的 TuyuFactory 负责。

#### 2. 第一阶段业务范围

- 厂家实例、管理员和本地员工。
- 商品、分类、规格、图片和条码。
- 批发价格、客户价格、阶梯价格和最小起订量。
- 仓库、实时库存、预留和可售库存。
- 客户、报价、销售订单和订单确认。
- 拣货、发货、物流、退货和售后。
- 制造、物料、BOM 和工单能力按厂家需要启用。
- 向 TuyuServe 发布厂家和商品签名摘要。
- 向 TuyuBooking 提供实时 B2B API。

#### 3. 已确认开放源码基础

初期业务基础已确认采用 ERPNext/Frappe。ERPNext 提供商品、仓库、库存、制造、客户、报价、销售订单和交付能力，Frappe 提供应用框架与标准 API；途遇系列已有固定Fork 和 PostgreSQL 适配经验。

TuyuFactory 拥有独立源码锁、运行时、数据库、安装包和发布生命周期，不直接运行 `tuyubooking/upstream/`。当前固定源码为：

- Frappe Framework：`tuyutata/frappe` 的 `codex/tuyubooking-postgresql-schema` 分支，提交 `8bc4bfb7d96a0b9a4d5a20e1ded93b40efee53ec`，MIT。该提交是原锁定提交的直接后继，修复 PostgreSQL 缓存构造器在真实首次建站时立即报错的问题。
- ERPNext：`tuyutata/erpnext` 的 `version-16` 分支，提交 `b24c9eba551905e256e336ff170a91a92d197a2f`，GPL-3.0。
- 真源目录：`tuyufactory/imported/frappe/` 与 `tuyufactory/imported/erpnext/`，两者均由完整厂家产品仓直接持有的 Git subtree 源码目录。
- 锁定清单：`tuyufactory/tuyufactory.sources.json`。

上游许可证全文保留在各自源码目录中。后续正式安装包必须同步携带许可证与归属信息。

#### 4. 主机与分机架构

```text
厂家 Host                         厂家 Client
├── Flutter 主机界面              ├── Flutter 分机外壳
├── 同一完整 CitizenSDK           ├── 同一完整 CitizenSDK
├── 本机途遇管理员                ├── 本设备独立钱包与会话
├── Rust 运行时监督               └── 应用内上游 Web 界面
├── PostgreSQL                             │
├── ERPNext/Frappe                         │
└── 唯一厂家站点的局域网 HTTPS/WSS ◄────────┘
```

当前已接入两端 SDK 公开调用、主机 LAN 网关、Client固定安全连接和四端原生业务容器；实时链路及八包验收仍未完成。厂家只集成上游，不用自有 Rust 业务核心或 Flutter 业务界面替换 ERPNext/Frappe；员工功能、登录和权限继续由同一上游站点实现。

#### 5. 身份、数据和安全

- 厂家端原生核心通过 Rust 路径依赖直接复用 `tuyuserve/account` 唯一账户实现；产品与安装实例
  作用域、管理员数据库、`QR_V1` 初始化界面和本机进程会话均已接通。
- 途遇管理员只写 `tuyu_core` 账户表，不改写 Frappe/ERPNext 的员工账户功能；Frappe 首次建站所需
  的上游 Administrator 仍由上游自身管理，两套权限数据互不覆盖。
- 厂家员工使用当前厂家实例的本地账户和岗位权限。
- 安装实例生成独立 sr25519 实例密钥，由所有者途遇号授权。
- TuyuFactory 是厂家商品、价格、库存、报价、销售订单和发货的唯一权威。
- TuyuServe 只保存搜索摘要，TuyuBooking 只保存采购方记录和签名凭证。
- 公网服务只允许 HTTPS/WSS，数据库和内部运行端口不得公开。
- 首期支持简体中文和英文，其他语言回退简体中文。
- Host 与 Client 都直接集成同一个完整 CitizenSDK；SDK 功能由其独立任务负责，厂家不修改或另写实现。具体支付业务不属于本次 Host/Client 工程拆分。

#### 6. 分布式 B2B 边界

```text
厂家 TuyuFactory                    TuyuServe                  商家 TuyuBooking
商品/价格/库存权威 ──签名公开摘要──► 厂家商品索引 ──搜索摘要──► 途遇商城
       ▲                                                            │
       └──── 实时报价、销售订单、发货 ◄──── HTTPS 签名采购请求 ──────┘
```

- 厂家在自己的 TuyuFactory 上传和发布商品，只把允许公开的签名摘要送入 TuyuServe 索引。
- 途遇商城位于 TuyuBooking 内部。商家可搜索摘要，但下单前必须向厂家实例实时确认价格、库存、起订量和交期。
- TuyuBooking 保存采购方订单、收货和采购成本；TuyuFactory 保存销售方报价、销售订单、库存预留和发货。
- TuyuServe 不运行中心 ERP，不保存实时库存，也不代理采购交易。
- 示例“餐厅采购厂家生产的碗筷”属于该协议的一般商品采购，不为单一品类设计专用数据库。

#### 8. 既有产品运行验收事实（本步骤未重新执行）

以下内容记录拆分前 macOS 产品运行包的既有验收，不代表新产品身份已经编译、安装或远端验收。
当时macOS本机包已经物化并真实启动，但其Node运行结果不能作为当前受控工具版本的验收；包内还包括PostgreSQL 17.11、Python 3.14.3、
Frappe `8bc4bfb7`、ERPNext `b24c9eba`、浏览器资源、上游许可证和厂家监督脚本。数据库仅使用本机
Unix Socket `59432`，浏览器入口仅绑定 `https://127.0.0.1:59443`；数据库密码和上游 Administrator
密码由 Rust 生成并写入权限为 `0600` 的本机数据文件，不进入命令参数或日志。

主机端 macOS“编译”动作依次完成 Rust/Flutter 测试、完整 App 物化、嵌套 Mach-O 与 App
签名、纯 ARM64 回读，以及“首次建站 → 统一途遇管理员初始化 → HTTPS 200 → 正常停止 → 同数据
重启 → 管理员仍有效”的真实验收，随后只替换受控成功产物，不自动启动图形 App；独立 Start
只读取该产品最新成功 macOS 产物。既有图形 App 曾在带空格的标准用户目录完成 PostgreSQL、
Frappe、ERPNext 和 HTTPS 四组件启动，本次没有重新执行该产品验收。

当前 macOS、LinuxARM、LinuxAMD、Windows 运行包均由 `tuyufactory/scripts/` 中对应的构建入口直接生成。构建器只接受厂家端
锁定清单中的 HTTPS 地址和 SHA-256；Node改为解析受控工具引用，其它组件准备 Python 3.14.3、PostgreSQL 17.11、
Frappe/ERPNext Python 依赖与浏览器资源；PostgreSQL 显式关闭未纳入运行包的 ICU 能力。macOS
构建器还会改写全部 Mach-O 依赖与动态库标识、恢复构建签名，并拒绝宿主机绝对依赖；Unix 复制
保留相对符号链接，Windows 使用实际文件副本。

浏览器资源构建固定使用受控版本的运行包内Node及本任务Yarn。`macOS`、`LinuxARM`、`LinuxAMD`、`Windows`
构建器均把内置 Node 目录置于进程查找路径首位；公共资源构建器再次建立同一子进程环境并回读
两个准确版本，随后才允许安装 Frappe/ERPNext 前端依赖。公共物化器也只能由内置 Node 执行，
禁止 Runner 自带 Node 参与浏览器资源与公共物化步骤。公共资源构建器经受控工具引用及归档缓存验真取得Yarn，直接使用内置Node执行其JS入口，不依赖Corepack；Yarn仅存在于本次构建工作区，成功或失败均清理，不进入运行包，不进行全局安装。macOS预取计划只登记Node和Yarn引用，不复制归档来源。

构建运行包，并强制执行“首次建站 → 统一途遇管理员初始化 → HTTPS 200 → 正常停止 → 同数据重启
→ 管理员仍有效”的真实测试。macOS 已用全新构建器完成本机运行包验证、业务模块导入和
92.74 秒真实闭环；LinuxARM（`aarch64/arm64`）与 Windows（`x86_64`）的工程合同已经接通，但在各自 GitHub Runner
给出同一真实结果前，仍不能宣称对应平台可发布。

分机端 `app/lib/main_client.dart` 已接入同一 SDK 公开接口、固定主机连接和四端原生上游容器；
`app/ios`、`app/android` 已建立，LinuxAMD主机运行件构建器已接入，第6步八包隔离仍须完成。源码与组件测试不生成
虚假安装包；安装载荷、签名与各自 Runner/设备的正式验收仍须完成。

#### 9. 本机管理员账户边界（2026-08-27）

- 唯一实现位于 `tuyuserve/account/`，厂家端只保留薄入口，不复制途遇商家端账户源码。
- 厂家端固定使用 `product_id=tuyufactory` 与当前 `installation_id` 创建账户服务；会话只存在于
  当前厂家端进程，不能读取途遇商家端本机会话，也不能被云端会话覆盖。
- 首次安装、最多 99 名同权管理员、不可变公钥、启停删除、审计、`QR_V1` 扫码登录和短期断言
  由共用模块统一定义。
- 当前 `cloud_registration_required=false` 只表示首次安装暂不依赖云端注册。今后注册厂家实例时，
  在 TuyuServe 中建立云端途遇账户与厂家实例关系，不改变本机管理员和 ERPNext/Frappe 员工权限。
- macOS 已完成统一账户表建库、首位管理员初始化 UI、真实 `QR_V1` 公钥写入和重启持久性
  验收；会话仍只属于当前厂家端进程。LinuxARM 与 Windows 必须各自通过相同验收后，
  才能开放对应发布流程。

#### 2026-08-27 统一途遇 Logo 来源

本产品使用的应用图标、启动 Logo、页面 Logo 或网站 Logo 均来自 `/Users/rhett/tuyuserve/logo/`。产品目录中的资源是平台打包副本，不是独立真源；必须通过该目录的生成器更新，并通过统一资产清单测试。

#### 2026-08-27 本机编译源码边界

厂家主机与分机本机 Flutter 均通过准确平台缓存中的符号链接工程视图只读引用产品源码，工具配置、
依赖及生成状态固定在`<product-root>/target/<platform>/<flow>/`。不同产品、平台和流程不共享排他记录；
下一次同身份Build只清空该固定目录内容并保留容器。配置生成接线不代表产品工程已验收。

#### 2026-08-29 跨产品交易边界归并

- TuyuFactory 由生产厂家自行部署，是厂家商品、规格、批发价格、起订量、库存、报价、销售订单、
  发货和售后的唯一权威；Cloudflare 不运行厂家业务进程或数据库。
- 厂家只向 TuyuServe 发布允许公开的签名摘要。TuyuBooking 内部途遇商城搜索摘要后，必须直连
  厂家 HTTPS 实例确认实时价格、库存和交期；TuyuServe 不代理采购，不保存采购单或销售单。
- TuyuBooking 保存采购方订单、收货、退货和采购成本；TuyuFactory 保存销售方报价、销售订单、
  库存预留和发货。双方以签名、幂等的 HTTPS 消息协作，不共享数据库事务，并各自保存对方凭证。
- 采购状态按 `DRAFT → QUOTED → SUBMITTED → ACCEPTED → FULFILLING → SHIPPED → RECEIVED` 推进，
  并允许从提交阶段进入 `REJECTED` 或 `CANCELLED`；网络重试不得生成重复订单。
- 厂家保留 ERPNext/Frappe 原生业务和员工权限，不开发第二套采购、制造、库存或订单系统；跨实例公开销售目标不授权重写上游功能。

#### 2026-08-30 macOS本机构建

- 外部调用方的语言缓存包含Cargo、Flutter、CocoaPods、Python、Node、PostgreSQL及包管理器状态。当前Node采用受控引用，实际版本和归档摘要随锁与构建器一同参与指纹，工具变化不会命中之前的语言缓存；尚未重跑当前版本的产品编译验收。
- Frappe、ERPNext 源码及其物化业务运行时不进入缓存；每轮从仓库读取上游源码，重新安装业务依赖、生成前端资产、物化运行时并组装签名 TuyuFactory.app。
- CI 未在本步骤调整，Release 不读取本机缓存并继续执行全量构建。

## Release 全量构建（第 7.4 步）

正式 Release 固定从干净源码执行全量构建，显式关闭 Rust 增量编译及工具链内置缓存，不读取CI作业缓存且不复用本机编译中间物。版本、签名、校验、产物和发布流程保持原有产品合同。

## 双仓统一流程最终收口（第 7.5 步）

本产品执行统一流程规则：本机编译中间物只进入本轮塔塔缓存库的build目录并按终态规则清理；GitHub CI 的作业过程数据只进入该次Runner任务空间；正式Release从干净编译状态执行。源码不进入塔塔缓存库、塔塔依赖库或塔塔产物库。

## 产品平台合同冻结（TUYU 第 3.1 步，2026-09-02）

- TuyuFactory 的公开平台闭集固定为 `iOS`、`Android`、`macOS`、`LinuxARM`、`LinuxAMD`、`Windows`。iPhone/iPad 归入 iOS，Android 手机/平板归入 Android；本步骤不新增移动端业务角色定义。
- Flutter 官方 `ios/`、`android/`、`macos/`、`linux/`、`windows/` 工程目录不改名；同一 `linux/` 工程应按不同目标分别产出 LinuxARM 与 LinuxAMD。架构、ABI、Runner 与 target triple 继续使用官方机器值。
- 本文早期只列三个桌面平台的内容记录当时实现和验收快照，不再定义产品支持范围。第5步已补iOS/Android工程及容器；LinuxAMD运行件源码已补齐，全部新目标的正式运行证据仍待完成，不据工程存在删除待验项。
- 本步骤没有修改源码、流程、真实目录、Tag、资产、数据库、签名或持久化 wire，也没有建立兼容别名。

### 固定运行时下载归属

macOS、LinuxARM、Windows 运行时打包脚本的固定归档入口共用受控 `materializeDependencyArchive`。下载原件按官方锁定摘要校验后共享保存，解包输入副本仅允许写入当前登记任务目录；其它产品、平台和产品源码目录不允许成为下载目标。

Frappe与ERPNext前端沿用公共Yarn锁定归档镜像，厂家主机本机Cargo命令使用显式传入的已校验目录源。Yarn工具已直接接入受控来源，不再使用Corepack；Python包解析及其它生命周期下载尚未全部接通，不将固定归档接线视为整个厂家构建完成。此次未执行厂家产品编译或安装。

### 共用构建入口修复（2026-09-04）

厂家本机流程直接读取产品源码并自行选择 Java、Gradle、Flutter 与依赖。Worker 仅传递本任务缓存位置；产品缺少平台工程或编译条件时由产品命令自行报告，不由控制台预审。

### Python 缓存一致性（2026-09-04）

macOS 与 LinuxARM 的既有 Python 安装入口同步取消强制禁用缓存，使用各自 WORK_ROOT/cache/package-managers 下独立 pip/uv 可写目录，并继续保留受控约束文件。此处仅修复同类缓存设置，不代表厂家端旧构建入口、运行时和平台安装已完成验收。

### 安装显示名称与初始化边界

系统安装显示名称遵循设备语言：中文为“途遇厂家端”，英文为“TuyuFactory”，其他未支持语言回退英文，不附加主机、分机、Host、Client 或设备类型后缀。独立安装身份、可执行文件和数据空间不随显示名称合并。Apple 使用 InfoPlist.xcstrings 提供 en、zh-Hans、zh-Hant 名称，未本地化名称与签名前的物理包名匹配；Android 名称由 app_name 资源提供，英文默认资源保留，中文从现有 ARB 生成到构建目录；Windows 提供中英文名称资源。产品 macOS 封装入口在签名前设置与最终物理包名匹配的基础名称。Windows 原生入口已经接入系统语言资源、任务栏显示名称及本程序已有快捷方式的本地化；不新造安装器、不创建额外快捷方式、不修改其他软件。相关 Flutter 合同测试为 21 项通过，Windows 真机和最终安装包验收未执行。Android 名称资源使用 GenerateAppNameResources 类型化任务和 DirectoryProperty 输出，通过 androidComponents.onVariants / addGeneratedSourceDirectory 接入各变体，未加入兼容开关；重复变量声明已删除。四产品的独立 AGP 9.0.1 原生验证均已通过：Debug 和 Release 资源消费自动触发生成任务，AAPT2 编译及链接后的资源表包含正确中英文名称，输入不变时生成任务为 UP-TO-DATE。上述验证针对名称任务及资源链路，不代表完整应用编译、安装或真机显示验收。厂家 LinuxAMD 由厂家任务处理，本次不修改其打包入口，也不宣称 Linux 安装显示已经完成。

厂家主机已接入与商家主机相同交互方向的扫码初始化页面，分机已使用产品 Flutter 钱包初始化入口并调用 CitizenSdk 的安全创建、导入界面。厂家主机扫码初始化页面与原生接口转交已实现，已补齐遗漏的 charcode 依赖锁记录；实际安装包验收尚未完成。

LinuxAMD Release 登记引用的 `tuyufactory/.github/workflows/release-host-linux-amd.mjs action runtime` 已由厂家Linux任务补入，准确平台声明与ARM入口共用 `scripts/build.mjs 的本机Linux入口或所属Linux自动化`。AMD64 Node 25.2.1 来源已锁定，尚未完成真实Linux构建；共享窗口标题和入口存在都不等于安装包已验收。本项不改名称任务、初始化或受控流程。

### LinuxARM / LinuxAMD 运行件合同

两个永久平台入口只选择准确目标，共同实现读取各自 `package.json`，核对platform、CPU与包架构，按现有运行时锁选依赖。LinuxARM必须原生Linux/aarch64，LinuxAMD必须原生Linux/x86_64；不接收“任意64位”或macOS构建替代品。调用链为平台入口→公共构建器→物化器→完整运行包验证器，目标经 `TUYUFACTORY_PLATFORM` 明确传入；Linux未指定目标即拒绝。

验证器读取真实ELF64头，严格校验字节序、文件版本、ELF类型、头长与目标机器码。所有ELF以及动态库递归检查，不只检查PostgreSQL/Python/Node三个主程序；主要可执行文件被脚本替换也不能用伪造版本输出通过。候选程序执行前先验架构与链接，链接不得为绝对路径、越出包、断链或循环。动态依赖重定位按目标排除对应系统加载器，新增依赖下一轮再次检查，同名不同内容的依赖明确失败。

写入前检查受控准确厂家主机平台任务或当前Runner指定工作根，拒绝旧位置、符号链接、既有构建子目录及已存在目标。BUILD/SOURCES只删除本进程排他创建的目录，运行包不能置于清理目录，不删除成功包、其它任务或产品源码。构建产生的第三方运行载荷只属于当前运行包，不改变上游业务功能或来源清单。

厂家四平台Node版本与官方目标归档统一由受控工具库管理，产品runtime.lock只保存tool引用。LinuxAMD不使用ARM归档替代，缺失或不匹配的来源仍拒绝。Yarn采用同一受控工具接入。组件测试、完整Linux运行件构建及实际初始化、HTTPS和重启验收分别记录；此前运行结果不代表当前受控版本已完成产品验收。

厂家产品安装名称合同已通过隔离 Flutter 测试；依赖使用本地 CitizenSdk 与当前工具链离线解析，不作为冻结发布依赖或已安装包验收。LinuxAMD 补齐已交由厂家任务处理，与名称和初始化任务保持边界；实际包装及快捷方式显示仍须独立核对，不以共享界面标题代替。具体命令、结果和移交记录保留在现有任务卡。

### Android 自适应启动图标

Android application 的 icon 与 roundIcon 统一引用 @drawable/app_icon。既有 drawable/app_icon.xml 提供位图入口，drawable-v26/app_icon.xml 提供系统原生自适应图标，app_icon_background.xml 使用正式 Logo 左上角底色并铺满裁切区域。完整前景按 108dp 图层中的居中 66dp 布局，不裁剪或重绘标识；圆形及其他系统图标形状由启动器裁切。安装名称、初始化页面和钱包功能不随本次图标调整变化。

唯一生成来源为 tuyuserve/logo，原始 AI、PNG 和既有平台位图保持不变。generate_assets.py --android-only 仅生成已登记的四产品 Android XML 并更新 manifest.json；不会批量重写其他平台图标。原生 XML 以 android_resources 记录路径和摘要；商家工程路径使用 tuyubooking/app。厂家前景继续使用其既有 prepareLogo 任务生成的 drawable/tuyu_logo。

长期验收包括权威源与衍生清单一致、四产品普通及圆形图标引用一致、标识位于裁切安全区域，以及最终安装包在实际启动器中的显示。资源测试不能替代整包编译、安装和真机视觉验收；本项不修改控制台流程或 CitizenSdk。

### 分机钱包初始化入口

分机由产品 Flutter 页面显示正式途遇 Logo、产品名称、中英文辅助文字及创建/导入入口，窄屏和横屏通过可滚动的限宽页面承载。页面不显示主机/分机品牌后缀，不增加助记词或派生密码输入。创建和导入直接调用 CitizenSdk.wallet.create/importWallet，秘密输入、可选派生密码与安全操作属于 SDK；调用完成后回读 getProfile，只有钱包公开资料已经提交才进入后续业务流程。商家主机现有扫码初始化完全不变。

取消和认证取消依据 CitizenSdkErrorCode 分类，留在入口而不当作操作失败。真实失败仅显示产品通用提示，不直接显示 SDK 原始异常；操作中防止重复点击，更换 SDK 后丢弃旧会话的异步结果。商家未有钱包时不提前加载业务模式；厂家未有钱包时不开放业务界面，钱包就绪后才首次启动原有主机连接。钱包不代替上游员工账户及权限。

本实现的源合同和语法解析不能代替 Flutter 组件、完整类型分析或原生钱包验证。完整验收需覆盖两种语言及手机/平板/桌面尺寸、创建/导入成功、取消、失败重试、重复点击与 SDK 会话更换，不得把源合同通过当作实际钱包初始化成功。

分机入口现已增加实际 Flutter 组件测试，使用真实产品页面及 CitizenSdk 公开门面，测试传输只提供公开状态。取消错误夹具必须携带当前 sessionId/requestSequence；缺失时 SDK 正确拒绝为解码错误，禁止放宽此校验来通过测试。相关错误夹具已补齐当前会话和请求身份，现有入口组件及相关源合同测试通过。成功创建/导入后的业务跳转、已有钱包、回读失败和SDK恢复已经通过实际Flutter页面及公开门面的夹具测试；原生安全界面和真机安装仍属于独立验收；具体运行结果见本产品现有任务记录，不能据入口测试通过声明完整钱包初始化已验收。

### 厂家主机扫码初始化

本机数据库和运行时就绪、管理员尚未初始化时，FactoryHomePage只展示独立的管理员设置界面，暂不展示业务页和钱包操作卡。使用正式Logo及墨绿色主题，标题为居中的“设置管理员”，左侧原始挑战二维码、右侧摄像头，窄窗口纵向排列；两块区域保持正方形，中英文随设备语言确定主次。唯一文本字段为选填管理员姓名，最多30字符，不再提供手工粘贴签名响应入口。

页面自动调用既有administratorChallenge接口，本地二维码编码保留4模块静区。摄像头使用flutter_lite_camera，RGB帧经zxing2在隔离任务中解码，仅把识别结果交给既有initializeAdministrator原生接口。验签、挑战归属、有效期、重放限制和管理员持久化仍由原有原生账户实现处理，不在Flutter另建授权逻辑。摄像头或帧不可用不会放行；挑战失败和验签失败使用通用双语提示，不显示原始响应。刷新会重新请求挑战并重建摄像头；提交期间禁止重复请求或提交，初始化成败都消费当前页面挑战。

退出、后台和初始化完成时停止预览并释放摄像头；退出期间迟到的相机启动仍执行释放。运行模型忽略旧代次或已销毁页面的管理员请求结果，不通知已释放订阅者。macOS摄像头用途说明包含管理员扫码，原有权限不扩大。

本项只更改首次管理员设置；已有管理员安装的现有管理入口和员工权限不重构。Flutter测试执行实际二维码编码、RGB帧解码及生产页面到原生接口的调用，原生验签以替身隔离，不能代替真实钱包光学往返、真实数据库或安装包验收。依赖版本与商家保持一致；产品锁文件已补齐 zxing2 的 charcode 传递依赖。本次锁记录修复未重新运行测试或编译，不代表真实安装包验收完成。

### 2026-09-05 共用本机构建准备回归

厂家端复用受控只读缓存清理修复。本机CitizenSDK输入只读取其准确公开仓源码，正式产品声明和锁文件保持固定Git提交。商家与厂家合计16个产品平台组合的共用规划测试已通过，包含厂家主机macOS、Windows、LinuxARM、LinuxAMD及分机iOS、Android、macOS、Windows。测试仅在受控临时目录内生成夹具，通过同步读取映射避免将测试容器误作真实SDK来源；生产禁止target源码的规则保持不变。与缓存测试合计18项通过，不宣称厂家各端已编译、安装或验收完成。

### Android 共用 SDK 工程隔离

厂家与商家消费同一个 CitizenSdk 原生构建入口。独立 AAR 的根工程和 native 工程位于当前任务的 Gradle 工作目录，Manifest、Kotlin、CMake、资源及测试输入继续只读引用原 SDK；不复制 SDK 源码，不扩展源码写权限。此共用修复不改变厂家业务界面、钱包 API 或平台登记；厂家安装验收须与商家分别记录。

### Flutter 独立缓存工程视图（2026-09-10）

厂家主机与分机共用真实 `tuyufactory/app`，但所有平台按产品身份使用各自固定缓存叶子。Flutter工程视图由本产品公开入口建立，生成状态统一进入 `build/`、`dependencies/` 与 `tmp/`；主机和分机、不同平台之间没有共享可写目录。厂家产品自己的入口、依赖和原生 SDK 决定权不变。

分机 Android 的 Flutter/Pub 阶段在缓存根生成 `local.properties`、插件清单与 SDK 投影，Gradle 阶段固定从 `<本仓根>/app/android/` 真实根启动。设置与应用 Gradle 读取当前缓存 Flutter 根；项目缓存、依赖缓存和构建输出仍全部留在分机 Android 缓存，不再由跨根设置脚本链接改变 Gradle 根身份。

Gradle 9.1需要受控 Flutter 插件 included-build 根目录可写；这里只开放该目录自身，插件文件仍只读并保持摘要验真。任务级初始化脚本把插件构建输出导向厂家分机 Android 缓存，Gradle命令关闭 Problems Report，禁止源码根生成 `android/build/`。
## 2026-09-11 本机生成状态清理

厂家端源码不再保留 `.dart_tool`、Flutter ephemeral、`Generated.xcconfig`、`flutter_export_environment.sh`、Android/iOS/macOS PluginRegistrant、IDE 状态或插件生成清单。已删除的 iOS 环境文件包含本机绝对路径，只能由后续真实任务在本产品调用方提供的规范源码外工作目录 重新生成；产品源码及Gradle Wrapper保留；正式声明与锁统一到同一Git来源，禁止本机pubspec_overrides.yaml。
## CitizenSDK统一边界复查（2026-09-15）

TuyuFactory Flutter主机与分机都直接依赖CitizenSDK并实际调用`CitizenSdk.open()`，钱包初始化与设备轻节点边界
正确，产品内也有测试禁止第二层CitizenSDK包装。厂家原生主机通过路径依赖复用`tuyuserve/account`，因此继承
该模块自建签名摘要与sr25519验签的偏差；`native`中的`schnorrkel`当前仅为测试依赖，但测试同样不应形成第二套
密码学金标实现。厂家业务授权、安装实例和数据库继续归TuyuFactory，签名/验签实现最终必须收口到CitizenSDK
公开能力。本轮未修改该运行路径。

本产品每个实际产品、平台、流程身份使用下列独立文件，主 Job 为 `flow`；CI 验证源码，Release 生成正式产物，本步不实现Publish，发布待后续逐产品重建。

## 平台输入与源码外工程

tuyufactory/app/scripts/project.mjs为本产品唯一工程装配入口，project.test.mjs验证路径与隔离。create和verify明确接收source-root、work-root及platform；调用方可指定当前任务内output，默认按源码绝对路径装配，输出不得覆盖或进入源码。Flutter、Xcode、Gradle的可写配置保存在输出工程，源文件不被工具回写。

平台声明以Runner.pbxproj、Runner.xcscheme、ProjectWorkspace/Workspace声明等文件直接保存于ios或macos目录；单文件测试、单一macOS图标资源及菜单包装层归并。工程入口仅在本次工作根重建Xcode所需固定结构，原平台声明与资源正文保持。Android扁平Manifest、资源限定文件及MainActivity由同一入口还原原逻辑路径。Android Wrapper来自调用方明确指定的固定FLUTTER_ROOT原件，输出使用既定Gradle9.1.0；缺工具、缺输入、目标已存在或来源链接越界均失败。

页面Logo唯一源码路径为tuyufactory/app/tuyu_logo.png。CI和Release各自创建独立工作工程，后续签名只读取该工程产物；本机Build传入当前任务目录，产品不识别目录来源。SDK锁定Git依赖通过SDK自有公开Flutter工程入口提供本轮可写Pub视图。

工程验收同时解析四个分机平台入口中的SDK准备脚本，确保同一任务只执行一份依赖准备声明。打包测试使用规范临时根，Windows测试提供完整模块目录身份；符号链接越界拒绝与安装包敏感文件拒绝仍由生产校验执行。

Android的TUYUFACTORY_BUILD_DIR由本机调用方明确指定本轮源码外输出目录；Gradle产物和APK收口必须使用同一目录。产品既有独立运行默认值不变。本机App和适用的SDK原生步骤复用调用方已验真的Gradle可执行文件，执行失败必须传回，不经Wrapper重复下载工具。

## 上游系统目录保护边界

`tuyufactory/imported/`保留既有位置、上游源码、历史定制、内部目录结构、版本和消费引用。自有代码目录整合不对这些上游系统实施迁出、删除或扁平化；上游内部单目录不计入本次自有代码整改的未完成项。

原生安装件装配到本次Pub实际解析的SDK视图。`app/pubspec.yaml`与`app/pubspec.lock`统一消费CitizenSDK根包提交`0c442b4065ff1577e235cba76978749827d9f575`，离线源码只来自该已保存提交的登记Git原件。Apple框架来自同一锁定SDK的原生构建；Android双库及工作目录由本次回执提供；桌面只消费同版安装前缀。SDK Git原件、宿主声明与锁均保持只读，失败清理只处理本轮占有的目录。

全部八个Factory CI平台沿app/scripts/project.mjs唯一prepareNativeProject取得同一Git SDK并构建。Android回执提供本轮双库和Gradle目录；Apple框架装配到Pub实际SDK视图；Windows/Linux安装件装配到该视图的真实平台目录。CMake的--sdk-plugin回读同一Pub解析根、原SDK CMake源码及本轮安装件，禁止第二个未被Pub消费的plugin树。资源回收失败的75状态逐层传播并保留本轮现场，其它失败只清理本轮排他占有的目录。

八个CI Job内嵌Node正文按JSON真实解码结果复验，Flutter与分机工作目录写入GitHub环境使用实际换行，控制字符拒绝正则不能被解码成换行。SDK准备回归检查createProject、固定来源与锁文件；Windows路径回归在VM内按测试文件绝对URL链接真实project模块，继续拒绝错误SDK DLL身份。

## 完整产品组织与执行合同

所有者：`tuyufactory`，正式源码根 `<本仓根>`；本说明属于该完整产品。组件不会拆成独立仓库或目录产品。所有执行身份统一为 `产品.平台.流程`，单平台物理目录省略平台层，执行身份仍保留真实平台。

真实平台目标：`host-macos`、`host-windows`、`host-linux-arm`、`host-linux-amd`、`client-ios`、`client-android`、`client-macos`、`client-windows`。

仓库推送仅上传本仓已经保存的main提交。控制台推送的唯一实现为console/tuisong.mjs，每仓一次生物识别，授权成功后建立独立任务，任务栏记录Git进度、准确SHA、取消及成功/失败终态。只执行Git与GitHub main只读回查，不执行源码、依赖、注释、文档、测试、签名或资源门禁；不派发产品Workflow、不运行hooks、不续签或重复认证、不自动重试、合并或强推。

本仓已移除GitHub main推送门禁触发器；main上传后不自动运行产品自动化。自动化由用户单独发起，产品仍拥有自己的Workflow、声明、资源、测试和产物实现；产品不导入控制台源码，不依赖控制台工具库、私有规则或其它仓库工作树。控制台只是可选Git客户端。各仓可独立使用公开Git接口完成仓库操作，公开SDK依赖不构成流程耦合。

技术文档由所属完整产品仓根唯一持有；私有规则和任务库由控制台私仓持有，公开产品不读取它们。公开门禁不依赖私仓资料、安装包源码、其它本机产品或个人账号；必要链真源只读本仓明确固定的公开40位SHA，不在门禁中跟随main。本机开发跨产品验收仍比较三仓已保存快照与各端真实镜像。

### 门禁与开发审查职责

准确中文注释按开发阶段逐项复核，不以保留源码每文件包含汉字作为仓库门禁的开发凭证。初始完整内容、生成文件和上游原件保持原文；真实第一方临时注释、机密、源码输出、Workflow、依赖和适用测试仍由本仓同提交门禁验真。公民门禁只把scripts中的Node命令行结果报告识别为CLI输出；本仓实际执行测试的准确协议拒绝断言不属于新运行协议，字符串、注释、模板和未登记测试中的同文不豁免。保存及推送仍逐仓独立授权，并以本机门禁和同SHA的GitHub门禁双成功为唯一终态。

## 产品介绍与开源许可

根目录 `README.md` 仅提供本产品简明介绍，不承载技术方案、任务记录或验收结论。独立自有代码采用根 `LICENSE` 的MIT；上游代码、衍生修改、依赖及组合分发遵循各自原许可、版权、例外与附加要求。
Frappe为MIT，ERPNext为GPL；准确源码与许可路径由现有sources清单登记，MIT不覆盖上游要求。

### 本机Build代码所有权

厂家账户Rust依赖只消费https://github.com/tuyutata/tuyuserve.git的固定提交435e585bd59aabe5bec3d4ca21074abbae864b43，不读取相邻产品工作树；编译逻辑及候选验真仍属于完整厂家产品内的Host/Client。

macOS业务运行包禁止由Homebrew自动选件：只消费显式交付且来源已验真的编译组件，缺失即失败。OpenSSL来自既定受控工具交付，Python调用使用准确入口。商家PHP/PCRE2、厂家libffi/Pango的实际编译组件仍须在真实Build前完成来源和可用性验真；未完成交付不能判定真实Build通过。

本产品脚本、测试及原生工程的源码根变量统一为`TUYUFACTORY_ROOT`，仅表示途遇厂家所属正式源码根；生产者与消费者同步使用这一名称。Release仓库身份错误使用准确产品中文名，正式组织与仓库身份校验保持。

## 准确Git工具交付方案（2026年10月6日）

固定源码工程入口已改为只接收显式 PRODUCT_GIT_BIN：普通可执行文件、规范绝对真实路径和 Git2.54.0 在读取来源前一起核验。来源、固定提交、干净原件、原始锁只读及无 override 合同保持；缺少交付或出现路径、版本漂移即失败。公开环境自行按本仓入口交付固定工具，本机可读取现有验真工具原件，不依赖控制台私有路径。

正式来源与工程8项回归全部通过，覆盖正常、失败、隔离及夹具清理；未执行本产品完整Flutter编译或设备验收。准确授权和结果同步唯一任务卡。

## MLS统一清理固定来源与当前验收状态

CitizenSDK当前统一固定提交为0c442b4065ff1577e235cba76978749827d9f575；CitizenApp、TuyuLove、TuyuBooking/app与TuyuFactory/app的8份声明/锁已经同步，离线原件只按该真实保存提交取得和验真。当前SDK公开Core为144项、Apple总导出148项、Flutter方法93项；旧用途钥API、结果和二维码响应已删除。MLS登记保持0x1C及同一32字节public_key，客户端钱包私钥之外只保留MLS协议秘密。

本轮源码、注释、测试源码与实际接口说明已经同步；此前测试记录不能证明本轮新快照通过。统一测试及已签名Release真实验收尚未完成，未推送或部署。

### 产品独立资源与编译入口

本产品平台闭集为`host-macos`、`host-windows`、`host-linux-arm`、`host-linux-amd`、`client-ios`、`client-android`、`client-macos`、`client-windows`。调用格式为`node scripts/build.mjs <requirements|prepare|build> <platform> --work <绝对工作目录>`；requirements只读并输出唯一JSON，prepare/build从标准输入读取schema=1的资源回执。调用方交付准确工具执行器、锁定依赖目录、Git来源和归档后先prepare，再读取展开来源新增的需求，完整交付后执行build。准备、展开和编译属于同一调用工作根，各平台互不共享可写状态。独立调用方按本仓声明准备资源即可运行，无需读取其他产品工作树或私有资料。

## 2026-10-06 产品自主资源阶段（第2步）

本仓`scripts/build.mjs`拥有工具准确来源/版本/配方、递归锁解析、缺失获取、验真、复用和本轮依赖准备；`scripts/build.mjs resources <platform> --work <绝对外部工作根>`调用同一实现，独立入口为`resources.mjs <platform> --work <工作根> [--offline]`。前者从stdin读取公开身份回执；后者允许空请求。最小宿主必须使用本仓声明的官方Node25.2.1绝对入口，本机配方限定macOS ARM；资源阶段使用本仓声明的Node入口，不能从PATH取同名程序。工作根预先存在、位于源码外且不经过链接。

现存`PRODUCT_TOOL_ROOT`与`PRODUCT_DEPENDENCY_ROOT`是工具和依赖的只读路径输入，本身不能完成控制台缺件准备与交付。当前供给职责按本文“工具与依赖的声明和供给职责”执行：经控制台运行由控制台准备、保存与供给，独立运行由产品自行处理；源码外`~/.local/share/product-resources`仅描述现存独立资源存储，本轮可写状态仅在work。GNU Bash/grep/sed纳入自身需求；发行件旧Shell仅用于声明中的首次GNU构建，不进入正式PATH。下载/源码工具编译不持全局锁，最终不可变对象提交使用短锁，取消传递到工具进程组。错误摘要、损坏、未锁来源、路径越界和显式离线缺失失败并保留可疑原件。

Pub/npm/Cargo按原始锁准备；Git按固定HTTPS提交检出，Git Cargo目录源展开workspace继承并锁定相对包版本；CocoaPods按准确锁摘要恢复验真快照，缺失spec校验规范摘要，未锁源码来源拒绝取得。Android固定包与修订归产品；额外平台仅消费官方固定发行来源与发行树摘要，不借宿主历史SDK目录。Maven供给只读验真后复制到独占Gradle缓存，由产品准备现有配置，消费仍离线；全库坐标导入与旧目录清理留到第5步。

`PRODUCT_WORK_DIR`、`PRODUCT_BASH_BIN`、`PRODUCT_RSYNC_BIN`及`PRODUCT_SOURCE_DIR`是公开工作/工具/工程入口；Flutter修订不读取调用方私有变量，也不回退系统rsync。旧Flutter补丁对象与当前配方不符时拒绝复用，真实替换须按准确资源操作另行授权。本步不改变编译、签名、安装及回读顺序，不修改产品UI，也未执行真实工具下载/安装。受控资源测试不能代替官方首次取得、正式编译或最终真实运行验收；第4至7步仍待逐步确认实施。

锁解析器、固定Git bundle与Pod spec/源码只在本轮固定工作根物化使用，不提交共享派生目录；可选依赖供给继续读取已登记的`objects/<SHA256>.blob`原件，独立模式按原锁取得缺件，显式离线缺原件必须失败。源码工具依赖与官方补丁仍按本产品声明准备。Pod spec每次按锁中的规范checksum回验，Git tag只核对发行声明并消费本产品预锁提交；HTTP发行件消费固定SHA256，首次源码准备命令来自该已验真spec并由GNU Bash执行。spec与源码按原锁在本轮使用；供给索引不决定产品版本。正式PATH排除旧POSIX Shell，`sh`对应已验真的GNU Bash。

独立缺省资源目录内`tools`保存工具发行件及工具编译输入，`rely`保存本产品声明允许的原件；锁解析器、Git bundle和Pod物化视图仅归本轮固定工作根，工具退出且结果消费后清理。根据用户最新要求，分步骤先完成实现与用例，整项解耦任务完成后统一测试；本步实施记录不等于真实工具首次取得、完整Build或安装验收通过。

### 第3步：产品完整Build入口（2026-10-06）

主机及分机macOS Build必须验真产物，禁止自动安装；已声明的Windows和Linux目标仅编译。每个分机iOS或Android本机Build任务必须完成本平台的Release配置编译、签名验真、覆盖安装和回读；任一步失败即任务失败。

本产品的正式完整入口为已锁定Node的绝对路径调用`<本仓根>/scripts/build.mjs execute <platform> --work <已存在绝对工作根>`，可选`--offline`。输入stdin可为空；调用方可传schema/product_id/platform/work及真实run_id/program_digest，禁止私有变量或执行命令。入口内部完成需求→资源→准备→再次需求/资源闭包→编译→适用签名/安装/回读；独立与控制台调用同一实现。最小引导Node只启动本产品的资源引导器，产品按自己的官方Node声明准备并重入，控制台运行Node不决定产品Node版本。

标准输出只有唯一有界JSON：schema、product_id、platform、work、completion、files及可选真实run_id。completion按本仓平台声明为device-install、macos-artifact或compile-only；files按本产品flows.json登记路径和SHA256。编译日志使用stderr进入现有任务日志，不新增资源任务或任务状态。完整结果只在各阶段成功、源码/锁不漂移、工具进程确认退出后落入本轮build-result.json；同根并发或复用旧结果拒绝，取消/失联/错误身份/损坏候选不得成功。

控制台每次Build直接读取本产品当前flows.json入口，调用一次execute；控制台只跟踪真实任务、核验公开结果和保存产物，不解释产品工具、依赖、编译参数或设备规则。当前控制台静态菜单、其它产品流程/安装器与程序摘要的历史耦合仍归第4步解除，本步不能当作整项解耦已完成。

Android开发材料读取和仅首次创建可由专用PRODUCT_HOST_FD=3提供，原生端仅保管既有DEV_KEY；产品自身负责材料解析、工具、临时密钥、Release包签名、证书/版本核对及USB安装回读。独立调用由产品自己的Keychain保管开发材料。材料不写入公开结果或日志，临时密钥只在工具确认退出后删除。iOS归档由本产品按唯一Bundle ID读取版本，并通过Apple SecStaticCode公开接口验真签名；随后主动探测真机、防降级、安装并回读bundleVersion。Provisioning Profile授权和设备资格由Apple设备安装流程判定，产品不解析未公开Profile/CMS格式。控制台不读取产品私有领取记录或复制产品业务校验。

Android Build必须直接开始编译，禁止编译前选择或等待设备。签名完成后先执行ADB USB安装，不限制品牌、机型或数量，不要求设备登记或另设设备授权门禁；仅当ADB报告多个USB目标时列出全部USB设备号并逐台安装，每台安装后回拉验真。一台失败仍须尝试其余目标，任务最终失败；其他ADB直接安装失败据实失败。禁止固定设备、模拟器和无线安装。

iOS真机交互、页面验收和交易诊断必须使用XCTest，UI测试必须使用XCUITest；禁止用iPhone镜像或macOS系统控制台com.apple.Console执行这些工作。测试不得替用户完成最终交易确认。

产物保持固定android.apk/ios.app.zip；控制台只在产品验真后、设备安装前保存候选，保存失败阻止安装，安装失败不伪造成功。iOS回归使用本产品Swift安全助手与合成签名App，覆盖正常Bundle、错误Bundle及签名漂移；Profile授权由Apple设备安装判定。测试仅编译产品的macOS安全助手并检查合成签名包；编译器、SDK和Developer目录必须来自本产品锁定Xcode，分别由PRODUCT_TEST_SWIFTC、PRODUCT_TEST_SDKROOT/SDKROOT与PRODUCT_TEST_DEVELOPER_DIR提供。

本轮本地验证：产品Build和资源模块JavaScript语法检查通过；macOS安全助手针对本产品签名Bundle通过正常、错误Bundle和签名篡改三类合成用例。未构建或安装iOS产品应用，未进行设备验收、正式Build或Release。

### 第4步实施中：远端路由当前声明

本次同步路线读取、热更新和失败边界用例，未运行测试、语法检查、编译、签名、安装或下载。第4步仍在开发中：Publish执行器、聊天安装器、Start、固定菜单声明与完整程序摘要的其余实际耦合尚未解除，不能报告该步或整项任务完成。

厂家host-macos、client-macos启动声明和入口已归本仓`scripts/build.mjs start`。入口先确认本仓成功App的位置和实际执行文件，完成签名及候选检查后才启动厂家主机或分机。临时工具现场由本仓target/test领取与释放。最终结果通过本仓`factoryStartedApp`确认：六个公开字段必须完整且没有额外字段，厂家身份、所选端和产物必须与本次请求一致，操作及终态必须是start、started；随后才写入PRODUCT_RESULT_FD=3。任何失败或取消由本仓返回失败，不使用商家或控制台的结果确认实现。

### 产品远端完整入口

本机固定菜单不再登记Start源码与产物，也不保存Build产物文件名或验真相对路径副本。执行时读取所属产品当前Start声明及Build的files、verificationPath；产品修改自己的App名称或可执行文件路径无需重编译菜单，原有平台完成方式及产物摘要收口保持。相关用例已同步，尚未运行。

### 产品软件记录与正式版本恢复

资源工具取消、超时、输出超限和异常收尾均等待主进程与整个后代组退出；无法确认退出时保留工作根和候选，禁止删除输入或改为可写。真实取消退出顺序用例仅写入resources.test.mjs，尚未执行。

### 产品独立资源与唯一依赖供给

本产品的scripts/build.mjs独立拥有需求解析、准备配方、来源与摘要验证、可写视图和失败条件。独立执行时由产品获取、保存与复用缺件；经控制台执行时由控制台按产品声明准备、保存并供给，产品核验并使用。PRODUCT_DEPENDENCY_ROOT仅是现存只读路径输入，缺少路径或原件不得在控制台执行模式下触发产品自行下载；实际供给接入仍需代码改造与验收。依赖索引读取仅接受schema_version=2及packages、git_sources、pods，不恢复旧目录或整锁快照。

Maven的具体JAR、AAR、POM、module及分类器文件统一由packages的group:artifact、version、准确上游URL、SHA256和SRI定位objects中的原件。产品在本轮work/dependencies/maven按上游分区复制独占文件；不复制Gradle二进制元数据、锁和下载状态。产品生成本轮GRADLE_USER_HOME/init.d初始化脚本，只在自身已声明的同源仓库之前加入本轮原件视图，缺件仍按产品原仓库解析，明确离线则失败。Gradle解析、工程状态和后续编译都属于同一产品任务。

Pod由pods中的name、version、checksum匹配当前Podfile.lock；spec保存官方CDN地址和原件摘要，source保存官方podspec来源，files保存发布树相对路径、文件内容摘要与权限或安全内部链接。只物化本产品所需的单个发布坐标；其它Pod、整锁、平台或宿主变化不要求复制全树。产品仍按CocoaPods官方规范回验SPEC CHECKSUMS，再验证本产品预锁定Git提交或HTTP发行摘要与源码回执。可写缓存和工具VERSION仅在本轮work产生，不能写回共享原件。

错来源、摘要、重复同源内容、生成状态、硬链接、内部链接越界或循环、取消及任务副本漂移均据实失败。独立与控制台调用使用同一实现；控制台只提供可选原件并跟踪原有任务，UI、功能、按钮、平台与操作顺序保持。用例源码已同步，执行留待整项实现结束后的统一测试。

### 独立入口回归验真边界

资源回归使用自带固定提交、源码字节和spec的合成Pod，不借用产品真实Pod清单提供测试输入；无真实Pod需求的平台也验证来源、摘要、链接、循环、取消和物化失败。测试现场仍位于本产品target的准确平台，不写源码或其它产品目录。资源声明与生产依赖坐标不因测试夹具改变。

Start只接受当前产品声明所对应平台target内的真实App目录；拒绝源码、其它平台和链接候选。产物验签、声明及可执行文件回读、前后摘要、取消处理和原启动顺序保持。

Apple验真器回归显式使用已验真的锁定Xcode及其SDK；官方swift入口允许包内链接，但规范目标必须属于同一Xcode且为有执行权限的普通文件。不得因此借用PATH或另一套工具。

资源取消对同一真实进程组每轮只发送一次信号；组不存在或Windows时才发送给主进程。仍等待主进程和后代实际退出，8秒未退出才强杀，12秒仍未确认则保留现场并失败；取消不能成为成功。

iOS签名助手回归由同一锁定Xcode的swiftc构建，并在独立临时目录创建合成App，用Apple codesign生成可验证签名；测试检查合法签名、错误Bundle和签名后内容漂移，结束时回读临时目录已清除。测试不构建或安装产品iOS应用。

## 只读塔塔门禁与功能验收边界（2026-10-10）

.github/tatagate/tatagate.mjs 只读核对本仓正式 main/HTTPS 来源、scripts/ 的 Build/Publish 双文件闭集、同仓 Workflow、流程调用方向与 Node 语法，并扫描自有受控文件的禁用字符、强特征机密及脚本中的明文网络地址。门禁不准备资源、不调用 Build 或 Publish、不执行产品测试。编译回归归 Build，自动化测试归各自 Workflow；旧门禁中的其它产品专属静态约束仍需逐项复核。当前代码只完成静态检查，没有执行正式门禁、完整产品测试、真实编译或发布。

## 本机固定执行目录

历史验收路径保留原记录；本节为当前本机目录规则。

### scripts 同文件回归

Node 回归由所属 Build 或 Workflow 执行，门禁只读核对登记与源码，不执行测试或管理测试现场。

## 本机编译入口

本产品完整本机编译只由scripts/build.mjs实现。声明与资源配方归本仓；独立执行自行准备，控制台发起时只消费其明确供给，不因缺件或失败切换到独立下载。控制台调用、移动端安装与macOS App约束归console/build.mjs，控制台供给的原件获取、命令执行和对象提交归tools/toolchain.mjs，产品负责自身现场与资源配方临时路径清理；供给方只收尾自己创建的候选和提交锁。

公开编译组件只有本文件中的正文；确有既有消费者的原路径只转交参数或公开接口，不保存编译命令。本机编译不生成第二份脚本。本机编译直接读取同级CitizenSDK仓库当前代码，SDK公开plan决定原生依赖；GitHub自动化才按本仓声明和锁检出准确Git提交，不调度兄弟仓任务。GitHub流程不属于本次修改范围。

## GitHub自动化

本仓自动化只在GitHub的main源码上执行；控制台只调用与展示。各目标独立拥有同名的YAML与Node实现，不调用其他仓或其他目标的Workflow。版本、构建、测试、签名、完整产物核验与正式tag/Release均由本仓负责。

- `.github/workflows/release-client-android.yml`及同名`.mjs`。
- `.github/workflows/release-client-ios.yml`及同名`.mjs`。
- `.github/workflows/release-client-macos.yml`及同名`.mjs`。
- `.github/workflows/release-client-windows.yml`及同名`.mjs`。
- `.github/workflows/release-host-linux-amd.yml`及同名`.mjs`。
- `.github/workflows/release-host-linux-arm.yml`及同名`.mjs`。
- `.github/workflows/release-host-macos.yml`及同名`.mjs`。
- `.github/workflows/release-host-windows.yml`及同名`.mjs`。

每个目标的最后任务使用always读取所有前置结果：全部成功清本仓本目标旧成功，否则清旧失败并失败退出。仅保留最新成功、最新失败各一条；保护本次Run和所有活动任务，另一类结果与其他目标不受影响。删除关联正式Release、tag、Actions产物和Run后回查；任何清理错误都按实际失败报告，不自动重试。

所属回归位于各目标同名mjs，覆盖前置结果、版本边界、平台隔离、活动保护和完整分页；真实GitHub构建与发布验收依任务授权另行执行。

调度方按本仓supplyRequirements和prepareToolSupply取得工具候选；调度模式的获取、提交及执行使用供给方交付的能力；产品配方自行清理自己的临时生成物。缓存复用消费实际路径，运行Node版本/字节、Apple资源签名及工具全树复验不作为本机编译门禁；上游锁与正式应用签名、安装回读继续由各自真实流程执行。

macOS运行时、资源和分机组装组件的本机正文归scripts/build.mjs。运行时原件需求从本仓runtime锁派生；provided模式编译阶段不得下载原件，必须使用本轮已交付路径。

厂家本机编译的分机iOS阶段生成未签名候选，后续签名和安装由厂家自己的完整Build确认。Shell正文先于本仓测试入口初始化；Android与macOS候选组装直接调用本仓`build.mjs module client`公开入口，临时Android夹具转交同一本仓入口，不复制厂家SDK校验或把仅加载导出的过程视作组装成功。Security测试通过已交付的厂家Xcode确定SDK及macOS目标，拒绝包外SDK，测试不要求控制台环境。

本机编译现场由本产品领取和收尾。调度任务编号随本产品领取记录保存；本轮结果消费后，只允许匹配该编号的收尾请求。产品确认自身进程及资源供给后代全部退出后才清场；异常、编号不符或退出未确认时保留现场。控制台只持有调度锁、调用本产品入口并供给资源，不实现产品清理。

软件版本计算使用本目标GitHub运行序号作为单调下界，并与本仓已成功版本比较；失败或历史清理不使版本返回源码初值。版本只在GitHub本次运行内产生，同一Run重试保持运行序号，Tag另绑定准确attempt。

### 当前自动化最后处理

本仓每个自动化目标仅由自身release-<平台>.yml与同名mjs执行，最后处理依赖全部前置任务。清理只接受该目标准确Workflow路径、main和手动事件，不根据已删除文件或旧入口名称猜测归属。前置失败时，本次产物撤销与旧失败清理分别尝试并汇总错误；任何一项未确认均失败。固定依赖仍由本仓声明和原锁管理，不参加自产历史结果分类。

### 本仓 GitHub 自动化与塔塔门禁目录

本仓 .github/ 仅保留 workflows/ 与 tatagate/。Workflow 自行执行产品自动化，tatagate.json 与 tatagate.mjs 只登记并只读核对本仓静态合同；产品测试由 Build 或对应 Workflow 执行。


## 塔塔鹿鹿与自动化

本仓 `.github/tatalulu.yml` 只登记准确仓库身份与main分支。塔塔控制台直接保存、推送并回查GitHub main；本仓自动化由既有平台工作流显式发起。

## 配置需求公开接口

本仓 `scripts/config.mjs` 声明厂家端 Android 的 APP_KEY、iOS 的 IOS_KEY 和 APP_PROFILE，均为本产品独立保密签名材料；旧控制台通用 Cloudflare 账户、数据库、桶与 R2 名称没有本仓现行消费者。两条分机 Workflow 只构建并交付带准确Run/SHA摘要的未签名候选，不读取 Repository Secrets，也不在 GitHub 签名或创建正式Release。本仓 `scripts/publish.mjs` 验真候选、按声明接收控制台瞬时交付的签名材料，在本机运行本仓唯一签名脚本、回读包身份并逐件上传正式资产；历史同类Run/Artifact在最终发布成功后由本仓接口清理。实际签名、发布和密钥迁移尚未执行。

控制台任务取消信号传入本仓签名和发布接口。本机工具终止本轮进程组并等待退出，iOS 钥匙串搜索列表仍在收尾阶段恢复；上传中止后独立回查本次已确认归属的 Tag/Release，撤销并确认不存在。创建回执不明时不删除同名远端资源，准确报告未闭合失败。

厂家分机 CI 的 `build-release` 动作实际调用本仓 `buildCandidate` 生成未签名 APK/AAB 或 iOS App，Android 的 `claim-release` 认领本轮临时目标；未知动作直接失败。本机签名后的 APK、AAB 与 iOS App 通过本仓包验证接口核对，不依赖只存在于 CI 构建现场的 SDK 工程收据。上述接口已写入源码，尚待所属产品测试验证。

编译入口在同一次任务中由本仓完整 Build 先取得资源回执、运行适用代码回归，全部通过后才执行所选平台正式编译；测试失败或取消均禁止生成正式编译产物。测试清单与所需工具只归本仓 Build，控制台仅调用完整入口并按本仓声明供给资源。

## 产品自有编译前测试

完整 Build 由本产品在首次资源回执后运行自己登记的 Node 回归，成功后才进入工程准备和正式编译。测试所需 Node 及其它资源按本仓平台声明验真：独立执行由本产品准备，控制台调度仅按本仓声明供给并调用完整 Build，不选择测试文件或限定测试工具。测试夹具的固定根映射到本仓 `target/test/sessions/<本轮随机会话>/`，子进程继承会话身份；退出时由本产品核对守卫和工具进程后仅清理该会话。正式 `target/build/<平台>` 的领取与收尾规则保持。合成阶段注入只在本仓测试上下文有效，正式完整 Build 必须先运行本仓测试。
