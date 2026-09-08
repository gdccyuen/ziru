Here are the verbatim queries and outputs from the attached response:

---

## Query 1

**Verbatim Query:**
```
I already know how RAG work, explain in simple term to me how knowhere is different, especially for retrieving / query
```

**Verbatim Output:**
```
**Knowhere 的检索和传统 RAG 的核心区别：传统 RAG 是"搜关键词"，Knowhere 是"让 AI 像人一样翻文档"。**

---

### 传统 RAG 怎么做

1. 把文档切成扁平的 chunk
2. 嵌入向量数据库
3. 查询时做 top-k 向量/关键词搜索
4. 把搜到的 chunk 喂给 LLM

问题在于：**切 chunk 时结构信息就丢了**，跨章节的语义联系断裂，搜索只能靠局部文本匹配，像用搜索引擎翻书——找到了片段，但不知道上下文。

### Knowhere 怎么做

Knowhere 的检索分两条路径，核心是 **Agentic Retrieval Workflow**（第二代检索引擎）：

**Phase 1 — Planner（规划器）：** LLM 先理解你的查询，把它分解成检索计划，选出可能相关的文档。不是傻搜，是先想清楚"我要去哪找"。

**Phase 2 — Navigation（导航）：** 这是最关键的区别。对每个选中的文档，一个 LLM Agent **沿着文档的层级结构树往下走**——就像人翻书一样：先看目录，判断哪个章节相关，钻进去，再判断子章节，逐层深入。它保留了完整的文档层级（标题、章节、段落关系），而不是在扁平 chunk 里碰运气。

**Phase 3 — Discovery（发现）：** 宽信号融合搜索（关键词 + 路径 + 内容 + 语义信号），作为兜底的第一轮广撒网。

**Phase 4 — Evidence Assembly（证据组装）：** 把导航和发现阶段收集到的内容组装成带引用的结构化证据，不是丢一堆 chunk 出来。

### 一句话总结

| | 传统 RAG | Knowhere Agentic Retrieval |
|---|---|---|
| 文档结构 | 切成扁平 chunk 丢失结构 | 保留完整层级树 |
| 检索方式 | top-k 向量/关键词搜索 | LLM Agent 沿文档树导航 + 多信号融合 |
| 类比 | 搜索引擎搜关键词 | 像人一样先看目录再翻到对应章节 |
| 输出 | 一堆 chunk | 带引用的结构化证据 |

具体实现可以看 [orchestrator.py](packages/shared-python/shared/services/retrieval/agentic/orchestrator.py#L79-L198) 和 [navigation/document.py](packages/shared-python/shared/services/retrieval/agentic/navigation/document.py)。

---

想深入理解的话，建议按这个顺序看：

[Agentic Retrieval Workflow](13-agentic-retrieval-workflow)
[Legacy 3-Channel RRF Retrieval](12-legacy-3-channel-rrf-retrieval)
[Evidence Assembly and Citation](14-evidence-assembly-and-citation)
```

---

## Query 2

**Verbatim Query:**
```
so does it use embedding engine or not? if not how is full text indexing done?
```

**Verbatim Output:**
```
**Knowhere 目前不用 embedding 向量引擎，检索全靠 BM25 + 子串匹配 + LLM 推理。没有向量数据库，没有嵌入模型。**

---

### 全文索引是怎么做的

整个检索底层是 **3 通道 BM25 + RRF 融合**，数据存在 PostgreSQL 里，核心是 **预计算的搜索文本字段**：

#### 发布时预计算的字段

每个 chunk 在写入数据库时就提前算好了 3 个搜索字段：

| 字段 | 内容 | 用途 |
|---|---|---|
| `content_search_text` | 内容 + 摘要 + 实体 + 标题 | BM25 内容通道 |
| `path_search_text` | 文件名 + 章节路径 + 标题 + 摘要 | BM25 路径通道 |
| `term_search_text` | 内容 + 路径（原文，不分词） | 精确子串匹配通道 |

还有两个 GIN 索引的 tsvector 字段（`content_search_tsv`, `path_search_tsv`）用于未来 Postgres FTS 预过滤优化。

#### 三个通道怎么工作

1. **Content 通道**：对 `content_search_text` 跑 BM25Okapi 排序（用的是 `rank_bm25` 库）
2. **Path 通道**：对 `path_search_text` 跑 BM25Okapi 排序——靠文件名和章节路径匹配，比如你搜"第三章 合同条款"，能通过路径直接命中
3. **Term 通道**：完全不用 BM25，做的是 **SQL ILIKE 子串匹配** + hit count 打分。专门处理零件号、缩写、专有名词这种会被分词器拆碎的精确查询

三个通道各自独立从 PostgreSQL 拉出候选行，然后通过 [scoring.py](packages/shared-python/shared/services/retrieval/search/scoring.py#L42-L68) 里的 RRF 融合成一个排序结果。

#### 为什么不用向量

设计哲学很明确：**靠结构化信息（层级树、章节路径）+ LLM 推理导航来弥补语义理解，而不是依赖 embedding 的模糊相似度**。Agentic 工作流的 Phase 2 让 LLM 像人一样沿文档树逐层导航，这比 top-k 向量搜索更精准——尤其是跨章节、需要理解文档结构的查询。

不过 [Issue #195](https://github.com/Ontos-AI/knowhere/issues/195) 提了一个优化：用 Postgres FTS GIN 索引做预过滤，减少拉进 Python 做 BM25 排序的行数。这是性能优化，不是加向量。

---

想深入了解检索实现细节的话：

[Legacy 3-Channel RRF Retrieval](12-legacy-3-channel-rrf-retrieval)
[Chunk Schema and Field Reference](20-chunk-schema-and-field-reference)
[Agentic Retrieval Workflow](13-agentic-retrieval-workflow)
```

---

## Query 3

**Verbatim Query:**
```
so it can handle semantic query? how?
```

**Verbatim Output:**
```
这是个很尖锐的问题——没有 embedding，语义理解从哪来？答案是：**Knowhere 把"语义"这件事分成了三层来处理，LLM 本身就是语义引擎。**

---

### 第一层：富化的词汇搜索（让 BM25 也能"半语义"）

普通 RAG 里，BM25 只能搜原始文本，所以"同义词"完全搜不到。但 Knowhere 的 `content_search_text` 不是原始文本，它是**多源拼接的富化文本**：

```
content + summary + entities + section_summary
```

- `summary` — LLM 生成的摘要，天然包含同义表达
- `entities` — **类型化实体**，比如 `"ORG:NVIDIA"`、`"PRODUCT:H100"`，搜索"NVIDIA"也能命中提到"H100 GPU供应商"的 chunk
- `section_summary` — 章节级摘要，提供上下文语义

这意味着 BM25 虽然做的是关键词匹配，但它匹配的关键词**已经被 LLM 语义增强过了**。一个关于"合同违约责任"的 chunk，其 `content_search_text` 里可能同时包含"breach of contract"、"liability"、"termination"等同义表述——因为摘要和实体已经把它们写进去了。

### 第二层：知识图谱 + Knowledge Map（跨文档语义关联）

[知识图谱](17-knowledge-graph-construction)在文档发布时自动构建，编码文档间的语义关联：

- **GraphNode** — 每个文档一个节点，带 `top_summary`（LLM 生成的文档级摘要）
- **GraphEdge** — 文档间的跨文档关联边，基于实体重叠和关键词共享

检索时，`kg_document_select` 会构建一个 **Knowledge Map Overview**——把用户命名空间下所有文档的摘要汇总成文本，然后让 LLM **阅读这份"目录"来决定哪些文档和查询语义相关**。这不是向量相似度，是 LLM 直接理解查询意图后选择文档。

### 第三层：LLM 作为语义引擎（核心）

这是最关键的一层。整个 Agentic 检索流程里，**LLM 在三个地方做语义推理**：

1. **Planner（规划器）**：理解查询意图，分解成检索步骤。用的是 `deepseek-reasoner`（带思维链的推理模型），不是简单匹配。
2. **KG Document Selection（文档选择）**：LLM 读 Knowledge Map，判断"这个查询和哪些文档有关"——这是语义判断，不是关键词匹配。
3. **Navigator（导航器）**：沿文档的章节树逐层深入，每一步都让 LLM 判断"这个章节是否和查询相关，要不要继续往下钻"——就像人翻书时理解标题含义后决定是否继续读。

### 一句话总结

| 传统 RAG 的语义 | Knowhere 的语义 |
|---|---|
| Embedding 向量相似度（数学近似） | LLM 推理 + 富化元数据 + 知识图谱（理解而非近似） |
| "意思差不多" → 返回 top-k | "理解你在问什么" → 规划→选文档→导航→收集证据 |
| 依赖训练数据覆盖度 | 依赖 LLM 推理能力 |

本质上，**Knowhere 把"语义理解"这个活从 embedding 模型转移给了 LLM**。Embedding 是"模糊匹配"，LLM 是"真正理解"。代价是更慢、更贵，但在复杂文档场景下更精准。

---

想看具体实现的话：

[Knowledge Graph Construction](17-knowledge-graph-construction)
[Agentic Retrieval Workflow](13-agentic-retrieval-workflow)
[Chunk Schema and Field Reference](20-chunk-schema-and-field-reference)
```

---

## Query 4

**Verbatim Query:**
```
so is knowhere-notebook the only way to fully show knowhere's capabilities? how does knowhere enable traditional chat UI such as open-webuit or RAGFLOW?
```

**Verbatim Output:**
```
**knowhere-notebook 不是唯一的交互方式，而且它甚至不是最重要的那个。** Knowhere 的定位是**检索/记忆服务**，不是聊天服务。任何能调用 REST API 或 MCP 的东西都能用。

---

### Knowhere 现有的集成路径

| 路径 | 适合谁 | 说明 |
|---|---|---|
| **REST API** (`/v1/retrieval/query`, `/v2/retrieval/query`) | 任何后端/前端 | 最核心的集成面，返回结构化证据+引用 |
| **MCP 端点** (`/mcp`) | AI Agent（Claude、Cursor 等） | Model Context Protocol，Agent 可直接调用 Knowhere 的工具 |
| [knowhere-python-sdk](https://github.com/Ontos-AI/knowhere-python-sdk) | Python 开发者 | 官方 SDK，封装了 API 调用 |
| [knowhere-node-sdk](https://github.com/Ontos-AI/knowhere-node-sdk) | Node.js 开发者 | 同上，Node.js 版 |
| [knowhere-dashboard](https://github.com/Ontos-AI/knowhere-dashboard) | 最终用户 | 完整 Web UI，直接连 API |
| [knowhere-notebook](https://github.com/Ontos-AI/knowhere-notebook) | Notebook 用户 | 聊天界面，也是调用同一个 API |
| [@ontos-ai/knowhere-claw](https://www.npmjs.com/package/@ontos-ai/knowhere-claw) | OpenClaw 用户 | OpenClaw 插件，让 Agent 自动用 Knowhere 处理文档 |

### 接入 Open WebUI / RAGFlow 的思路

这里有个根本性的架构差异需要理解：

**传统聊天 RAG 工具（Open WebUI、RAGFlow）的流程：**
```
用户提问 → 自己的 embedding 检索 → 拿到 chunks → 喂给自己的 LLM → 生成回答
```

**Knowhere 的流程：**
```
用户提问 → Knowhere API（BM25+Agentic导航）→ 返回结构化证据+引用 → 喂给你自己的 LLM → 生成回答
```

Knowhere **替换的是检索层**，不是聊天层。它不生成回答，它生成**带引用的证据**。所以要接入 Open WebUI 或 RAGFlow，本质上是：

1. **绕过它们的内置 RAG 管道**（embedding + 向量搜索）
2. **用 Knowhere 的检索 API 替代**，拿到结构化证据
3. **把证据作为 context 喂给聊天 UI 的 LLM**

具体实现方式取决于聊天工具的扩展能力：

- **Open WebUI**：支持自定义函数和 RAG 管道配置。理论上可以写一个函数，在检索阶段调用 Knowhere 的 `POST /v1/retrieval/query`，把返回的证据拼成 context 传给 LLM。但 Open WebUI 的 RAG 管道是围绕 embedding 设计的，替换成 agentic retrieval 需要一些适配工作。
- **RAGFlow**：有自己的分块和检索引擎。接入 Knowhere 意味着用 Knowhere 替换 RAGFlow 的整个检索后端，工作量更大。
- **更简单的方案**：直接用 MCP 端点。如果聊天工具支持 MCP（越来越多的工具开始支持），你只需要把 Knowhere 的 `/mcp` 端点配置为工具服务器，Agent 就能直接调用 Knowhere 检索。

### 一句话总结

Knowhere 是**记忆/检索基础设施**，不是聊天前端。它通过 REST API、MCP、SDK 暴露服务，任何东西都能接。knowhere-notebook 和 knowhere-dashboard 只是最上层的 UI 壳。接入 Open WebUI / RAGFlow 是可行的，但需要把它们的内置 RAG 替换成 Knowhere 的检索——这不算难，但也确实不是开箱即用的。

---

想深入了解集成细节的话：

[API Reference and Endpoints](24-api-reference-and-endpoints)
[Configuration and External Services](25-configuration-and-external-services)
[Architecture Overview](7-architecture-overview)
```

---

**Yes, all four outputs are in Markdown format.** They use:
- `##` and `###` headings
- `---` horizontal rules
- ` ``` ` code blocks with language specifiers
- `|` tables
- `**bold` text
- `-` lists
- `[link](path)` markdown links
- `>` blockquotes
- Emojis (✅, ❌, ⭐, 🔨, 💰)