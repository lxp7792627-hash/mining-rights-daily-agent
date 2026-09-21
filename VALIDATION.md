# 验证记录

验证环境：Windows、Node.js 24.18.0。验证日期：2026-09-20。

## 已通过

- `npm run check`：TypeScript strict 类型检查、ESLint 零警告、Prettier、43 项测试、构建。
- 4 个测试文件：领域边界、资源量、行情、真实 MCP stdio 集成。
- 三个独立 MCP Server 完成初始化、工具列表发现和客户端调用。
- 从真实生成的 PDF 字节流提取两类资源行；额外覆盖表头单位、跨页单位不继承和 ±5% 校验。
- 无密钥演示生成 Markdown 和 JSON，含新闻、资源行、价格趋势、风险提示和合成数据标识。
- `npm run config -- --demo` 生成本机绝对路径配置。
- `npm audit`：当前锁定依赖的审计结果为 0 个已知漏洞。
- `docker compose config --quiet`：Compose 配置解析通过。

## GitHub Actions

源码已上传至 [GitHub 仓库](https://github.com/lxp7792627-hash/mining-rights-daily-agent)。
提交 `a10410f711ee6fd5d2f59178975eeb67ca04d3e1` 的 [CI 运行记录](https://github.com/lxp7792627-hash/mining-rights-daily-agent/actions/runs/35508053077) 中，以下 5 个任务全部通过：

- Ubuntu / Node.js 22：完整检查、测试、构建和演示。
- Ubuntu / Node.js 24：完整检查、测试、构建和演示。
- Windows / Node.js 22：完整检查、测试、构建和演示。
- Windows / Node.js 24：完整检查、测试、构建和演示。
- Docker：实际构建镜像，执行 Compose 演示，确认日报文件生成。

远端文件树哈希与本地验证版本一致。上述验证针对该提交；后续仅更新本记录的提交不改变程序实现。

## 实时调用

使用 `--topic lithium --commodity lithium --days 30`。Mining Weekly 和 Mining Technology RSS 可访问；查询返回 2026-09-17 的一条锂项目新闻。mining.com 返回 HTTP 403，聚合仍返回其他可用源，并保留失败提示。

未配置授权行情，实时价格正确返回 unavailable。未指定真实项目 PDF，本次实时演练未声称已完成真实项目报告提取。资源量自动化验证使用的是生成的测试 PDF。

## 尚未执行

- 本地 Docker daemon 未启动，未在本机运行容器；容器构建与运行已在上述 GitHub Actions 中验证。
- Claude Desktop / Cursor 图形客户端未现场连接；协议通信已由真实 MCP 集成测试验证。
- 任意真实 NI 43-101 报告布局的全面兼容性、授权 LME 数据端到端验证不在已完成测试范围内。

此记录区分已通过的程序验证与仍依赖外部环境或数据授权的验证，不代表所有数据源持续可用。
