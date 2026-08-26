# Fudan SafeTest 2026

复旦大学实验室安全考试 Chrome 自动答题扩展。

不需要安装 Python、uv、Selenium 或 ChromeDriver。下载仓库并在 Chrome 中加载后，点击一次扩展按钮、正常完成复旦登录，程序就会自动进入考试并选择题库答案。

> 扩展不会查找或点击提交按钮。答题完成后，请核对答案并手动提交。

## 一、下载仓库

在 GitHub 仓库页面点击 **Code → Download ZIP**，下载完成后解压。

也可以使用 Git：

```bash
git clone git@github.com:Recqvq/Fudan_SafeTest2026.git
```

## 二、安装 Chrome 扩展

1. 在 Chrome 地址栏输入 `chrome://extensions/` 并打开。
2. 开启页面右上角的 **开发者模式**。
3. 点击页面左上角的 **加载未打包的扩展程序**。
4. 选择下载并解压后的仓库根目录，即直接包含 `manifest.json` 的文件夹。
5. 安装成功后，点击 Chrome 工具栏的拼图图标，将 **Fudan SafeTest** 固定到工具栏。

正确的文件夹结构如下：

```text
Fudan_SafeTest2026/
├── manifest.json
├── README.md
├── asset/
│   └── questions.json
└── extension/
    ├── content.js
    ├── popup.html
    └── popup.js
```

## 三、开始自动答题

1. 点击 Chrome 工具栏中的 **Fudan SafeTest**。
2. 点击 **打开并自动答题**。
3. 如果出现复旦统一身份认证页面，请在网页内正常完成登录。
4. 登录完成后不需要返回终端，也不需要再次点击扩展。程序会自动识别安全考试首页、进入“实验室安全在线校级卷”并选择答案。
5. 网页右上角会显示当前进度。出现绿色“答题完成”提示后，请核对答案并手动提交试卷。

## 四、安全与隐私

- 扩展仅申请访问 `lsem.fudan.edu.cn`。
- 账号和密码由复旦登录页面处理，扩展不会读取或保存登录信息。
- 题库保存在本地 `asset/questions.json`，不会上传答题内容。
- 自动运行请求在十分钟后失效。
- 题目匹配度不足或选项不完整时，程序会立即停止并显示红色提示。
- 自动答题代码中没有提交或交卷功能。

## 五、常见问题

### 点击扩展后页面一直加载

先直接访问 `https://lsem.fudan.edu.cn/`，确认当前网络能够打开复旦实验室安全考试网站。网站本身无法访问时，扩展也无法继续。

### Chrome 提示无法加载扩展

确认选择的是直接包含 `manifest.json` 的仓库根目录，而不是 `extension` 子目录或 ZIP 压缩包。

### 网页右上角出现红色提示

不要反复点击扩展按钮。记录提示内容，检查安全考试页面结构或题库是否已经更新。

## 来源

题库及最初的 Selenium 实现思路来自 [dannyXSC/Fudan_SafeTest](https://github.com/dannyXSC/Fudan_SafeTest)。本仓库将运行方式重写为无需 Python 环境的纯 Chrome 扩展。
