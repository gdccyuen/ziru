# SecDocs retrieval eval set

Sample security PDFs live in `../` (the `SecDocs` folder). This `eval/`
folder holds the test queries and the expected returns used to judge Ziru's
retrieval module.

## How the markdown was produced

The PDFs are parsed by the **local MinerU service** at `http://127.0.0.1:8000`
(`/health` → version 3.4.5). Each PDF is POSTed to `/file_parse` with:

- `backend=pipeline` (hallucination-free, deterministic; good for text PDFs)
- `return_md=true`
- `return_content_list=true`

Output is saved next to the source PDFs in `../parsed/<name>.json`. The JSON
shape is:

```json
{
  "results": {
    "<file name>": {
      "md_content": "<assembled markdown>",
      "content_list": "[ <block>, ... ]"
    }
  }
}
```

Each `content_list` block is a MinerU block with a `type` field:

| MinerU type | Ziru chunk type | Notes |
|---|---|---|
| `text` | text | body paragraph / list item; `text_level` carries the heading level |
| `table` | table | `table_body` is HTML; `table_caption` optional |
| `image` | image | `img_path` + `image_caption` |
| `page`-derived | page | assembled from all blocks of one `page_idx` |
| `header` / `footer` / `page_number` / `page_footnote` | (dropped) | page furniture, not searchable content |

## Eval schema (`queries.yaml`)

Each query states what a correct retrieval **must** return:

- `query` — the natural-language question sent to retrieval.
- `filters` — attribute filters (`topic` / `branch` / `division` /
  `section`) that the caller profile + request scope must apply.
- `expect.documents` — source files that must be among the returned documents.
- `expect.sections` — section paths that must appear. Matching is
  segment-wise: each expected heading segment must occur in the returned
  `" / "`-joined section path.
- `expect.chunks` — `{type, text_substr}` pairs; at least one returned chunk
  of that type must contain the substring.
- `expect.must_not_documents` — documents that must NOT appear (scope check).

Grading rules are documented at the top of `queries.yaml` (top-k = 8).

## Current coverage

All **23 PDFs** are parsed and every document has at least two queries
(**55 queries** total, SD-001..SD-055).

| Document | Queries |
|---|---|
| PG for Cloud Computing Security_EN | 5 |
| G3_EN | 5 |
| PG for DLP_EN | 3 |
| PG for IGS_EN | 3 |
| PG for ISIH_EN | 3 |
| PG for Destruction and Disposal of Storage Media_EN | 2 |
| PG for IT Outsourcing_EN | 2 |
| PG for IT Security Risk Management_EN | 2 |
| PG for IT Security Threat Management_EN | 2 |
| PG for IoT Security_EN | 2 |
| PG for Mitigation Strategy for Distributed Denial-of-Service Attacks_EN | 2 |
| PG for Mobile Security_EN | 2 |
| PG for Penetration Testing_EN | 2 |
| PG for SRAA_EN | 2 |
| PG for Secure Use of USB Storage Devices_EN | 2 |
| PG for Security Controls of Web 2.0 Application Development_EN | 2 |
| PG for Security Controls on Virtualisation_EN | 2 |
| PG for Security Log Management_EN | 2 |
| PG for Security by Design_EN | 2 |
| PG for Social Media Security_EN | 2 |
| PG for Website and Web Application Security_EN | 2 |
| PG for Wi-Fi Security_EN | 2 |
| S17_EN | 2 |
