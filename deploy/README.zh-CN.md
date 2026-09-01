# Ziru Self-Hosted

[English](README.md) | 中文

Ziru Self-Hosted 使用 Docker Compose 打包 Ziru 的自托管部署：Ziru API、worker、管理后台（Admin Console）与 WebUI 一栈拉起。

## 准备工作

- Docker 和 Docker Compose。
- 一个容器可访问的自托管 MinerU 实例。MinerU 始终在本地运行，通过同步 `/file_parse` 接口调用；不需要 API Key。
- 任意 OpenAI-compatible 模型端点的 Key/URL（例如本地 Ollama 或 vLLM）。

目前，我们的配置默认使用 MinerU 作为 PDF 解析器。如果你需要自定义解析流程，也可以接入自己的解析器；只要它能产出 Markdown（`.md`）文件，Ziru 就可以继续处理。如果你想为更多 PDF 解析器贡献支持，欢迎提交 pull request。

## 1. 准备服务

- MinerU：运行自托管 MinerU 实例，并把 `MINERU_URL` 指向其基础地址（默认 `http://host.docker.internal:8000`）。MinerU 始终通过 `/file_parse` 本地调用，不使用 API Key。
- 任意 OpenAI-compatible 模型端点（本地 [Ollama](https://ollama.com/)、[vLLM](https://docs.vllm.ai/) 或云厂商）

## 2. 配置 `.env`

新建一个 `.env` 文件。

本地 OpenAI-compatible 模型服务器（Ollama）示例：

```bash
MINERU_URL=http://host.docker.internal:8000
PROVIDER_URL=http://localhost:11434/v1
PROVIDER_KEY=ollama
NORMAL_MODEL=qwen3:32b
HIERARCHY_LLM_MODEL=qwen3:32b
IMAGE_MODEL=llava:latest
IMAGE_MODEL_MAX=llava:latest
```

自托管 vLLM 示例：

```bash
MINERU_URL=http://host.docker.internal:8000
PROVIDER_URL=http://localhost:8000/v1
PROVIDER_KEY=EMPTY
NORMAL_MODEL=Qwen/Qwen3-32B
HIERARCHY_LLM_MODEL=Qwen/Qwen3-32B
IMAGE_MODEL=Qwen/Qwen3-VL-32B-Instruct
IMAGE_MODEL_MAX=Qwen/Qwen3-VL-32B-Instruct
```

MinerU 始终在本地（on-premise）运行，通过 `/file_parse` 调用，不需要 API Key。将 `MINERU_URL` 指向你的自托管 MinerU 基础地址即可。

当前大模型 provider 通过 `PROVIDER_URL` 和 `PROVIDER_KEY` 配置。每个角色的模型名（`NORMAL_MODEL`、`HIERARCHY_LLM_MODEL`、`IMAGE_MODEL`、`IMAGE_MODEL_MAX`）需要按启用的角色显式设置。

本地访问默认不需要修改其他配置。宿主机端口默认只绑定到 `127.0.0.1`。

如果通过本机反向代理对外访问，保持默认绑定即可，同时把 `ADMIN_PUBLIC_URL` 改成用户浏览器实际打开的地址：

```bash
ADMIN_PUBLIC_URL=https://ziru.example.com
```

如果 `ADMIN_PUBLIC_URL` 和浏览器地址不一致，登录或注册可能失败。
`WEBUI_PUBLIC_URL` 对 WebUI 起同样的作用（用于存储 CORS）。

如果需要让其他机器直接访问宿主机端口，只开放必要的公开服务：

```bash
ADMIN_HOST_BIND=0.0.0.0
WEBUI_HOST_BIND=0.0.0.0
API_HOST_BIND=0.0.0.0
```

自托管部署默认会发送匿名产品遥测（`TELEMETRY_ENABLED=true`）。遥测使用随机安装 ID 与聚合指标，不包含 prompt、文件名、用户身份或请求 body。如需关闭，设置 `TELEMETRY_ENABLED=false`。事件目录、隐私边界与属性表见
[匿名产品遥测](docs/configuration.zh-CN.md#匿名产品遥测)。

## 3. 启动服务

```bash
docker compose up -d
```

访问服务：

| 服务 | 地址 |
| --- | --- |
| 管理后台（Admin Console） | http://localhost:81/login |
| WebUI | http://localhost:80 |
| API 健康检查 | http://localhost:5005/health |

默认端口可通过 `.env` 中的 `ADMIN_HOST_PORT`、`WEBUI_HOST_PORT` 和 `API_HOST_PORT`
调整。Linux 上绑定 80 端口需要提升权限——如果无法绑定，请把 `WEBUI_HOST_PORT`
改成高位端口（例如 8080）。开发期间 dev server 仍使用自己的端口：管理后台 3000，
WebUI 3001。

`webui` compose 服务目前只是初步接线：WebUI **尚未并入 deploy 镜像**
（`deploy/Dockerfile` 只构建 API、worker 和管理后台）。当前 compose 会从
`../webui`（`webui/Dockerfile`）构建 webui 服务；等 `ziru-webui` 镜像发布后，
在 `.env` 中设置 `WEBUI_IMAGE` 即可改用发布镜像。该服务将 `/api/*` 代理到
核心 API（`NEXT_PUBLIC_API_URL=http://app:5005/api`）；它在 deploy 中的构建/发布
与环境接线尚未完成。

## API 使用

API 为 REST/JSON 接口，可通过 `/docs`（OpenAPI）查看自文档。Ziru API 的语言 SDK 将另行发布。

### 输入格式建议

**上传前请先将 Office 文件转换为 PDF。** Ziru 使用 MinerU 解析 PDF，能够输出最完整、结构化的结果
（完整 markdown、表格单元格结构、页脚及脚注）。Word 文档（`.docx`）走的是另一套较简单的解析流程，其局限包括：

- 表格被拍平为纯文本，丢失了「行到列」的数值对应关系；
- 丢弃页脚及页脚注释说明；
- 不产出 `full.md` 产物。

当前版本的 MinerU office 后端对真实 `.docx` 文件并不可靠。对政府资助申请表格的实测发现：将 `.docx`
直接提交给 MinerU 返回的是空 markdown（仅保留了页码页眉），而使用第三方转换工具生成的 PDF 偶尔也会丢失
「净新增经常性开支」等关键数字。原始 `.docx` 从不丢失数字，但缺少表格结构，难以判断数值属于哪一列。

**进行准确的成本/节省分析时，推荐流程：**

1. 上传前先用办公套件（如 LibreOffice、Microsoft Word 或 Adobe Acrobat）将源 `.docx` 转换为 PDF；
2. 将 **PDF** 上传到 Ziru；
3. 保留原始 `.docx` 作为第二参考——如果某个数字可疑，请对照源文档核对；合计行不要只依赖单次转换的输出。

这样既能获得 MinerU 完整的结构化输出，又能保留原始文件的准确性。

## 常用命令

查看服务状态：

```bash
docker compose ps
```

查看应用日志：

```bash
docker compose logs -f app
```

停止服务：

```bash
docker compose down
```

更新镜像并重启：

```bash
docker compose pull
docker compose up -d
```

数据库和上传文件会保存在 Docker volumes 中，执行 `docker compose down` 不会删除这些数据。

## 更多配置

除上述必填项以外的配置通常不需要修改。端口、模型、存储、Webhook、数据库和 Redis 等可选配置见 [docs/configuration.zh-CN.md](docs/configuration.zh-CN.md)。

## 致谢

Ziru Self-Hosted 是 Ziru 项目的一部分。Ziru 是 [Knowhere](https://github.com/Ontos-AI/knowhere)（作者 Ontos-AI，Apache License 2.0）的一个 fork。上游署名声明见根目录 [NOTICE](../NOTICE)。
