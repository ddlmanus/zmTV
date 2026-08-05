# 安装与常见安全提示

本文适用于从 zmTV 官方 GitHub Release 下载的公开社区版安装包。当前公开构建没有 Apple Developer ID、Microsoft 代码签名或 Android 商店签名，因此不同系统首次启动时可能显示安全提示。

请只对从 [ddlmanus/zmTV Releases](https://github.com/ddlmanus/zmTV/releases) 下载且校验值正确的文件执行下列操作。

## macOS

### 1. 选择正确的安装包

- “关于本机”中显示 Apple M1、M2、M3、M4 等芯片：下载 `zmTV-Desktop-mac-arm64.dmg`。
- “关于本机”中显示 Intel 处理器：下载 `zmTV-Desktop-mac-x64.dmg`。

打开 DMG，将“造梦影视与设计工作流”拖入“应用程序”文件夹，再从“应用程序”中启动，不要直接在 DMG 内运行。

### 2. 首次打开

先在 Finder 的“应用程序”中找到应用，按住 Control 点击或右键点击应用，选择“打开”，然后在确认框中再次选择“打开”。部分 macOS 版本也可在“系统设置 > 隐私与安全性”底部选择“仍要打开”。

### 3. 提示“已损坏，无法打开”

这个提示通常是 Gatekeeper 拦截未签名、未公证的社区构建，不代表安装包必然损坏。先完成下方 SHA-256 校验。校验一致后，在“终端”执行仅针对本应用的隔离属性移除命令：

```bash
xattr -dr com.apple.quarantine "/Applications/造梦影视与设计工作流.app"
open "/Applications/造梦影视与设计工作流.app"
```

如果应用安装在其他位置或被重命名，请将命令中的路径替换为实际路径。可把应用从 Finder 拖入终端窗口以自动填入路径。

若终端提示 `Permission denied` 或 `Operation not permitted`，确认应用已经拖入“应用程序”，然后执行：

```bash
sudo xattr -dr com.apple.quarantine "/Applications/造梦影视与设计工作流.app"
open "/Applications/造梦影视与设计工作流.app"
```

输入 `sudo` 密码时终端不会显示字符，这是 macOS 的正常行为。不要执行 `spctl --master-disable`，也不要全局关闭 Gatekeeper。

### 4. 校验下载文件

在终端中按下载的架构执行：

```bash
shasum -a 256 "$HOME/Downloads/zmTV-Desktop-mac-arm64.dmg"
shasum -a 256 "$HOME/Downloads/zmTV-Desktop-mac-x64.dmg"
```

`v2.1.7` 官方安装包校验值：

| 文件                         | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `zmTV-Desktop-mac-arm64.dmg` | `0d30d5dc5a3ea6fbc9bbe815d08b7fabab9ca3120d351b9084501cee0c6a123c` |
| `zmTV-Desktop-mac-x64.dmg`   | `fe243cd07435ea986589a5805352afb9524f8d50fe0577ff7a4a2ba0f610f71f` |

输出必须与对应值完全一致。如果不一致，说明文件下载不完整或内容已发生变化，请删除文件并从 GitHub Release 重新下载，不要继续安装，也不要移除隔离属性。

## Windows

当前 Windows 社区构建未进行 Microsoft 代码签名。SmartScreen 提示“Windows 已保护你的电脑”时，确认文件来自官方 Release 后，可选择“更多信息 > 仍要运行”。如果下载来源不明，不要继续。

## Android

Android 安装包文件名包含 `unsigned`，未通过应用商店签名。系统可能要求允许浏览器或文件管理器“安装未知应用”。只为本次使用的来源临时授权，安装完成后可关闭该权限。

## 仍然无法打开

请在 Issue 中提供操作系统版本、设备架构、下载的文件名、SHA-256 输出和完整错误截图。不要上传 API Key、账号凭据或本地素材。
