# 途遇厂家端技术文档

## 工具与依赖的声明和供给职责（2026-10-08）

本产品完全独立管理全部流程所需的工具、依赖及其它资源需求。需求唯一依据为本仓源码、公开声明、锁文件及本产品拥有的准备配方，包括准确版本、平台、官方来源、摘要或固定提交、闭包、验真方式和失败条件；塔塔控制台按当前产品声明提供资源，不维护另一份产品需求或替产品决定版本、来源与流程步骤。

本产品必须能在没有塔塔控制台时完全独立执行全部已实现流程。独立执行时，本产品自行完成可信引导、资源获取、验真、保存、复用及任务工作视图准备，不依赖控制台源码、私有资料、安装位置或资源库。

通过塔塔控制台执行本产品流程时，本产品向控制台声明所需资源并使用其已准备好的供给。控制台先核对并复用已有的匹配工具与依赖；没有的由控制台按本产品声明下载、准备、验真并保存到控制台工具库或依赖库，再交付本产品复用。本产品负责核验交付与自身需求一致并使用资源，不因控制台缺件或供给失败改为自行下载，也不另建同一资源的永久副本；可写包管理器视图与流程过程数据仍归本产品当前任务工作目录。

两种执行方式使用本产品同一声明、锁和流程实现，仅资源供给职责随执行方式改变。该职责适用于本产品全部平台与已实现流程；控制台本身作为产品同样适用。独立模式下资源缺失由产品处理；控制台模式下资源缺失由控制台处理。显式离线缺件、交付失败、损坏、错误摘要、来源漂移或越界必须据实失败，不自动升级、覆盖可疑原件或切换执行方式。

以上为当前职责规范；本次只更新文档，不代表现有资源协议与运行代码已完成接入或通过真实流程验收。历史记录中的“可选供给”或“产品负责缺件获取”仅描述当时实现，不作为当前职责依据。

本仓现行入口以`scripts/flows.json`及产品公开scripts实现为准；本文按日期保留的历史验收只描述当时结果，不作为当前工具、私有调用者或已撤销Publish实现的运行条件。独立塔塔门禁候选的职责和未验收状态见文末。

## 当前工作目录归属（第8步，2026-10-06）

本产品全部测试、编译临时数据和产物归 `<本仓根>/target`。多平台先使用声明中的完整平台身份，再在平台内按build、ci、release、publish、test、tmp隔离。独立入口与控制台调用消费同一产品流程；产品独立拥有需求与流程步骤；经控制台执行时，控制台按产品声明准备、保存并供给工具与依赖，同时创建任务、调用与跟踪。下载半包、工具编译候选、工程视图、Runner步骤临时状态和测试夹具均属于当前产品工作区；永久工具与依赖原件继续归原件库。整个根target不进入Git、源码快照、程序摘要或打包输入。准确流程短锁、活跃任务保护、成功产物保护和原清理规则继续适用。

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

## 厂家 Host / Client 已确认设计

### 一个工程、两个独立安装产品

- 一个 Flutter 工程，编译期选择 `host` 或 `client`；禁止安装后运行时切换。
- 分机的工程目标、目录与应用身份统一使用 `client`，不用 `employee` 或 `mobile` 代替安装产品身份。
- 当前入口为 `app/lib/main_host.dart` 和 `app/lib/main_client.dart`，构建必须显式选择入口；没有默认 `main.dart` 或运行时角色选择。
- 当前职责目录为 `app/lib/host/`、`app/lib/client/` 和 `app/lib/shared/`。`shared` 仅位于本产品工程内，不建立仓库级共享目录，不建立产品侧 CitizenSDK 封装。
- 唯一 Flutter 工程位于 `app/`。控制台厂家本机调用、CI/Release、源码清理、厂家打包权限文件、受控地图和统一图标路径已经同步。主机入口显式为 `main_host.dart`；图标本身、安装身份、原生运行数据位置和上游锁未因路径调整改变。
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
- 本机开发、CI与Release均使用原始声明及锁中的唯一CitizenSDK Git来源和准确提交；不编译邻仓工作树。
- 正式发布使用 CitizenSDK Git 依赖并锁定明确提交；Host/Client 使用相同提交，不能残留本机 path override。Git 地址和提交须从权威 SDK 登记核实，不能照抄过时示例。
- 只调用 SDK 公开接口，不修改、裁剪、替换或重复实现 SDK 内部功能；不增加产品侧 SDK wrapper，不提供只读或限制版替身。
- 钱包秘密输入、生成、导入和安全确认由 CitizenSDK 自己负责，厂家端不读取助记词或私钥，不向 ERPNext Web 容器暴露 SDK 秘密或任意签名能力。
- CitizenSDK 自身必要的轻节点数据库、钱包安全存储和原生库必须保留。Client 不携带“厂家业务数据库”不等于禁止 SDK 自身持久化，不能借载荷隔离裁剪 SDK。
- SDK 网络不可用与本地 ERP 服务可用性分别报告；不能因链网络暂不可用而关闭本地厂家业务。SDK 初始化能力不足不得使用假实现冒充成功。
- SDK 需要改进时，只提出问题证据、需要的公开接口/平台能力、复现条件和验收标准，由 CitizenSDK 线程负责。这里不修改 SDK，也不以厂家端复制实现绕过。

### CitizenSDK 当前公开消费边界

- 本机、CI与Release统一消费`https://github.com/crcfrcn/citizensdk.git`，根路径为`.`，准确提交为`0c442b4065ff1577e235cba76978749827d9f575`；声明与锁固定同一提交。宿主禁止`pubspec_overrides.yaml`与邻仓path依赖，工程准备器在本轮外部工作目录取得并验真Git原件，再通过SDK公开入口生成Pub消费视图。

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
- 组件测试不代替真实主机管理员登录、LAN跨设备和八包安装。功能全部完成后才执行第7步产品Build/Start/CI/Release/发布及真实验收。

## 当前平台声明与主机回归边界

### 第5步实现：四平台原生容器与安全连接

再次核对商家实际源码后，保留其一个工程/两产品、公开 SDK 消费及固定主机连接结构；其 `EmployeeLoginPage` 是 Flutter 业务适配器表单，不是厂家可搬用的 ERPNext 原生容器。未引入候选 `flutter_inappwebview`：证书错误事件本身不能覆盖所有连接的 pin 校验。现使用 iOS/macOS WKWebView、Android WebView 和 Windows WebView2 的产品原生接入，直接加载 Host 的 `/login`，不改上游业务或员工账户。

用户已确认移动身份，厂家Client实际声明与iOS Bundle ID、Android applicationId/namespace 统一为 `com.tuyufactory.client`。iOS16起、Android24起，ARM64，分别适配 iPhone/iPad 和 Android 手机/平板；两者强制 `main_client.dart`，不携带厂家主机系统。签名身份、描述文件、实际安装和设备权限保留真实验收，不由固定字符串冒充已签名。

- `FactoryWeb` 在固定主机验证后打开原生容器；私有 MethodChannel 只传公开身份、origin、正整数 generation，Windows 额外传受限 HTTP 请求/响应。打开单飞，关闭、断线、退出均回收传输；旧窗口结果只能关闭旧代次，不能提交旧 POST 或影响新页面。没有网页 JavaScript→SDK 桥，不暴露钱包、助记词或任意签名。
- Apple/Android 使用临时 `127.0.0.1` 高位端口的 TCP 密文转发，唯一远端是刚验证的保存地址与59460。该通道不终止 TLS、不解析 HTTP、不持有证书私钥、不开放代理协议。浏览器面对的仍是 Host 原证书；验证保存的固定 hostname、当前叶证书摘要、有效期及服务器用途。不是把 localhost 名称或任意自签名证书视为可信。
- Apple 两端共用 `app/macos/Runner/Web.swift`。WKWebView 与 WKDownload 使用同一 `SecPolicyCreateSSL(true, savedHostname)`/叶证书锚/SecTrust 实际验证；加载前的 WKContentRuleList 默认拒绝非当前 HTTPS origin 的资源。导航、弹窗、媒体授权和文件面板均检查来源与当前窗口。Cookie/CSRF 原样交给原生 WebKit 和上游，不读取凭据到 Flutter 登录表单。
- Android 仅对 `127.0.0.1` 配置空信任锚，避免系统公信证书绕开当前握手 pin 检查；其它网络域的系统策略不变，不改 SDK。空锚策略有[AOSP CTS 原始用例](https://android.googlesource.com/platform/cts/+/bb20ec7/tests/tests/networksecurityconfig/networksecurityconfig-nested-domains/res/xml/network_security_config.xml)依据。仅在当前 SSL challenge 中取真实 DER，完成摘要、自签名、有效期、SAN、服务器 EKU 与 critical extension 验证后才接受该证书；创建/关闭清除 SSL 决策缓存，过期失败关闭。不是无条件忽略 SSL 错误，也不是另一次探测后放行任意证书。
- Android 的同源 WebView 资源/导航限制与主机 CSP 联合生效，拒绝明文、本机文件和非主机网络。文件选择使用系统文档选择器，相机明确请求权限且使用受限 FileProvider；下载用同 pin/hostname 的 TLS TrustManager，最多5次同源跳转，64MiB以内完成临时下载后由用户选择保存。取消/关闭回收照片、URI 权限、网络及挂起回调。
- Windows Client 独占原生 WebView2 窗口。全部资源类别及请求来源先设503后挂起，Dart 用固定 IP、固定 hostname 与证书传输 HTTP；保留二进制 POST、原生 CookieManager 的 Cookie 和重复 Set-Cookie，不重放业务请求。未拦截网络指向占有但不监听的回环 HTTPS 代理端口，禁止代理绕过及非代理 WebRTC UDP；拒绝站外导航。初始化30秒、业务请求122秒超时。实际 WebView2 对注入 Set-Cookie 的行为与漏拦网络负向验收必须在 Windows 验证，源码测试不作替代。
- Windows CMake仅为Client编入容器，消费本次已验真的TUYUFACTORY_WEBVIEW2_PACKAGE及摘要；本产品scripts/dependencies.json唯一声明SDK 1.0.3537.50和Fixed Runtime 152.0.4191.62的官方HTTPS来源与SHA256，与既有登记一致，不升级。产品自己的dependencies.mjs只在准确Windows x64源码外任务根准备；CMake只回验归档字节并解包到当前构建根，不联网安装。
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

## Host / Client 长期验收边界

### 八目标产品侧打包隔离

五个平台工程必须消费显式入口与准确架构。Windows缺角色不再默认主机，Linux只接受显式host且Flutter官方目标必须匹配真实CPU；macOS取消默认Host身份，Assemble与Embed分别验证入口、TUYU_FACTORY_*、最终Bundle与可执行身份；iOS不再覆盖调用者的错误入口，手机/平板只接受client ARM64。Android缺少当前厂家任务或同源SDK投影时直接拒绝。名称、图标和初始化沿用既有实现。

`scripts/verify.mjs --package ROOT ROLE PLATFORM payload|signed`对已展开的桌面/Apple安装目录执行真实文件、原生身份、SDK组件与架构检查；CI明确使用payload检查，不向CI索取发布密钥，Apple正式资产增加系统验签。APK由`build_client.mjs`调用系统签名/清单工具验真并解析ZIP内容，原样复制而不重压缩。Mach-O同时检查ARM64和macOS/iOS目标，拒绝模拟器与fat混合包；PE要求x64/PE32+，ELF要求准确机器码。链接必须留在当前包内，Apple framework合法内部链接可遍历，循环、断链、特殊文件及大小写冲突拒绝。

主机需要完整厂家原生库、运行件、schema与上游资源；client拒绝厂家business、PostgreSQL、ERPNext/Frappe和厂家主机接口，包括改名后仍含主机导出标识的原生库。两者都保留完整SDK的Core/Host/平台插件及链资产，SDK自身数据库不列为禁止项。文件与头部检查不能单独证明SDK原生二进制的源码提交；实际同版投影仍必须由SDK公开交付与原生构建接入提供。

`scripts/build_client.mjs PLATFORM SOURCE OUTPUT APPLICATION payload|signed`只消费当前任务的已编译client输入，不调用Flutter、SDK构建、签名或发布。SDK各环境解析都必须对应声明与锁定Git提交及本次Pub视图，无本机覆盖或源码差异。输入先验、目标排他占有、复制后再次验真，失败只清理本次目标，不覆盖成功包。`--artifact PLATFORM SOURCE APPLICATION payload|signed`验证最终APK、AAB、IPA和桌面ZIP；AAB回读官方protobuf清单身份，Android正式ZIP逐个验证APK/AAB，Apple归档解包后再次检查实际App与签名，不能只凭资产名放行。

Windows主EXE使用既有AppUserModelID `TUYU.TuyuFactory.Host/Client`，SDK插件使用`com.tuyufactory`/`com.tuyufactory.client`，两种身份分别核验，不能混为一个字段。主机业务数据为`%LOCALAPPDATA%\TuyuFactory`，client连接资料通过既有path_provider位于`%APPDATA%\com\TuyuFactory`；WebView资料为`%LOCALAPPDATA%\com.tuyufactory.client\web`，SDK数据仍归各自应用身份。本次不改变既有业务数据路径。

Windows client只加载EXE旁data/webview2中的Fixed Runtime，缺失或路径经过联接即失败，不寻找系统Edge或接受环境覆盖。本产品prepareWebView2以固定摘要、CAB边界、全部成员、微软原生信任链、文件版本和PE x64架构验真；prepareWebView2SDK取得同一固定NuGet SDK归档。只清理本轮拥有且身份未变的候选。六个桌面Release直接导入同角色同平台CI实际入口，不使用不存在的ci.mjs；不改变发布签名、CI来源或归档校验。

Windows 10的非MSIX分发不能依赖构建机ACL随ZIP保留；启动前对固定Runtime逐对象合并两个AppContainer组的最小读取/执行权限，保留既有授权，拒绝目录联接、多硬链接和权限回读失败，不修改全局注册表或其它目录。Windows 11不额外更改权限。这是运行消费者代码合同，真实Windows启动仍需后续安装验收。

受控现有厂家主机/分机八目标流程使用显式角色、入口和架构；同平台CI与Release复用产品构建入口，Release再由产品生成最终归档，移动签名配置与清单统一使用厂家client身份。`prepare-sdk`不得调用塔塔Cargo、Pub或Gradle准备器，不得把依赖登记、工具版本或工具路径变成产品任务门禁。Apple、Android、Linux和Windows如何消费CitizenSDK均由产品入口决定；控制台只传递当前产品平台的固定缓存目录。

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

## 产品总览

### 途遇厂家端技术文档

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

#### 7. 工程与平台

- 产品支持范围固定为 `iOS`、`Android`、`macOS`、`LinuxARM`、`LinuxAMD`、`Windows`；缺少当前实现不得解释为删除、禁用或不支持平台。
- 统一 Flutter 工程：`tuyufactory/app/`。五个官方平台工程均已存在，iOS/Android为第5步新增Client工程；LinuxAMD主机构建链路须在第6步补齐，全部目标按第7步真实验收；当前 macOS 构建基线为 26.0。
- 原生边界：`tuyufactory/native/`，Rust `cdylib/staticlib/rlib`，负责秘密生成、PostgreSQL 生命周期、
  Frappe/ERPNext 监督、统一途遇管理员和实时组件状态。
- 应用标识：`com.tuyufactory`；用户可见中文名为“途遇厂家端”。
- 公网和局域网业务地址只允许 HTTPS/WSS。
- 外部调用方 的“途遇厂家端”一级页固定为同一外框内上下两行，主机端在上、分机端在下，中间横线分隔。
  主机与分机保持各自现有Build、CI、Release和Start的产品声明；Publish待后续独立重建。
  页面记录仅接受这两个产品，产品、平台、Run、Tag、版本状态和发布指针均独立。
- GitHub Runner 固定为 `macos-15`、`ubuntu-24.04-arm`、`ubuntu-24.04`、`windows-2025`，
  分别承接 macOS/iOS、LinuxARM、LinuxAMD/Android、Windows。主机端 macOS 与 Linux 工作流
  只检出 `.github`、`tuyufactory`、`tuyuserve/account`；ERPNext/Frappe 已随 `tuyufactory` 作为普通源码一并检出。
  Windows 不执行超级仓库全树 checkout：它精确获取目标提交对象，以 `git archive`
  只展开上述三个路径。脚本继续核验目标提交、subtree 来源清单、源码目录、Runner 架构和最终产物架构，任一不符立即失败，
  不允许用 x86-64 Linux 产物冒充 ARM64。
- 主机端四个平台的 Rust 1.97.1 安装均显式包含 `rustfmt`。LinuxARM 的 `aarch64/arm64` Runner 不使用无法确认该架构的 Flutter
  安装动作，而是由产品自身声明读取固定版本、官方提交及来源，按标签检出并核对准确提交。其它平台安装动作同样读取受控版本且安装后验真；工具登记、读取器与补丁进入CI缓存指纹。本机Worker固定已验真的受控Flutter/Dart。LinuxARM还须回读Dart
  可执行文件为 ARM64 后才进入构建。
- 厂家端使用 `tuyufactory-host.<platform>.<flow>` 与 `tuyufactory-client.<platform>.<flow>`
  受控控制器锁定同产品、同平台最近成功 CI 与正式版本，Runner 只验证该候选并全量构建；
  完整厂家仓各产品×平台×CI或Release保持一个独立顶层Workflow，只调用本仓scripts。
- 厂家端 CI、Release 与发布只能从 `外部调用方`（`调用方`）的厂家端按钮
  发起；禁止命令、网页或 API 直接派发。任一平台失败后必须先检查该 Run 的准确日志，在修复与
  本地合同验证完成前停止继续发起该平台及“全部”动作。

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

主机端 CI 与 Release 不接受外部语言层或数据库目录，也不读取途遇商家端安装包。运行包构建会自行
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

## GitHub CI 增量缓存（第 7.3 步）

厂家主机端与分机端各四个 CI 均已接入受控 CI 缓存合同，缓存按产品、平台和架构隔离；同为 macOS 或 Windows 也不共用槽位。源码不复制到缓存，生成目录使用 Runner 临时缓存；Release 继续全量构建。控制台接线完成不代表产品入口已补齐，也不代表这八个目标已经真实执行成功。

## Release 全量构建（第 7.4 步）

正式 Release 固定从干净源码执行全量构建，显式关闭 Rust 增量编译及工具链内置缓存，不读取CI作业缓存且不复用本机编译中间物。版本、签名、校验、产物和发布流程保持原有产品合同。
最近成功 CI 与正式版本由 外部调用方 在派发前锁定，Runner 只验证 `source_sha`、`ci_run_id`、`software_version` 与 `version_tag`；`CARGO_INCREMENTAL: "0"` 只属于实际 Release 构建 Job。

## 双仓统一流程最终收口（第 7.5 步）

本产品执行统一流程规则：本机编译中间物只进入本轮塔塔缓存库的build目录并按终态规则清理；GitHub CI 的作业过程数据只进入该次Runner任务空间；正式Release从干净编译状态执行。源码不进入塔塔缓存库、塔塔依赖库或塔塔产物库。

## 主机端、分机端控制台接入与产品实现边界

- TuyuFactory 与 TuyuBooking 一样拥有完整六平台产品范围：`iOS`、`Android`、`macOS`、`LinuxARM`、`LinuxAMD`、`Windows`。
- 控制台已登记主机端四平台与分机端四平台的完整流程，不再使用厂家端移动平台占位。统一身份始终是“仓库—产品—平台—流程”，不增加主机/分机第五维。
- CI、Release、发布各使用独立父按钮和三行弹窗：第一行“全部”横跨两列；主机端第二行 macOS/Windows、第三行 LinuxARM/LinuxAMD；分机端第二行 iOS/Android、第三行 macOS/Windows。每行上下左右对齐，点击弹窗外空白区域收回。
- 主机、分机每行均按编译、启动、CI、Release、发布排列；Build 与 CI、Release、发布分别聚合，
  macOS Start 独立显示。“全部”只包含当前产品、当前流程的四个准确平台，不混入另一产品或流程。
  全部编译只创建独立本机任务，不申请 GitHub 令牌；弹窗子按钮按全局最长文案等宽，全部跨满两列。
- “全部 CI/Release”使用远端批次；“全部发布”使用原生四平台队列，逐端准备候选、独立 QR_V1 授权并提交，每次推进清空上一端扫描响应。取消或失败即清空剩余队列，禁止一次签名发布四端。
- 本机主机端 Windows/LinuxARM/LinuxAMD 与分机端 Windows Build 只执行 Flutter bundle 检查并保存 `*.build.json` 成功记录，不是目标系统安装包，也不能在 macOS 上启动。正式安装包由对应平台 Release 构建。
- 分机端本机移动产物为 `ios.app.zip`、`android.apk`；macOS 成功 App 分别固定为 `TuyuFactoryHost.app`、`TuyuFactoryClient.app`。产物落入 `target/tuyufactory-host/<platform>/`、`target/tuyufactory-client/<platform>/`；目录只由真实任务按需创建，没有产物或受管状态的空壳在终态逐级回收。
- 正式 Release Tag 固定为 `<product>-<platform>-vX.Y.Z`；资产为同一产品平台前缀的 `.ipa`、`.tar.gz` 或 `.zip`。原生发布器只消费该准确 Release，移动分机进入对应应用商店，桌面产品更新自己的下载指针。Release 不自动发布。
- 本机版本状态只接受 schema 17 的唯一最终结构；旧厂家控制台任务、发布、版本与缓存记录直接删除。当前步骤未编译厂家产品、未派发 GitHub 流程、未发布，也未安装更新控制台。
- 发布预检统一将 GitHub 显示平台 `LinuxARM`、`LinuxAMD` 规范为路由身份 `linux-arm`、
  `linux-amd`；正式 Release 和 Workflow 记录共用该规范化结果。主机端与分机端相同的 macOS、
  Windows 平台继续使用各自产品路由、Tag、发布动作和状态键，不允许跨产品命中。

## 2026-08-30 Build与Start严格分离

- 本机 Build 只读取已登记产品目录中的源码，生成产物和任务记录；禁止复制产品源码到 外部调用方 受控目录。
- Build按当前平台合同完成编译及适用的签名、安装、回读；Start只消费同产品、同平台已验真的准确成功产物。
- 本产品拥有已接入Build、CI、Release和Start的完整实现；Publish待后续独立重建。
- Start 必须核验仓库、产品、平台、源码 Git SHA、产物路径与 SHA-256；任一身份不一致即拒绝启动。
- 受控本产品target成功产物区只保存通过验证的正式成功产物及必要校验清单；一次性工作数据进入`work`，下载依赖原件进入`cache`，源码不复制。

## 产品平台合同冻结（TUYU 第 3.1 步，2026-09-02）

- TuyuFactory 的公开平台闭集固定为 `iOS`、`Android`、`macOS`、`LinuxARM`、`LinuxAMD`、`Windows`。iPhone/iPad 归入 iOS，Android 手机/平板归入 Android；本步骤不新增移动端业务角色定义。
- Flutter 官方 `ios/`、`android/`、`macos/`、`linux/`、`windows/` 工程目录不改名；同一 `linux/` 工程应按不同目标分别产出 LinuxARM 与 LinuxAMD。架构、ABI、Runner 与 target triple 继续使用官方机器值。
- 本文早期只列三个桌面平台的内容记录当时实现和验收快照，不再定义产品支持范围。第5步已补iOS/Android工程及容器；LinuxAMD运行件源码已补齐，全部新目标的正式运行证据仍待完成，不据工程存在删除待验项。
- 本步骤没有修改源码、流程、真实目录、Tag、资产、数据库、签名或持久化 wire，也没有建立兼容别名。

## 本机移动编译后安装的实施边界（2026-09-03）

- 途遇厂家分机端（`tuyufactory-client`）的 iOS、Android 继续使用原有独立 build 任务；仓库、产品、平台、流程模型、按钮、状态及并行调度不变，不新增安装流程或全局串行队列。
- 受控源码已扩展独立原生请求及 Android 签名、保存、安装和身份版本回读链路。每任务的路径、占有关系、响应与取消独立；只在唯一合适设备时自动安装，零台或多台明确失败，不增加设备选择界面。
- iOS 受控源码已实现实际 prepare/install 执行链，使用现有工程的 Apple Team 与标准 Xcode 描述文件和本机签名配置，不新增配置体系；缺失、歧义或不适配时明确失败。本机校验签名、Team 和描述文件，设备只回读 Bundle ID、版本和构建号，不声称可以回读设备中的证书。受控原生定向测试已通过，但真实签名安装验收尚未完成，不能据代码落地宣告设备安装成功。
- 安装失败保留有效受控产物，不自动卸载、清数据、降级或更换签名；本步没有手动仅安装重试入口，再次点击编译仍执行编译。安装后不自动启动，CI、Release 与应用商店发布不变。
- 已确认分机入口为 app/lib/main_client.dart，不是旧 desktop 路径；app/ios 和 app/android 平台工程仍缺失。受控登记与合同覆盖不代表厂家移动工程可用，本次没有创建这些工程或验证真实安装身份。
- 本次受控测试通过不代表实际运行的控制台已更新，也不代表已完成设备签名或安装。具体测试、门禁阻塞与清理证据见现有任务卡；自动安装总体任务仍未完成。

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

LinuxAMD Release 登记引用的 `tuyufactory/scripts/linux-amd/build.sh` 已由厂家Linux任务补入，准确平台声明与ARM入口共用 `scripts/build_linux.sh`。AMD64 Node 25.2.1 来源已锁定，尚未完成真实Linux构建；共享窗口标题和入口存在都不等于安装包已验收。本项不改名称任务、初始化或受控流程。

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

### 2026-09-05 分机原生SDK的受控Rust登记

厂家分机iOS、Android、macOS的Build/CI/Release补齐Rust需求；Windows分机仅CI/Release补齐Rust，本机公共代码编译范围不变。复用Worker现有受控RUSTC及PATH注入，不修改SDK或用户默认工具链。厂家主机原有Rust登记保持不变。与商家及共用环境相关的40项回归通过，不代表厂家各平台实机编译验收完成。

### Android 共用 SDK 工程隔离

厂家与商家消费同一个 CitizenSdk 原生构建入口。独立 AAR 的根工程和 native 工程位于当前任务的 Gradle 工作目录，Manifest、Kotlin、CMake、资源及测试输入继续只读引用原 SDK；不复制 SDK 源码，不扩展源码写权限。此共用修复不改变厂家业务界面、钱包 API 或平台登记；厂家安装验收须与商家分别记录。

### Flutter 独立缓存工程视图（2026-09-10）

厂家主机与分机共用真实 `tuyufactory/app`，但所有平台按产品身份使用各自固定缓存叶子。Flutter工程视图由本产品公开入口建立，生成状态统一进入 `build/`、`dependencies/` 与 `tmp/`；主机和分机、不同平台之间没有共享可写目录。厂家产品自己的入口、依赖和原生 SDK 决定权不变。

分机 Android 的 Flutter/Pub 阶段在缓存根生成 `local.properties`、插件清单与 SDK 投影，Gradle 阶段固定从 `<本仓根>/app/android/` 真实根启动。设置与应用 Gradle 读取当前缓存 Flutter 根；项目缓存、依赖缓存和构建输出仍全部留在分机 Android 缓存，不再由跨根设置脚本链接改变 Gradle 根身份。

Gradle 9.1需要受控 Flutter 插件 included-build 根目录可写；这里只开放该目录自身，插件文件仍只读并保持摘要验真。任务级初始化脚本把插件构建输出导向厂家分机 Android 缓存，Gradle命令关闭 Problems Report，禁止源码根生成 `android/build/`。
## 2026-09-11 本机生成状态清理

厂家端源码不再保留 `.dart_tool`、Flutter ephemeral、`Generated.xcconfig`、`flutter_export_environment.sh`、Android/iOS/macOS PluginRegistrant、IDE 状态或插件生成清单。已删除的 iOS 环境文件包含本机绝对路径，只能由后续真实任务在本产品调用方提供的规范源码外工作目录 重新生成；产品源码及Gradle Wrapper保留；正式声明与锁统一到同一Git来源，禁止本机pubspec_overrides.yaml。
### 产品流程物理归属

本仓`scripts/flows.json`声明现有产品、平台与流程身份，完整调用入口由本仓scripts拥有。Build使用产品完整execute入口；CI与Release使用本仓`scripts/flow.mjs`。已接入Start由产品声明与产品实现负责，未接入动作不由文档新增；Publish等待后续逐产品重建。外部调用者读取当前声明、创建与跟踪独立任务，不维护产品流程的第二实现。

## CI与Release入口归属

本产品CI与Release由所属仓当前`scripts/flows.json`的remote_routes及各平台Workflow声明定位，完整执行入口为本仓`scripts/flow.mjs`。控制台读取当前声明、创建原有真实任务、获取准确仓权限并跟踪原Run；旧控制台CI/Release Shell与Swift执行文件已删除，不作为入口。

## CitizenSDK统一边界复查（2026-09-15）

TuyuFactory Flutter主机与分机都直接依赖CitizenSDK并实际调用`CitizenSdk.open()`，钱包初始化与设备轻节点边界
正确，产品内也有测试禁止第二层CitizenSDK包装。厂家原生主机通过路径依赖复用`tuyuserve/account`，因此继承
该模块自建签名摘要与sr25519验签的偏差；`native`中的`schnorrkel`当前仅为测试依赖，但测试同样不应形成第二套
密码学金标实现。厂家业务授权、安装实例和数据库继续归TuyuFactory，签名/验签实现最终必须收口到CitizenSDK
公开能力。本轮未修改该运行路径。

## 独立 GitHub CI 与 Release 工作流

本产品每个实际产品、平台、流程身份使用下列独立文件，主 Job 为 `flow`；CI 验证源码，Release 生成正式产物，本步不实现Publish，发布待后续逐产品重建。

- `.github/workflows/tuyufactory-client-android-ci.yml`
- `.github/workflows/tuyufactory-client-android-release.yml`
- `.github/workflows/tuyufactory-client-ios-ci.yml`
- `.github/workflows/tuyufactory-client-ios-release.yml`
- `.github/workflows/tuyufactory-client-macos-ci.yml`
- `.github/workflows/tuyufactory-client-macos-release.yml`
- `.github/workflows/tuyufactory-client-windows-ci.yml`
- `.github/workflows/tuyufactory-client-windows-release.yml`
- `.github/workflows/tuyufactory-host-linux-amd-ci.yml`
- `.github/workflows/tuyufactory-host-linux-amd-release.yml`
- `.github/workflows/tuyufactory-host-linux-arm-ci.yml`
- `.github/workflows/tuyufactory-host-linux-arm-release.yml`
- `.github/workflows/tuyufactory-host-macos-ci.yml`
- `.github/workflows/tuyufactory-host-macos-release.yml`
- `.github/workflows/tuyufactory-host-windows-ci.yml`
- `.github/workflows/tuyufactory-host-windows-release.yml`

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

本产品正式Release主flow Job实际创建GitHub版本，contents权限准确为当前仓write；辅助Job与其它权限保持原登记。源提交、成功CI、版本及资产验真不放宽，不派发发布。 厂家八端Release先通过本端执行器登记RUNNER_TEMP物理根中的tuyufactory-<host|client>-<platform>-release；资产不进入源码。与源码交叠、旧.release、路径别名、错产品平台或已有资产必须拒绝。Client占有与清理保持排他创建和设备号/索引，Host构建及上传复用同一准确目录校验。Windows只验真唯一checkout取得的完整产品SHA，不再归档旧聚合子树。既有每端测试执行真实登记、占有及清理，覆盖成功、越界、错身份、已有资产与错误清理保护，不编译或读取真实发布凭据。
## 完整产品组织与执行合同

所有者：`tuyufactory`，正式源码根 `<本仓根>`；本说明属于该完整产品。组件不会拆成独立仓库或目录产品。所有执行身份统一为 `产品.平台.流程`，单平台物理目录省略平台层，执行身份仍保留真实平台。

真实平台目标：`host-macos`、`host-windows`、`host-linux-arm`、`host-linux-amd`、`client-ios`、`client-android`、`client-macos`、`client-windows`。

推送门禁唯一源码位于 `<本仓根>/.github/tatagate/`，GitHub入口 `<本仓根>/.github/workflows/tatagate.yml`。控制台先从本仓已保存提交执行这份门禁，通过后推送准确SHA；GitHub main push再执行同一提交的门禁，控制台核对所属仓、Workflow、main、SHA、Run和attempt，只有success并再次回查main一致才完成推送。失败、取消、超时或身份漂移均不得显示成功，不自动重试或派发CI/Release。

技术文档由所属完整产品仓根唯一持有；私有规则和任务库由控制台私仓持有，公开产品不读取它们。公开门禁不依赖私仓资料、安装包源码、其它本机产品或个人账号；必要链真源只读本仓明确固定的公开40位SHA，不在门禁中跟随main。本机开发跨产品验收仍比较三仓已保存快照与各端真实镜像。


### 门禁与开发审查职责

准确中文注释按开发阶段逐项复核，不以保留源码每文件包含汉字作为仓库门禁的开发凭证。初始完整内容、生成文件和上游原件保持原文；真实第一方临时注释、机密、源码输出、Workflow、依赖和适用测试仍由本仓同提交门禁验真。公民门禁只把scripts中的Node命令行结果报告识别为CLI输出；本仓实际执行测试的准确协议拒绝断言不属于新运行协议，字符串、注释、模板和未登记测试中的同文不豁免。保存及推送仍逐仓独立授权，并以本机门禁和同SHA的GitHub门禁双成功为唯一终态。


### 固定产物产品目录


## 产品介绍与开源许可

根目录 `README.md` 仅提供本产品简明介绍，不承载技术方案、任务记录或验收结论。独立自有代码采用根 `LICENSE` 的MIT；上游代码、衍生修改、依赖及组合分发遵循各自原许可、版权、例外与附加要求。
Frappe为MIT，ERPNext为GPL；准确源码与许可路径由现有sources清单登记，MIT不覆盖上游要求。


### 本机Build代码所有权

本产品的scripts/flows.json声明自身平台、准确工具版本、原始锁以及既有CI/Release入口；scripts/build.mjs独立实现requirements、prepare、build三个阶段，拥有工程准备、编译命令、候选验真和失败条件。产品只消费调用方交付的公开资源回执，按本仓原始锁取得依赖，所有生成状态进入规范源码外工作目录。平台或资源身份不符、版本错误、缺锁、链接越界、归档摘要错误、旧工程复用或编译器失败均立即失败。

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

本产品的scripts/flows.json声明自身平台、准确工具版本、原始锁以及既有CI/Release入口；scripts/build.mjs独立实现requirements、prepare、build三个阶段，拥有工程准备、编译命令、候选验真和失败条件。产品只消费调用方交付的公开资源回执，按本仓原始锁取得依赖，所有生成状态进入规范源码外工作目录。平台或资源身份不符、版本错误、缺锁、链接越界、归档摘要错误、旧工程复用或编译器失败均立即失败。

本产品平台闭集为`host-macos`、`host-windows`、`host-linux-arm`、`host-linux-amd`、`client-ios`、`client-android`、`client-macos`、`client-windows`。调用格式为`node scripts/build.mjs <requirements|prepare|build> <platform> --work <绝对工作目录>`；requirements只读并输出唯一JSON，prepare/build从标准输入读取schema=1的资源回执。调用方交付准确工具执行器、锁定依赖目录、Git来源和归档后先prepare，再读取展开来源新增的需求，完整交付后执行build。准备、展开和编译属于同一调用工作根，各平台互不共享可写状态。独立调用方按本仓声明准备资源即可运行，无需读取其他产品工作树或私有资料。

Git依赖只接受本仓声明与锁一致的HTTPS地址及40位固定提交；原生归档只接受本产品锁定坐标及完整SHA-256。工程副本排除旧生成物，内部文件链接重映射到同轮副本，外部链接与已有工程拒绝。原始依赖缓存必须显式交付，不能落入用户默认缓存；离线编译禁止隐式取得缺失资源。已有CI/Release Workflow仍各自调用本仓scripts，不受本机可视化入口是否存在影响。入口回归由本仓`scripts/build.test.mjs`负责，适配与资源服务的验证不替代产品编译和真实候选验收。


## 2026-10-06 产品自主资源阶段（第2步）

本仓`scripts/resources.mjs`拥有工具准确来源/版本/配方、递归锁解析、缺失获取、验真、复用和本轮依赖准备；`scripts/build.mjs resources <platform> --work <绝对外部工作根>`调用同一实现，独立入口为`resources.mjs <platform> --work <工作根> [--offline]`。前者从stdin读取公开身份回执；后者允许空请求。最小宿主必须使用本仓声明的官方Node25.2.1绝对入口，本机配方限定macOS ARM；资源阶段回读官方发行归档与运行Node字节，不能从PATH取同名程序。工作根预先存在、位于源码外且不经过链接。

现存`PRODUCT_TOOL_ROOT`与`PRODUCT_DEPENDENCY_ROOT`是工具和依赖的只读路径输入，本身不能完成控制台缺件准备与交付。当前供给职责按本文“工具与依赖的声明和供给职责”执行：经控制台运行由控制台准备、保存与供给，独立运行由产品自行处理；源码外`~/.local/share/product-resources`仅描述现存独立资源存储，本轮可写状态仅在work。GNU Bash/grep/sed纳入自身需求；发行件旧Shell仅用于声明中的首次GNU构建，不进入正式PATH。下载/源码工具编译不持全局锁，最终不可变对象提交使用短锁，取消传递到工具进程组。错误摘要、损坏、未锁来源、路径越界和显式离线缺失失败并保留可疑原件。

Pub/npm/Cargo按原始锁准备；Git按固定HTTPS提交检出，Git Cargo目录源展开workspace继承并锁定相对包版本；CocoaPods按准确锁摘要恢复验真快照，缺失spec校验规范摘要，未锁源码来源拒绝取得。Android固定包与修订归产品；额外平台仅消费官方固定发行来源与发行树摘要，不借宿主历史SDK目录。Maven供给只读验真后复制到独占Gradle缓存，由产品准备现有配置，消费仍离线；全库坐标导入与旧目录清理留到第5步。

`PRODUCT_WORK_DIR`、`PRODUCT_BASH_BIN`、`PRODUCT_RSYNC_BIN`及`PRODUCT_SOURCE_DIR`是公开工作/工具/工程入口；Flutter修订不读取调用方私有变量，也不回退系统rsync。旧Flutter补丁对象与当前配方不符时拒绝复用，真实替换须按准确资源操作另行授权。本步不改变编译、签名、安装及回读顺序，不修改产品UI，也未执行真实工具下载/安装。受控资源测试不能代替官方首次取得、正式编译或最终真实运行验收；第4至7步仍待逐步确认实施。

资源原件按完整内容验真后整体提交：Git bundle与固定来源/摘要回执处于同一个不可变对象，不暴露中间状态；可选依赖供给读取`objects/<SHA256>.blob`。锁解析器、源码工具依赖与官方有序补丁也从同一产品原件存储复用。Pod spec每次按锁中的规范checksum回验，Git tag只核对发行声明并消费本产品预锁提交；HTTP发行件消费固定SHA256，首次源码准备命令来自该已验真spec并由GNU Bash执行。spec、准备后源码与文件清单整体提交，再复制到本轮缓存；供给索引不决定产品版本。正式PATH排除旧POSIX Shell，`sh`对应已验真的GNU Bash。

独立缺省资源目录内`tools`保存工具发行件及工具编译输入，`rely`保存产品依赖的归档、Git和Pod原件；工作区只承载本轮可写视图。根据用户最新要求，分步骤先完成实现与用例，整项解耦任务完成后统一测试；本步实施记录不等于真实工具首次取得、完整Build或安装验收通过。


### 第3步：产品完整Build入口（2026-10-06）

本产品的正式完整入口为已锁定Node的绝对路径调用`<本仓根>/scripts/build.mjs execute <platform> --work <已存在绝对工作根>`，可选`--offline`。输入stdin可为空；调用方可传schema/product_id/platform/work及真实run_id/program_digest，禁止私有变量或执行命令。入口内部完成需求→资源→准备→再次需求/资源闭包→编译→适用签名/安装/回读；独立与控制台调用同一实现。最小引导Node只启动本产品的资源引导器，产品按自己的官方Node声明验真、准备并重入，控制台运行Node不决定产品Node版本。

标准输出只有唯一有界JSON：schema、product_id、platform、work、completion、files及可选真实run_id。completion沿用固定平台的device-install/macos-artifact/compile-only；files按本产品flows.json登记路径和SHA256。编译日志使用stderr进入现有任务日志，不新增资源任务或任务状态。完整结果只在各阶段成功、源码/锁不漂移、工具进程确认退出后落入本轮build-result.json；同根并发或复用旧结果拒绝，取消/失联/错误身份/损坏候选不得成功。

控制台每次Build直接读取本产品当前flows.json入口，调用一次execute；控制台只跟踪真实任务、核验公开结果和保存产物，不解释产品工具、依赖、编译参数或设备规则。当前控制台静态菜单、其它产品流程/安装器与程序摘要的历史耦合仍归第4步解除，本步不能当作整项解耦已完成。

Android开发材料读取和仅首次创建可由专用PRODUCT_HOST_FD=3提供，原生端仅保管既有DEV_KEY；产品自身负责材料解析、工具、临时密钥、Release包签名、证书/版本核对、先直接USB安装以及多USB分支逐台安装回读。独立调用由产品自己的Keychain保管开发材料。材料不写入公开结果或日志，临时密钥只在工具确认退出后删除。iOS归档由产品解包并验证唯一Runner.app、原始Release配置、Apple签名profile、团队/设备授权、代码签名和entitlement，再完成主动真机探测、防降级、安装及bundleVersion回读。控制台不再包含LocalMobileTask/MobileSecurityManager执行链。

产物保持固定android.apk/ios.app.zip；控制台通用artifact能力在产品验真后、设备安装前保存候选，保存失败阻止安装，安装失败不伪造成功。iOS profile/entitlement原生用例迁入本产品Swift验真器测试；统一验收须显式交付产品锁定Xcode的PRODUCT_TEST_SWIFT及PRODUCT_TEST_DEVELOPER_DIR，缺失时测试失败，不静默跳过。

本步同步完整入口、失败/取消/并发、结果/路径/摘要及适用移动端用例，但未运行测试、语法检查、编译、签名、安装或工具下载/替换；全部实现步骤完成后统一验收。源码交付与用例存在不代表真实Build已经通过。


### 第4步实施中：远端路由当前声明

CI/Release的规范身份、标题、版本前缀和正式版本记录标志已迁入所属仓现有scripts/flows.json的remote_routes。调用方按固定已接入动作重读当前声明；原生授权与流程查询不再使用编译期产品路由常量。产品声明只提供数据，不授予凭据、扩大平台矩阵或新增按钮。损坏、重复、越仓、字段越界及超限拒绝。

本次同步路线读取、热更新和失败边界用例，未运行测试、语法检查、编译、签名、安装或下载。第4步仍在开发中：Publish执行器、聊天安装器、Start、固定菜单声明与完整程序摘要的其余实际耦合尚未解除，不能报告该步或整项任务完成。


第4步Start实施：既有5个macOS启动动作已调用所属产品当前scripts/flows.json登记的scripts/start.mjs。产品准备自身准确Node、受控POSIX与Apple工具，验证成功App与真实可执行文件、候选摘要和声明，再启动；调用方仅传成功产物规范路径并通过PRODUCT_RESULT_FD接收单一有界公开结果。启动目录使用产品源码外临时目录，不建控制台Start缓存。公民链保留已有节点窗口激活顺序，首次启动才准备当前17.11 PostgreSQL，原开发数据路径、端口、TLS及内嵌前端参数仍由产品保持；无需控制台或Homebrew。此处描述源码实现，尚未执行用例或真实启动，第4步仍未完成。

### 产品远端完整入口

本仓`scripts/flows.json`的`flow_entry`定位公开`scripts/flow.mjs`。`run ci <platform>`和`run release <platform>`分别执行同一产品流程，当前读取本仓Workflow与路由；Release的`version_source`声明准确版本文件类型和相对路径。成功CI选择、同源候选复用、版本递增、正式Release验真与旧Run/Artifact清理均由本产品入口完成。独立执行只需等价的本仓短期GitHub权限；没有宿主控制管道时入口自行跟踪Run，不依赖其它产品程序。

可选`PRODUCT_CONTROL_FD=3`只接受当前Run绑定确认、候选持久化确认和二值远端终态；令牌仅进入HTTPS请求头，未知身份、越仓、无成功CI、候选错源、控制帧错误、超时或取消均失败。宿主重启后的`recover`使用同一公开入口核验原Run、原候选并清理，不重新派发。公开控制协议不携带私有调用方变量，现有授权及用户操作顺序保持。源码、声明或Workflow在本次流程期间变化将拒绝继续。

相关正常、失败、身份、版本来源、独立远端跟踪、候选重试和真实控制管道边界用例位于本仓`scripts/flow.test.mjs`；当前只完善源码，尚未运行用例或远端操作。

本机固定菜单不再登记Start源码与产物，也不保存Build产物文件名或验真相对路径副本。执行时读取所属产品当前Start声明及Build的files、verificationPath；产品修改自己的App名称或可执行文件路径无需重编译菜单，原有平台完成方式及产物摘要收口保持。相关用例已同步，尚未运行。


### 产品软件记录与正式版本恢复

本仓公开`scripts/flow.mjs records`使用准确同仓短期GitHub权限，重读本仓当前路由，复用远端流程同一Run保留器并确认实际删除，再读取各平台最新正式版本。来源合同归本仓release.record_source：按实际产品选择Tag、单包正文或正式元数据资产验真，标题、版本、源码与适用不可变标志不能由调用方推测。准确元数据资产仅经官方HTTPS地址读取，跨主机不转发仓库令牌。正式资产和Tag不会在记录刷新中删除。公开结果仍是records/removed_run_ids，原记录页行为保持。

`recover`不重新派发；重新核验原候选、成功CI、原Run终态、正式资产来源与Tag，输出formal_release/removed_run_ids。控制调用方仅绑定原任务身份、原候选和产品公开回执，更新现有持久发布目标；产品验真算法不再随调用方程序编译。相关正常、失败、错资产/正文/来源、重定向隔离、独立记录刷新和恢复用例源码归本仓flow.test.mjs。

资源工具取消、超时、输出超限和异常收尾均等待主进程与整个后代组退出；无法确认退出时保留工作根和候选，禁止删除输入或改为可写。真实取消退出顺序用例仅写入resources.test.mjs，尚未执行。


### 发布实现范围

本轮新增产品发布实现已撤销，发布功能由后续逐个产品重建。现有操作入口与界面保留，当前不提供已删除实现的执行保证；Build、CI、Release和Start继续按各自现有入口运行。


### 产品独立资源与唯一依赖供给

本产品的scripts/resources.mjs独立拥有需求解析、准备配方、来源与摘要验证、可写视图和失败条件。独立执行时由产品获取、保存与复用缺件；经控制台执行时由控制台按产品声明准备、保存并供给，产品核验并使用。PRODUCT_DEPENDENCY_ROOT仅是现存只读路径输入，缺少路径或原件不得在控制台执行模式下触发产品自行下载；实际供给接入仍需代码改造与验收。依赖索引读取仅接受schema_version=2及packages、git_sources、pods，不恢复旧目录或整锁快照。

Maven的具体JAR、AAR、POM、module及分类器文件统一由packages的group:artifact、version、准确上游URL、SHA256和SRI定位objects中的原件。产品在本轮work/dependencies/maven按上游分区复制独占文件；不复制Gradle二进制元数据、锁和下载状态。产品生成本轮GRADLE_USER_HOME/init.d初始化脚本，只在自身已声明的同源仓库之前加入本轮原件视图，缺件仍按产品原仓库解析，明确离线则失败。Gradle解析、工程状态和后续编译都属于同一产品任务。

Pod由pods中的name、version、checksum匹配当前Podfile.lock；spec保存官方CDN地址和原件摘要，source保存官方podspec来源，files保存发布树相对路径、文件内容摘要与权限或安全内部链接。只物化本产品所需的单个发布坐标；其它Pod、整锁、平台或宿主变化不要求复制全树。产品仍按CocoaPods官方规范回验SPEC CHECKSUMS，再验证本产品预锁定Git提交或HTTP发行摘要与源码回执。可写缓存和工具VERSION仅在本轮work产生，不能写回共享原件。

错来源、摘要、重复同源内容、生成状态、硬链接、内部链接越界或循环、取消及任务副本漂移均据实失败。独立与控制台调用使用同一实现；控制台只提供可选原件并跟踪原有任务，UI、功能、按钮、平台与操作顺序保持。用例源码已同步，执行留待整项实现结束后的统一测试。


### 独立入口回归验真边界

资源回归使用自带固定提交、源码字节和spec的合成Pod，不借用产品真实Pod清单提供测试输入；无真实Pod需求的平台也验证来源、摘要、链接、循环、取消和物化失败。测试现场仍位于本产品target的准确平台，不写源码或其它产品目录。资源声明与生产依赖坐标不因测试夹具改变。

Start只接受当前产品声明所对应平台target内的真实App目录；拒绝源码、其它平台和链接候选。产物验签、声明及可执行文件回读、前后摘要、取消处理和原启动顺序保持。

Apple验真器回归显式使用已验真的锁定Xcode及其SDK；官方swift入口允许包内链接，但规范目标必须属于同一Xcode且为有执行权限的普通文件。不得因此借用PATH或另一套工具。

资源取消对同一真实进程组每轮只发送一次信号；组不存在或Windows时才发送给主进程。仍等待主进程和后代实际退出，8秒未退出才强杀，12秒仍未确认则保留现场并失败；取消不能成为成功。

Apple验真器测试由同一锁定Xcode的swiftc编译实际XCTest Bundle，使用该包随附XCTest框架与Swift overlay，再由同包xctest执行；必须回读5项测试全部成功，空测试套件不得算通过。Bundle、模块缓存和临时输出仅归本产品target准确平台。


### 门禁官方归档字段与平台命名边界（2026-10-07）

平台禁用值继续来自本仓既有门禁登记。仅scripts/resources.mjs的唯一规范toolDefinitions声明内、唯一Flutter工具的archive.url可以按对应数字版本核对官方稳定版macOS归档；source、root和executable必须匹配原有官方坐标。识别后仅从平台扫描输入移除该URL，原资源源码、工具版本、来源及依赖锁均不修改。重复声明、重复键、转义或不可解析字面量、错版本、错来源及错形字段不予豁免；其它工具、字段、源码、注释和目录中的旧平台标识继续拒绝。

既有门禁测试覆盖本仓真实资源声明、官方字段、伪造来源和字段、歧义字面量、额外源码、旧平台注释与目录；全部夹具只在本产品target真实平台测试目录生成，并在finally清理。工作树诊断与绑定已保存提交SHA的正式门禁分别记录，不能将缺少Git跟踪文件的工作树冒充正式通过。

当前完整门禁回归11/11通过，失败/取消/跳过/待办均0；本仓真实根技术文档、机密扫描及平台命名检查通过。完整资源源码和补丁边界、既有链接/临时目录/根文档夹具的失败已消除。测试及工作树检查不代替绑定已保存提交SHA的正式门禁，也不代替产品真实Build、签名安装及启动验收。本轮自有日志与夹具在结果记录后按原规则删除。


### 补丁原上下文与测试夹具边界（2026-10-07）

平台扫描只对scripts/resources.mjs中唯一规范flutterPatch JSON字面量执行原上下文识别：补丁登记字段严格为path、sha256、source；path为flutter.patch，source为Flutter官方固定40位提交，正文首行固定来源必须一致，全文SHA-256必须匹配本仓登记。仅当native_assets_host.dart准确文件、hunk及lipoDylibs邻接上下文唯一匹配时，从扫描副本移除那一行已核对的上游原注释。实际资源源码和补丁正文不修改；其它补丁行、源码、字段和目录继续完整扫描。错误来源、摘要、重复声明、非规范转义、上下文漂移和新增旧平台文字均不豁免，不跳过整段补丁。

既有门禁夹具以unlinkSync删除测试目录中的链接自身；测试临时目录仅调用本仓唯一testRoot，无旧API别名。机密扫描夹具生成本仓必需的合成根文档，原文档检查及拒绝断言保持。补丁正常、错源、错摘要、错形、重复、上下文外残留等边界同步在既有test.mjs，现场在本产品target内并由finally清理。补充实现后的统一门禁验收已通过，正式提交门禁及产品真实Build/启动验收仍待完成。


本产品scripts/build.mjs的模块初始化与CLI执行分离：私有异步runCLI承载原命令主体，仅在直接执行文件时启动，拒绝时输出错误并以退出码1失败。模块求值先完成，scripts/resources.mjs可反向导入同一checkWork、requirements和平台校验，不复制实现或增加启动入口；普通import不启动CLI。现有公开参数、JSON请求、--offline、锁定Node验真和必要重入、资源/准备/编译/适用签名安装回读步骤以及取消与结果合同保持。离线缺件和非法输入必须真实失败，禁止以未完成顶层await退出替代完整结果。对应真实CLI回归只在自有target测试现场替换资源供给边界，验证反向导入、参数与错误传播，不据此声称实际产品编译通过。


本产品scripts/resources.mjs的普通inventory清单保持独占文件要求；工具原件toolInventory复用同一扫描实现，只允许全部真实名称均位于同一规范payload内的硬链接组。扫描按dev/ino分组，实际名称数量必须与nlink闭合；工具普通文件以O_NOFOLLOW打开，打开及读取后复验身份、计数、权限和字节相关元数据，扫描结束再回读全部目录、文件及链接身份与规范目标。原件外额外名称、目录或链接越界、特殊项、读取期间替换/权限/内容变化均失败。清单仍逐路径保留原有path/sha256/executable或directory/target格式，继续由既有回执、准确官方归档/版本、配方和编译输入证明验真；regular与其它资源默认独占校验不放宽。不新增公开命令、参数、声明字段或原件登记，不改版本、锁、配方和工具原件，不以拆分内部链接、重新安装或下载解决验真。回归复制本仓完整实现到所属target测试现场，仅替换文件IO边界以确定性制造读取变化，并在夹具内暴露已有私有验真函数；纯合成对象覆盖正常、拒绝与回执漂移，不据此宣称真实工具或产品编译通过。


本产品资源验真将下载运输元数据与源码工具编译身份分开：仅在源码工具证明和本产品声明的比较副本中，验证并移除archive.mirrors与upstream_patches各项mirrors。镜像须为非空、无重复、无控制字符/空白、无账号/口令/片段的准确规范HTTPS地址数组；错误格式直接失败。官方来源URL、版本、归档字节摘要、kind/root/executable、补丁来源/摘要/顺序、前置与依赖闭包、其它位置同名字段及未知字段继续严格比较。Xcode/POSIX输入、recipe.source和source.archive/source.gem摘要、原回执清单及入口独占规则不变；比较不改写原证明、声明或回执，不改变原件/登记/配方/版本/锁和实际下载策略，不读取控制台登记作为产品版本或策略来源。既有回归使用完整本仓资源实现及纯合成物理证明，逐次重算清单，验证运输差异可复用与真正输入漂移必须失败；测试不启动工具或冒充真实编译交付。


## 独立塔塔门禁与资料回归

本仓 `.github/tatagate/index.mjs` 是本机与GitHub共用的唯一门禁实现，`contracts.json`只登记本仓准确GitHub身份、已有流程与真实Node入口。GitHub在本仓main推送时自动运行 `tatagate.yml`，检出并核对该push的同一已保存SHA；其它仓库的工作树、门禁、私有规则和人工开发凭证均不是输入。

门禁检查独立Git根、准确HTTPS origin、当前受检提交及提交范围；本机只接受main，远端只接受准确仓库的main push。源码语法、真实代码注释上下文、临时残留、传输来源、所属根技术文档和受控测试登记分别检查。实现变化必须在同一范围同步所属文档与有内容的回归差异；空白调整不构成同步证据。代码与资料的语义、注释是否准确、回归是否覆盖产品功能仍须由本仓开发与最终真实验收逐项复核，非空文件或摘要不能证明业务正确。

Node清单从本仓Git已跟踪的真实测试逐项核对，漏登记、重复、失效和空入口失败；执行时必须有每份登记文件与最终汇总的完整成功回执。零用例、漏文件、失败、跳过、待办、取消及重复汇总均失败。所属产品流程、声明、资源版本与Workflow权限的回归归本仓 `scripts/flow.test.mjs`，不让其它仓库代验本产品。

门禁的工具与依赖需求、固定来源、准备配方、完整验真及同版复用合同统一由本仓 `scripts/resources.mjs` 拥有；门禁只调用公开接口，不维护第二份工具版本或配方。按当前职责规范，独立执行由产品获取和保存资源，经控制台执行由控制台准备和供给；下述既有接口与验收记录不代表控制台供给接入已完成。`prepareGateResources`准备本仓独占资源现场，`verifyGateResourceDelivery`回读准确来源、完整对象、执行器、宿主闭包和工作环境，`gateResourcePlan`从本仓既有声明派生来源。既有tools模块如存在仅转发产品资源接口。Linux门禁新增Ubuntu 24.04 x64宿主交付，macOS门禁复用本仓既有生产资源准备；不改生产流程顺序、工具版本、产品原锁或不可变原件。

固定Git输入只从本仓声明或门禁明确的40位提交取得，不消费其它产品当前main。独立执行的依赖原件归产品独立资源库，经控制台执行的依赖原件由控制台保存供给，任务缓存和编译数据归本轮target；已有多平台产品按本仓首个登记平台的test现场分配，单平台使用target/test。`gateLanguageView`使用受检Git快照与产品现有安全解包器物化本轮target工程视图，正式源码、声明和锁只读；Git包仅在任务视图元数据中投影为已验真的固定输入。

`ownedLanguageTests`按本仓已有原锁与公开入口派生适用语言调度，`validateLanguageResult`核对实际非空执行结果。有Cargo锁的工作区执行离线原锁的全部测试目标及文档测试；Flutter项目执行原有正式测试入口或完整analyze/test；已有Vitest业务套件与TypeScript公开回归实际执行。Node依赖先准备独占视图；需要实际编译产物的既有测试先调用所属产品原Build入口。依赖缺失、宿主不适用、工具加载失败或语言结果不完整均失败，不以跳过或零退出码代替通过。

取消、超时及任何非成功结论都是失败，长进程通过本产品 `runResourceProcess` 传播取消并确认整组退出；退出未确认时 `gateCleanupAllowed` 拒绝清理现场。

本轮只完善门禁实现、资料、注释和回归源码，尚未运行测试、门禁、编译、签名或安装。全部获准步骤实现完成后在最终统一验收中运行，随后按每仓准确保存SHA推送并核对该SHA的GitHub push门禁；未验收不得登记为已完成。


## 独立功能门禁

本仓 `.github/tatagate/` 只检查本仓提交。本产品现有功能检查主题为：工厂主机和员工权限、连接、业务运行时、原生接口与分机。已有真实入口为：native/tests、app/test、scripts/test_employee_gateway.py和test_package.mjs。`contracts.json` 的 `functions` 只映射本仓已有用例路径、实际执行器、所属工程及具名用例，不复刻业务字段或算法；源码及公开接口继续是业务真源。当前登记 40 件既有测试来源（cargo 6 件、flutter 8 件、node 25 件、python 1 件），新增或移除用例须同步映射，遗漏、失效和重复必须拒绝。

Node完整报告逐文件核对；Flutter和Vitest从实际机器结果读取本仓具名套件完成数；Rust按准确原锁工作区及所属包运行全目标和文档测试，核对具名用例；Python调用实际unittest套件，拒绝零用例、失败、跳过、预期失败和意外成功。适用的原生门禁回读真实XCTest结果。执行回执绑定本仓、本次工作根和同一HEAD SHA，历史回执、加载事件、总数非空或单独零退出码均不足以证明全部功能检查成功。门禁协议夹具只证明核验器和调用边界，不能替代实际产品功能验收。

门禁资源仍由本仓 `scripts/resources.mjs` 准备和验真，实际用例需要的Cargo/npm原锁纳入本仓闭包。固定SDK只按本仓声明的同一40位提交建立本轮工程，不能读取邻仓或跟随main。Linux使用现有准确Ubuntu x64门禁宿主；本机使用原macOS ARM资源入口。Flutter需要的真实MLS、SDK ABI及适用Isar宿主在用例前准备，验证普通文件、当前工作边界及实际加载；缺库即失败，不设置跳过或替身。资源与全部测试临时数据只归本产品target内准确平台现场，不改变生产平台、生产工具版本、依赖版本或锁。

main推送自动触发本仓同SHA `tatagate.yml`，不调度其它产品门禁或CI/Release。中文注释、真实接口、所属文档与回归同步检查继续执行。当前只准备实现、注释和用例，未运行测试、语法检查、门禁、下载或编译。浏览器交互、真机、真实API/服务/数据库环境及适用平台不能由登记清单、单元测试或编译替代，须在整项实现后的统一验收逐项核对。

本地调用的既有协调目录参数只用于核对请求身份；实际测试工作根和本次功能回执由门禁自行在本仓target建立，不向快照旁协调目录写入产品状态。独立入口与控制台固定调用共享同一实现与退出结论。


本仓门禁回归执行边界：完整门禁包含本仓全部已登记真实测试；需要编译输入的既有用例由所属入口准备，禁止读取其它轮次生成物。嵌套Node回归启动独立运行器时，仅清除父运行器内部NODE_TEST_CONTEXT，产品工具和门禁输入继续保留；实际逐文件及最终结果仍拒绝零用例、遗漏、跳过和失败。回归夹具的Git/Shell来自已验真公开工具输入，禁止回退系统路径；工具转发模块不承担门禁CLI，直接参数拒绝由本仓实际门禁入口负责。 此次修正候选来自统一回归真实失败；整项真实功能验收、已保存提交门禁及同SHA远端结果尚未完成，不能据此登记为全部通过。

功能清单核验回读本仓实际Git跟踪源码，使用明确的本仓上游排除边界；漏登记、重复、不存在的入口或Rust具名用例集合不一致均失败。归档消费者仍属于本仓功能检查，不因上游目录豁免而排除。

本产品源码工具依赖准备仅返回源码外归档存储中的验真输入映射；工具候选不创建旧originals目录，也不清理不存在的目录。原始归档及编译输入仍由既有工具对象和回执完整保存，错误归档、缺前置工具、编译失败、缺输出及越界继续失败。修正后的配方形成自身对象身份，不覆盖历史原件；测试夹具遵守同一目录合同。

CitizenSDK正式消费统一固定于https://github.com/crcfrcn/citizensdk.git的根包(.)及真实提交0c442b4065ff1577e235cba76978749827d9f575；声明ref、锁ref和resolved-ref必须逐字一致，不使用浮动分支或邻仓工作树。SDK Android构建输出与JNI暂存只位于当前消费产品既有target的严格子目录，SDK依赖原件只读。离线原件按该固定提交取得与验真；本次来源统一不代表新包编译、签名、安装或业务验收已经通过。


## 本机固定执行目录

target直属仅允许build、test两个固定目录，不建立平台、ci、release、publish或tmp固定目录。平台仍属于任务身份。编译器必需的内部目录只在本轮执行时存在；本轮工具全部退出、结果核验和记录完成后，成功或失败都清空对应现场。同产品共用固定编译根的任务串行领取，禁止清理其他活动任务。测试现场归test，测试结束清空。最终编译包也属于本轮现场，不保留在target根；控制台自身更新先完成既有原子安装，再清空build。远端CI、Release继续在GitHub执行，不建立本机固定流程目录。

历史验收路径保留原记录；本节为当前本机目录规则。
