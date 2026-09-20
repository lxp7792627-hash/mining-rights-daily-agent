# RUN

## 1. 五分钟演示

前提：Node.js 22.13+ 或 Docker Compose v2 已安装。初次下载依赖/镜像的时间取决于网络速度。

```sh
npm ci
npm run build
npm run demo
```

也可从自然语言运行：

```sh
npm run brief -- --request "给我生成一份关于 Pilbara 锂矿的今日简报" --demo --date 2026-09-20 --out reports/pilbara.md
```

输出 `reports/pilbara.md` 和 `reports/pilbara.md.json`。演示数据是固定测试样本，使用其他日期可能因时间过滤返回缺失，这属于预期行为。

Docker：

```sh
docker compose run --build --rm brief
```

默认生成 `reports/demo.md`。Linux 上若宿主目录不可写，请预先创建 `reports` 并给容器 UID 1000 写权限，例如 `mkdir -p reports data && sudo chown 1000:1000 reports`。无需把容器改为 root。

## 2. 实时数据

实时运行不传 `--demo`。默认聚合 mining.com、Mining Weekly 和 Mining Technology 的公开 RSS；RSS 通常仅保留近期条目，不承诺完整历史覆盖。

```sh
npm run brief -- --topic Pilbara --commodity lithium --out reports/today.md
```

未配置价格、未提供 PDF 时，日报明确显示缺失。要启用全部数据源：

1. 指定可以公开访问、属于目标项目的报告：`--pdf-url https://.../report.pdf`。
2. 将有权使用的行情转换为 [DATA_NOTES.md](DATA_NOTES.md) 中的 JSON 数组，并设置 `LME_PRICE_FILE`；也可以设置返回同一 schema 的 `LME_PRICE_URL`。
3. 如需多个 RSS 源，设置逗号分隔的 `NEWS_FEEDS`。

PowerShell 示例（将示例报告 URL 替换为实际地址）：

```powershell
$env:LME_PRICE_FILE = (Resolve-Path ./data/prices.json).Path
$env:NEWS_FEEDS = 'https://www.mining.com/feed/'
npm run brief -- --topic Pilbara --commodity lithium --pdf-url 'https://YOUR-PUBLIC-REPORT-HOST/report.pdf' --out reports/today.md
```

POSIX Shell：

```sh
export LME_PRICE_FILE="$PWD/data/prices.json"
npm run brief -- --topic Pilbara --commodity lithium --pdf-url 'https://YOUR-PUBLIC-REPORT-HOST/report.pdf' --out reports/today.md
```

`LME_PRICE_FILE` 优先于 `LME_PRICE_URL`。本地 Node 不自动载入 `.env`，请显式设置环境变量。Compose 会读取 `.env`：复制 `.env.example`，把数据文件放入 `data/prices.json`，保留容器路径 `/app/data/prices.json`，再运行：

```sh
docker compose run --build --rm brief --topic Pilbara --commodity lithium --pdf-url 'https://YOUR-PUBLIC-REPORT-HOST/report.pdf' --out /app/reports/today.md
```

不要把未脱敏的授权行情或凭据提交 Git。所有示例 URL 中的 `example.org` 都是占位引用，不能当成真实证据。

## 3. Claude Desktop / Cursor

先构建，然后生成与本机 Node、仓库绝对路径匹配的配置：

```sh
npm run build
npm run config -- --demo
```

将生成的 `mcp-config.local.json` 中 `mcpServers` 的三个条目合并到 Claude Desktop MCP 配置或 Cursor 的 `.cursor/mcp.json`。不要覆盖原有的其他服务。生成文件无需改路径，Windows 中文路径会被 JSON 正确转义。

实时接入：先设置 Provider 环境变量，再执行 `npm run config`，省略 `--demo`。生成的文件包含你的本地路径，因此已加入 `.gitignore`。仓库中的 `mcp-config.json` 是从项目根目录运行的通用配置源；桌面客户端请使用生成后的绝对路径版本。

客户端工具列表应分别显示：

- mining-news-mcp：`search`、`fetch_article`
- mineral-pdf-mcp：`extract_resources`
- lme-price-mcp：`get_price`、`get_trend`

## 4. 参数与返回语义

| 参数          | 默认值   | 含义                                             |
| ------------- | -------- | ------------------------------------------------ |
| `--request`   | 无       | 简单中英文请求；复杂表达建议显式 topic/commodity |
| `--topic`     | Pilbara  | 新闻关键词，空格分隔的词按 AND 匹配              |
| `--commodity` | lithium  | 行情数据中的 commodity 键                        |
| `--date`      | UTC 当天 | 严格 YYYY-MM-DD，不接受不存在的日期              |
| `--days`      | 7        | 1–365 个自然日，包括报告当日                     |
| `--pdf-url`   | 无       | 公开 HTTPS PDF，最大 20 MB / 300 页              |
| `--out`       | 标准输出 | Markdown 路径，同时写相邻 `.json` 证据记录       |
| `--demo`      | false    | 显式使用合成数据，报告首部醒目标注               |

日报成功生成（包括显式标识的部分缺失）退出码为 0；非法参数、无法写文件等执行错误退出码为 1。自动化程序若要求全部源完整，应读取 JSON 并检查各源 `status === "ok"`。

## 5. 验证和排错

```sh
npm run check
npm audit --omit=dev
```

- 找不到 `dist`：先 `npm run build`；`npm test` 会自动构建。
- 价格为空：确认 commodity/date 精确匹配、日期窗口内至少两个点、数据同基准同单位。
- PDF `needs_review`：检查是否为扫描件、表格单位是否明确或质量守恒关系是否正确，必要时人工阅读。不会猜测表头或默认取第一组数字。
- RSS/文章失败：上游可能限流、拒绝访问或不可达；通过 `NEWS_FEEDS` 指定允许访问的公开 RSS。
- 公司网络：程序只允许公开 HTTPS，禁止私网目标。可设置 `ALLOWED_HOSTS` 限制到明确的来源域名，包括重定向后的域名。
- stdout 专用于 MCP JSON-RPC；运行日志写 stderr，不在服务中插入 `console.log`。
