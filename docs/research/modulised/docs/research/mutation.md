Here are the verbatim queries and outputs from the attached response:

---

## Query 1

**Verbatim Query:**
```
with query mitation from user question, I understand some special arrangements are set for comparing 2 files, please confirm. Furthermore, is it possible to extend the arrangements for multiple files, like tens of them?
```

**Verbatim Output:**
```
你提到的大概是 **query mutation/rewriting**（查询改写）在多文档导航中的处理方式。让我直接回答你的两个问题。

---

## 确认：确实有针对查询的特殊安排

在 Agentic 检索工作流中，有一条明确的策略：**SEARCH 工具（图片/表格检索）刻意忽略模型生成的查询改写，始终使用用户的原始查询。** 这在代码中有明确注释：

```python
# SEARCH tools use the original user query. We intentionally ignore
# model-generated query rewrites here so navigation cannot silently
# broaden or narrow the asset inspector's task.
```

参见 [prompts.py](packages/shared-python/shared/services/retrieval/agentic/prompts.py#L182-L184)。

但这不是"比较两个文件"的专属机制——它是**全局策略**，适用于所有文档的导航步骤。系统本身**原生支持多文档**，不存在"仅为 2 个文件做的特殊安排"。具体来说：

1. **Phase 1 — 文档选择**：`FILE_SELECT_PROMPT` 让 LLM 返回一个文档 ID 的 JSON 数组，数量不限于 2，参见 [prompts.py L28](packages/shared-python/shared/services/retrieval/agentic/prompts.py#L28)（`["doc_abc123", "doc_def456"]` 只是示例）。

2. **Phase 2 — 逐文档导航**：orchestrator 对所有选中文档循环执行，参见 [document.py L91](packages/shared-python/shared/services/retrieval/agentic/navigation/document.py#L91)：
   ```python
   for doc in self._state.selected_docs:
       ...
       await self._navigate_document(doc, query_intent=query_intent)
   ```
   每个文档独立导航，收集证据，最后统一组装。

3. **预算分配**：`BudgetLedger.allocate_doc_caps()` 按文档粒度分配 token 预算，参见 [orchestrator.py L269-L273](packages/shared-python/shared/services/retrieval/agentic/orchestrator.py#L269-L273)。

---

## 能否扩展到几十个文件？

**架构上可以，但有实际瓶颈：**

| 约束因素 | 机制 | 影响 |
|---|---|---|
| **Token 预算** | `BudgetLedger` 在所有选中文档间分配 token，每文档有 `per_doc_min_share` | 文档越多，单文档可用预算越少，导航深度变浅 |
| **延迟预算** | `latency_budget_ms` 硬上限，超时后停止导航 | 几十个文档 × 每文档多步 LLM 调用 → 极易超时 |
| **导航步数** | `max_nav_steps` 限制每文档最大步数 | 同上，压缩单文档探索深度 |
| **证据裁剪** | `_trim_evidence_to_budget` 在最终组装时按剩余 context 预算裁剪 | 大量文档的证据会被截断，下游 agent 可能拿不到完整信息 |

简言之：**2 个文件是甜区，十几个文件勉强可行，几十个文件会遇到延迟和预算瓶颈导致每个文档都被浅尝辄止。** 如果要稳定支持几十个文件的对比查询，需要考虑：
- 分批检索（多次调用，每次处理一部分文档）
- 提高 `token_budget_total` 和 `latency_budget_ms`
- 或在 Phase 1 做更激进的文档筛选，只保留最相关的子集

---

想深入了解各阶段的细节，可以继续看：

- [Agentic 检索工作流](13-agentic-retrieval-workflow) — 完整的三阶段流程
- [显式检索策略模型](23-explicit-retrieval-policy-model) — 预算和策略如何类型化
- [知识图谱构建](17-knowledge-graph-construction) — 跨文档关系如何辅助多文档选择
```

---

## Query 2

**Verbatim Query:**
```
"在 Phase 1 做更激进的文档筛选" is this an option in request for this, or have to work the prompt or even amend the code?
```

**Verbatim Output:**
```
简短回答：**请求参数能做一部分，但要做到"更激进的文档筛选"，必须改 prompt 或改代码。** 目前没有 `max_selected_docs` 这样的请求参数。

---

## 现状拆解

Phase 1 有两阶段，各阶段的可控性不同：

### 阶段 1a: `bottom_discovery`（3 通道 RRF 检索）

| 约束 | 可控性 | 来源 |
|---|---|---|
| `top_doc_ids` 硬上限 **5** | ❌ 代码写死 | [tools.py L157](packages/shared-python/shared/services/retrieval/agentic/discovery/tools.py#L153-L157) — `[:5]` |
| `internal_recall_k`（召回池大小） | ✅ 请求参数 | 间接缩小候选池，见 [API 参考](24-api-reference-and-endpoints) |
| `channels` / `channel_weights` | ✅ 请求参数 | 可关闭某些通道，收紧召回 |
| `exclude_document_ids` | ✅ 请求参数 | 手动排除已知不相关的文档 |

### 阶段 1b: `kg_document_select`（LLM 文档选择）

| 约束 | 可控性 | 来源 |
|---|---|---|
| `FILE_SELECT_PROMPT` 文本 | ❌ 代码写死 | [prompts.py L11-L30](packages/shared-python/shared/services/retrieval/agentic/prompts.py#L11-L30) — 只说"select documents"，**没有数量上限指令** |
| `bootstrap_budget`（LLM 选择可用 token） | ❌ 仅环境变量 | [runtime.py L25](packages/shared-python/shared/services/retrieval/agentic/core/runtime.py#L25) — `RETRIEVAL_AGENTIC_BOOTSTRAP_BUDGET`，默认 2000 |
| 选择后截断 | ❌ 不存在 | LLM 返回多少就选多少，仅做 `exclude_document_ids` 过滤，见 [tools.py L232-L237](packages/shared-python/shared/services/retrieval/agentic/discovery/tools.py#L232-L237) |

**关键发现**：LLM 可以返回任意数量的文档 ID，代码不做上限截断。这就是几十个文件场景下的核心问题——Phase 1 可能选出过多文档，导致 Phase 2 预算被稀释。

---

## 三种改法，从轻到重

### 1. 纯环境变量调优（不改代码）

```bash
RETRIEVAL_AGENTIC_BOOTSTRAP_BUDGET=1200   # 默认2000，收紧 LLM 选择窗口
RETRIEVAL_AGENTIC_TOKEN_BUDGET_TOTAL=80000 # 默认40000，给 Phase 2 更多空间
RETRIEVAL_AGENTIC_LATENCY_BUDGET_MS=60000  # 默认30000，给多文档更多时间
```

效果有限——只是间接施压，LLM 仍可能选出很多文档。

### 2. 改 Prompt（最小代码改动）

在 [FILE_SELECT_PROMPT](packages/shared-python/shared/services/retrieval/agentic/prompts.py#L11-L30) 中加入数量约束：

```python
FILE_SELECT_PROMPT = """\
...
User query: {query}
Based on the query, select documents that may contain relevant information.
Select at most {max_docs} most relevant documents. Fewer is better if confident.
If NO document in the corpus is relevant to the query, return an EMPTY array [].
...
"""
```

然后在 [kg_document_select](packages/shared-python/shared/services/retrieval/agentic/discovery/tools.py#L224-L230) 调用处传入 `max_docs`，默认可以是 5 或 10。

### 3. 改代码（最可靠）

在 `kg_document_select` 返回后加一层硬截断：

```python
# tools.py, after line 237
MAX_SELECTED_DOCS = int(os.environ.get("RETRIEVAL_AGENTIC_MAX_SELECTED_DOCS", "10"))
valid_ids = valid_ids[:MAX_SELECTED_DOCS]
```

或者将 `top_doc_ids[:5]` 的硬编码改为可配置：

```python
# tools.py, line 153-157
discovery_top_n = int(os.environ.get("RETRIEVAL_AGENTIC_DISCOVERY_TOP_N", "5"))
top_doc_ids = sorted(doc_id_counts, key=..., reverse=True)[:discovery_top_n]
```

---

## 结论

| 目标 | 能否仅靠请求参数？ | 需要做什么 |
|---|---|---|
| 缩小召回池 | ✅ `internal_recall_k` + `exclude_document_ids` | 不改代码 |
| 限制 LLM 选出的文档数量 | ❌ | **必须改 prompt 或加代码截断** |
| 调整预算分配 | ❌ | 环境变量（不需要改代码，但需要运维介入） |

**最务实的路径**：先改 `FILE_SELECT_PROMPT` 加一句数量上限指令（方案 2），同时在 `kg_document_select` 返回后加一层硬截断作为兜底（方案 3）。两层防护，LLM 即使不听话也不会失控。

---

要深入了解预算分配机制和策略模型，可以继续看：

- [显式检索策略模型](23-explicit-retrieval-policy-model) — 预算池如何类型化
- [API 参考与端点](24-api-reference-and-endpoints) — 请求参数完整列表
- [传统 3 通道 RRF 检索](12-legacy-3-channel-rrf-retrieval) — `internal_recall_k` 等参数的底层含义
```

---

**Yes, both outputs are in Markdown format.** They use:
- `##` and `###` headings
- `---` horizontal rules
- ` ``` ` code blocks with language specifiers
- `|` tables
- `**bold` text
- `-` lists
- `[link](path)` markdown links
- `>` blockquotes
- Emojis (❌, ✅, 🔨)