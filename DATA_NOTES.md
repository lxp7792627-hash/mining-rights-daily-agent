# 数据契约

## 工具结果

所有工具返回 MCP text content，其中 JSON 遵循以下状态联合：

```json
{ "status": "ok", "data": {}, "demo": false }
```

```json
{ "status": "needs_review", "reason": "Ambiguous resource table", "demo": false }
```

`unavailable` 表示无可用数据；`needs_review` 表示无法安全自动提取。`demo` 是显式来源标签，实时失败不切换到演示数据。

## 新闻

`search` 的 data 为 `{ articles, warnings }`，article 包含 `title`、`url`、`publishedAt`（UTC 日期）、`summary`。RSS 以标准化 URL 去重（删除 fragment，不删除可能有业务含义的 query），按发布时间降序排列。窗口是 `[as_of - days + 1, as_of]`，不包含未来日期。日期缺失或链接非 HTTPS 的项目不会进入结果。

`fetch_article` 返回 `{ url, text }`，正文上限 16000 字符。报告最多取五篇、每篇最多摘录 500 字符，并标识正文或 RSS 摘录。无法获取全文时不声称已经核实正文。

## 资源量

自动支持的单位明确行，例如：

```text
Indicated 10 Mt 1 % Cu 100000 t
Inferred 5000 kt 0.8 % Cu 40 kt
Indicated 1 Mt 1 g/t Au 32.15 koz
Indicated 10 Mt 1 % Li2O 100000 t
```

支持普通空白和 `|` 等简单分隔。输出 `category`、`oreMt`、`grade`、`gradeUnit`、`contained`、`containedUnit`、`page`（从 1 开始）、`evidence`、`source`。金属量按 oz 或 t 归一化；矿石量按 Mt。

- 金：`expected_oz = oreMt * 1e6 * grade_g_per_t / 31.1034768`
- 铜 / Li2O：`expected_t = oreMt * 1e6 * grade_percent / 100`
- 要求 `abs(contained - expected) / expected <= 0.05`，数值必须大于 0。

支持同页四列（Category、Ore/Tonnes、Grade、Contained）的明确单位表头，以竖线、Tab 或多个空格分隔；不会跨页继承单位。其他表头布局、跨页/合并单元格、多个矿区混排、扫描件、其他元素/化合物等均可能需要人工审核。发现疑似数据行但无法安全解析时，整个结果降级，避免隐瞒漏提取。输出不声称 PDF 已满足 NI 43-101，使用者须确认来源、项目、报告期和标准。重复行不会被汇总为总资源量。

## 行情

`LME_PRICE_FILE` / `LME_PRICE_URL` 接受 JSON 数组；最多 100000 行。以下仅为 schema 示例，不是真实价格：

```json
[
  {
    "commodity": "copper",
    "date": "2026-09-18",
    "price": 10000,
    "currency": "USD",
    "unit": "t",
    "benchmark": "REPLACE_WITH_LICENSED_BENCHMARK_NAME",
    "source": "https://example.org/replace-with-licensed-source"
  }
]
```

`commodity` 转小写；`(commodity, date)` 是唯一键，重复直接拒绝。`price` 必须为正有限数，currency 为三个大写字母，source 为 HTTPS。同一文件若需要多基准，应使用不同 commodity 键或分开部署；不默认挑选某个基准。

`get_price` 只返回精确请求日，不前向填充。`get_trend` 至少两个观测值，全部必须同币种、单位和基准，返回 `points`、`changePct`、`requestedDays`、`asOf`。没有观测的交易日不补造，报告显示实际日期范围。

该服务名按题目命名为 lme-price-mcp，但适配器不会自行认证数据来自 LME；数据许可证、来源真实性和具体 benchmark 由供应者负责。演示中的锂价格基准明确为 SYNTHETIC / NOT LME。
