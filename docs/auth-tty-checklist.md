# 隐藏密码输入 · 人工 TTY 验证清单

自动化测试覆盖了 raw mode 的状态机（进入/退出、退格、Unicode、Ctrl+C、非 TTY 拒绝），
但**真实终端**的 echo/粘贴/信号行为必须在目标操作系统上人工确认一次。

本仓库在本机（Windows + Node 22）完成了自动化测试；**真实 Windows 终端与 Linux 终端的人工验证状态：NOT RUN**。
下表请在目标机器上逐项勾选，并把结果补到本文件。

## Windows（PowerShell / Windows Terminal）

- [ ] `node server/auth-cli.mjs init-admin`：输入密码时**不显示任何字符**，光标不跳行
- [ ] 粘贴整段密码可用，粘贴内容不被回显
- [ ] 退格可以删除字符（不残留 `*` 或字符残影）
- [ ] 两次输入一致后账户创建成功
- [ ] Ctrl+C 取消：显示 `^C`，退出码 130，终端恢复正常输入
- [ ] 取消后再次运行 CLI，提示符输入正常（没有残留 raw mode）
- [ ] 在 `cmd.exe` 里同样验证一遍（如果运维使用 cmd）
- [ ] `echo password | node server/auth-cli.mjs add-user` 被拒绝（非 TTY）

## Linux（bash，SSH 或本地）

- [ ] `stty -a` 记录初始状态；运行 CLI 输入密码后，`stty -a` 中 `-echo` 已恢复为 `echo`
- [ ] 粘贴、退格、Ctrl+C、Ctrl+D 行为符合预期
- [ ] Ctrl+Z 挂起再 `fg` 后，终端仍正常（如果不正常，记录为已知问题）
- [ ] SSH 断线（关闭终端）后重新登录，终端不处于 raw mode
- [ ] 管道输入被拒绝

## 结果记录

| 日期 | 系统 | Node | 结果 | 执行人 |
|---|---|---|---|---|
| — | — | — | NOT RUN | — |
