Here are the verbatim queries and outputs from the attached response:

---

## Query 1

**Verbatim Query:**
```
tell me how to MinerU is used in the package, and from another aspect what is the standard flow for PDF, DOCX, XLSX, PPTX
```

**Verbatim Output:**
```
## MinerU 的使用方式

MinerU 在 Knowhere 中**仅用于 PDF 解析**，作为外部 SaaS API 调用，而非本地库集成。核心链路如下：

1. **配置层** — [mineru.py](packages/shared-python/shared/core/config/mineru.py#L1-L71) 定义了 `MineruConfig`，包含 API URL、密钥池、超时、限流、上传模式等参数。

2. **HTTP 客户端** — [client.py](apps/worker/app/services/document_parser/providers/mineru/client.py#L1-L95) 构建带重试策略的 `requests.Session`，提供 `get_mineru_headers()`（Bearer 认证）和 `raise_mineru_unavailable()`（429 限流处理）。

3. **PDF 解析服务** — [pdf_service.py](apps/worker/app/services/document_parser/providers/mineru/pdf_service.py#L1-L200) 是核心入口，`parse_via_full()` 函数执行完整流程：
   - **URL 模式优先**：若 S3 源文件存在且 `MINERU_UPLOAD_MODE_ENABLED=False`，生成 S3 预签名 URL，调用 `/extract/task/batch` 让 MinerU 直接拉取文件（跳过上传环节）
   - **上传模式回退**：否则调用 `/file-urls/batch` 获取上传地址 → PUT 上传文件 → 轮询任务状态
   - 请求参数：`is_ocr=True`, `enable_formula=True`, `enable_table=True`, `language="auto"`, `model_version="vlm"`

4. **配额管理** — [quota_manager.py](apps/worker/app/services/document_parser/providers/mineru/quota_manager.py) 管理 API Key 池轮转、RPM 限流和每日配额。

5. **任务轮询** — [task_polling.py](apps/worker/app/services/document_parser/providers/mineru/task_polling.py) 负责 `poll_mineru_task()` 和 `get_batch_status()`，等待 MinerU 异步解析完成。

简言之：**MinerU = PDF 专属的外部 OCR/VLM 解析服务**，Knowhere 通过 REST API + 轮询模式消费它。

---

## 各格式的标准解析流程

路由入口在 [format_router.py](apps/worker/app/services/document_parser/orchestration/format_router.py#L1-L101)：根据文件扩展名解析为 `DocumentFormat` 枚举，再由 `get_document_parse_adapter()` 分派到对应的 Adapter。各格式流程如下：

### 📄 PDF
**Adapter**: `PdfParseAdapter` → [pdf/parser.py](apps/worker/app/services/document_parser/formats/pdf/parser.py#L1-L200)

```
PDF文件 → DOC_AGENT特征分析
  ├─ Atlas路由 → parse_atlas()（绕过MinerU）
  ├─ 有anatomy → 分片流水线：
  │    1. DOC_AGENT → shard计划 + TOC
  │    2. bin_pack → 合并分片
  │    3. split_pdf（排除TOC页）
  │    4. MinerU逐分片并行解析
  │    5. 逐分片heading预测
  │    6. 合并lines_with_heading + images
  │    7. parse_md Phase B
  └─ 标准单次 → MinerU parse_via_full() → full.md → parse_md()
```

### 📝 DOCX
**Adapter**: `DocxParseAdapter` → [docx/parser.py](apps/worker/app/services/document_parser/formats/docx/parser.py)

```
DOCX文件 → parse_docx()（结构+表格提取）
         → convert_doc2dics()（转为统一dict格式）
         → 输出parsed_df
```
> `.doc` 格式先通过 LibreOffice 转换为 `.docx`，再走同一流程。

### 📊 XLSX
**Adapter**: `XlsxParseAdapter` → [excel/table_parser.py](apps/worker/app/services/document_parser/formats/excel/table_parser.py)

```
XLSX文件 → parse_xlsx()（结构解析 + 表格解析）
         → 输出parsed_df
```
> `.xls` 格式先通过 LibreOffice 转换为 `.xlsx`，再走同一流程。

### 📑 PPTX
**Adapter**: `PptxParseAdapter` → [pptx/parser.py](apps/worker/app/services/document_parser/formats/pptx/parser.py#L1-L200)

```
PPTX文件 → 策略选择：
  ├─ to_pdf_api → iLoveAPI转换PPTX→PDF → parse_rendered_pdf_bytes()
  │              → MinerU解析PDF → parse_md()
  └─ libreoffice → LibreOffice转换PPTX→PDF → 同上
```
PPTX 本质上是**先转 PDF，再走 PDF 解析流水线**，所以 MinerU 间接参与了 PPTX 的解析。

---

## 总结一览

| 格式 | 是否用 MinerU | 是否用 LibreOffice | 核心解析器 |
|------|:---:|:---:|------|
| PDF | ✅ 直接 | ❌ | MinerU + parse_md |
| DOCX | ❌ | ❌ | docx/parser.py |
| DOC  | ❌ | ✅ 转docx | 同 DOCX |
| XLSX | ❌ | ❌ | excel/table_parser.py |
| XLS  | ❌ | ✅ 转xlsx | 同 XLSX |
| PPTX | ✅ 间接 | ✅ 转PDF | iLoveAPI/LO → PDF → MinerU |

想深入了解各格式的解析细节，可以继续探索：

[解析流水线与格式路由](9-parsing-pipeline-and-format-routing)
[文档 Agent 与 PDF 特征分析](15-document-agent-and-pdf-profiling)
[分块转换与发布](11-chunk-conversion-and-publication)
```

---

## Query 2

**Verbatim Query:**
```
for PPTX, confirm which is used: iLoveAPI or LibreOffice? Or in what conditions?
```

**Verbatim Output:**
```
## PPTX 转换策略：iLoveAPI 优先，LibreOffice 兜底

默认策略是 **`to_pdf_api`（iLoveAPI）**，这在 [pptx/parser.py](apps/worker/app/services/document_parser/formats/pptx/parser.py#L289-L290) 的函数签名中明确写了：

```python
def parse_pptx(
    ...
    strategy="to_pdf_api",  # 默认值
    ...
)
```

[format_adapters.py](apps/worker/app/services/document_parser/orchestration/format_adapters.py#L96-L106) 中 `PptxParseAdapter` 也硬编码传入 `strategy="to_pdf_api"`。

---

### 三种策略及选择逻辑

| 策略 | 转换方式 | 是否用 MinerU | 使用条件 |
|------|---------|:---:|------|
| `to_pdf_api` | iLoveAPI (云端) → PDF | ✅ | **默认**，优先尝试 |
| `to_pdf` | LibreOffice (本地子进程) → PDF | ✅ | iLoveAPI 失败时的**自动回退** |
| `to_md` | pptx2md + MarkItDown (XML 直解) | ❌ | 仅手动指定，不常用 |

### iLoveAPI → LibreOffice 自动降级链

当 `strategy="to_pdf_api"` 时，以下任一异常会触发自动降级到 `to_pdf`（LibreOffice）：

1. **`ValueError`** — iLoveAPI 密钥未配置（`"iLoveAPI keys configured"` 或 `"ILOVEAPI"` 在错误消息中）
2. **`_ILoveApiConcurrencyExceeded`** — iLoveAPI 并发数超限
3. **`UnavailableException`** — API Key 池耗尽（全被限流）
4. **`requests.exceptions.RequestException`** — 网络请求失败

降级代码在 [pptx/parser.py](apps/worker/app/services/document_parser/formats/pptx/parser.py#L311-L398)，每条 `except` 分支都做了结构化日志（`LogEvent.ILOVEAPI_FALLBACK`）并将 `strategy` 重置为 `"to_pdf"`。

---

### 完整流程图

```
PPTX 文件
  │
  ├─ 检查渲染PDF缓存 → 命中则直接返回
  │
  ├─ strategy = "to_pdf_api" (默认)
  │    │
  │    ├─ iLoveAPI 可用 → PPTX → iLoveAPI → PDF bytes
  │    │                        → parse_rendered_pdf_bytes()
  │    │                        → MinerU → parse_md()
  │    │
  │    └─ iLoveAPI 失败 (4种异常) → 自动降级 ↓
  │
  ├─ strategy = "to_pdf" (降级)
  │    PPTX → LibreOffice subprocess → PDF bytes
  │         → parse_rendered_pdf_bytes()
  │         → MinerU → parse_md()
  │
  └─ strategy = "to_md" (需手动指定)
       PPTX → pptx2md + MarkItDown → Markdown
            → parse_md() (不经MinerU)
```

所以结论很明确：**生产环境始终先尝试 iLoveAPI，只有当它不可用（未配置、限流、网络故障）时才降级到 LibreOffice**。LibreOffice 是最后一道防线，不是并行选项。

想进一步了解 iLoveAPI 的配额管理或渲染 PDF 的缓存机制：

[配置与外部服务](25-configuration-and-external-services)
[LLM 模型集成](26-llm-model-integration)
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
- `>` blockquotes for notes
- Emojis (📄, 📝, 📊, 📑, ✅, ❌)