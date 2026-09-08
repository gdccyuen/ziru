Here are the verbatim queries and outputs from the attached response:

---

## Query

**Verbatim Query:**
```
compare classic flow and agentic on presentation to user, depth and breath of answers, speed and efficiency. how shall a user decide what to use.
```

**Verbatim Output:**
```
## Classic 流程 vs Agentic 流程：全方位对比

两者共享同一套 BM25 底层通道实现，但在此之上走出了完全不同的路。

### 1. 用户侧呈现

| 维度 | Classic 3-Channel RRF | Agentic Workflow |
|------|----------------------|------------------|
| 输出结构 | **扁平证据文本** — 直接从 `fused_rows` 拼接的 `evidence_text` | **层级化证据树** — `DocTreeNode` 森林经 renderer 渲染，带章节层级、引用脚注 |
| 引用方式 | 简单行内引用，chunk 粒度 | 显式引用解析（`resolve_workflow_references`），可追溯至文档-章节-段落三级 |
| 可解释性 | 低 — 用户只看到"搜到了这些片段" | 高 — 每步导航有 `DecisionTraceStep`，可回溯 agent 为什么选了这个文档、展开了哪个章节 |

简单说：Classic 给你一袋散落的拼图碎片；Agentic 给你一幅已经按章节排好、标注了来源的拼图半成品。

### 2. 答案的深度与广度

| 维度 | Classic | Agentic |
|------|---------|---------|
| 广度 | 依赖 3 通道 BM25 的 top-k 召回，**覆盖面由关键词匹配决定**，容易遗漏语义相关但用词不同的段落 | Phase 1 先用 RRF 做初始发现（**复用 Classic 作为种子**），再通过 KG document selection 扩展到知识图谱关联文档，广度更大 |
| 深度 | **浅** — 拿到什么就返回什么，不会深入探索文档内部结构 | **深** — Phase 2 的 Collector Agent 做逐文档 BFS 导航（EXPAND / BACK / SEARCH_IMAGES / SEARCH_TABLES / FINISH），LLM 决定是否需要深入子章节 |
| 跨文档关联 | 无 | 有 — `exclude_document_ids` 和 `exclude_sections` 机制确保多步间渐进式精炼，而非重复命中 |

关键洞察：**Agentic 不是抛弃 Classic，而是把 Classic 的 RRF 结果当作种子输入**。见 [orchestrator.py](packages/shared-python/shared/services/retrieval/agentic/orchestrator.py#L1-L15) 的注释 — Phase 1 的 `bottom_discovery` 直接复用 3 通道参数。

### 3. 速度与效率

| 维度 | Classic | Agentic |
|------|---------|---------|
| 延迟 | **毫秒级** — 纯 BM25 + RRF 融合，无 LLM 调用 | **秒级到十秒级** — 每个文档的每个 navigate_step 都是一次 LLM 调用，文档越多越慢 |
| 成本 | 零 LLM token 消耗 | 显著的 LLM token 消耗（planning + 逐文档导航 + evidence 渲染） |
| 确定性 | **完全确定性** — 同一查询同一索引，结果不变 | 半确定性 — LLM 导航路径可能因模型/温度不同而变化 |
| 缓存友好度 | 高 — 结果稳定，缓存命中率高 | 中 — `RetrievalQuery` 支持缓存，但 agent 路径本身有随机性 |

### 4. 用户应如何抉择

**选 Classic 的场景：**
- 语料库较小、文档结构简单（flat 文本为主）
- 需要低延迟响应（实时聊天、高频查询）
- 成本敏感，不想消耗 LLM token
- 查询意图明确，关键词匹配即可命中
- 需要结果完全可复现（审计/测试）

**选 Agentic 的场景：**
- 语料库大、文档结构复杂（多层章节、跨文档引用、图表/表格）
- 查询需要推理和跨文档关联（"A 方案和 B 方案在性能上的差异是什么？"）
- 可以接受 2-10 秒延迟，追求更高质量的证据
- 下游 agent 需要结构化证据（层级引用、可追溯性）
- 单次检索不够，可能需要迭代精炼（Agentic 的 `AgenticResult` 设计支持下游 agent 判断证据不足时再次调用检索）

**混合策略（推荐起点）：**
先用 Classic 快速返回，如果用户追问或证据不足，再切换到 Agentic 做深度检索。这正是 Knowhere 的 `use_agentic` 标志的设计意图 — 参见 [显式检索策略模型](23-explicit-retrieval-policy-model)，策略通过 `RetrievalQuery` → `WorkflowRunRequest` 的类型化投影传播，路由决策和执行逻辑解耦，你可以在 API 层按需切换而不必改动下游代码。

---

想更深入理解实现细节，可以接着看：

[传统 3 通道 RRF 检索](12-legacy-3-channel-rrf-retrieval)
[Agentic 检索工作流](13-agentic-retrieval-workflow)
[显式检索策略模型](23-explicit-retrieval-policy-model)
```

---

**Yes, this output is in Markdown format.** It uses:
- `##` and `###` headings
- `|` tables
- `**bold**` text
- `---` horizontal rule (in the final section)
- `[link](path)` markdown links
- Code references with backticks (e.g., `fused_rows`, `DocTreeNode`, `DecisionTraceStep`)