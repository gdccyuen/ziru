# pyright: reportArgumentType=false, reportCallIssue=false
import os
import re

from app.services.document_parser.support.path_helpers import find_images
from app.services.document_parser.conversion.legacy_converter import (
    _convert_with_libreoffice,
)
from app.services.document_parser.formats.markdown.parser import parse_md
from app.services.document_parser.formats.pdf.rendered_transform import (
    build_rendered_pdf_s3_key,
    parse_cached_rendered_pdf,
    parse_rendered_pdf_bytes,
)
from loguru import logger
from markitdown import MarkItDown
from pptx2md import ConversionConfig, convert

from shared.core.exceptions.domain_exceptions import (
    FileSystemException,
)
from app.services.common.file_loading import load_file_bytes
from app.services.common.file_utils import path_handle

# ==================== LibreOffice conversion ====================


def pptx_to_pdf_libreoffice(pptx_path, outdir="."):
    """use LibreOffice to convert PPTX to PDF (local engine, formula rendering may be problematic)"""
    from shared.core.constants import ProcessingConstants

    filter_opts = (
        f"Quality={ProcessingConstants.IMG_QUALITY};"
        "ReduceImageResolution=false;"
        "UseTaggedPDF=true;"
        "ExportNotes=true"
    )
    return _convert_with_libreoffice(
        source_path=pptx_path,
        outdir=outdir,
        convert_to_arg=f"pdf:impress_pdf_Export:{filter_opts}",
        expected_output_ext="pdf",
        operation="convert_pptx_to_pdf",
    )


# ==================== main parsing entrance ====================


def parse_pptx(
    pptx_path,
    filename,
    output_dir,
    base_llm_paras,
    strategy="to_pdf",
    relative_root=None,
    baseurl="",
    job_id=None,
):
    """
    Deprecated: prefer page_memory track for PPTX processing.

    PPTX parsing entrance, aligned with parse_pdfs / parse_docx pattern.

    strategy options:
        - "to_md":      directly extract from PPTX XML (pptx2md + MarkItDown)
        - "to_pdf":     use LibreOffice to convert to PDF, then parse via MinerU
    """
    rendered_pdf_s3_key = (
        build_rendered_pdf_s3_key(job_id)
        if strategy == "to_pdf"
        else None
    )
    if strategy == "to_pdf":
        cached_result = parse_cached_rendered_pdf(
            rendered_pdf_s3_key=rendered_pdf_s3_key,
            filename=filename,
            output_dir=output_dir,
            base_llm_paras=base_llm_paras,
            relative_root=relative_root,
        )
        if cached_result is not None:
            return cached_result

    pptx_data = load_file_bytes(pptx_path, file_url=baseurl)
    logger.info(f"[parse_pptx] PPTX loaded: {len(pptx_data) / 1024:.1f} KB")

    if strategy == "to_pdf":
        return _parse_pptx_via_libreoffice(
            pptx_data,
            filename,
            output_dir,
            base_llm_paras,
            relative_root,
            rendered_pdf_s3_key=rendered_pdf_s3_key,
        )

    elif strategy == "to_md":
        return _parse_pptx_to_md(
            pptx_data, filename, output_dir, base_llm_paras, relative_root
        )

    else:
        raise ValueError(f"Unknown pptx strategy: {strategy}")


def _parse_pptx_via_libreoffice(
    pptx_data,
    filename,
    output_dir,
    base_llm_paras,
    relative_root,
    rendered_pdf_s3_key=None,
):
    """
    LibreOffice requires file paths (subprocess), so temp dir is unavoidable here.
    PPTX → temp file → LibreOffice → PDF → image-only PDF bytes → MinerU.
    """
    import shutil
    import tempfile

    tmp_dir = tempfile.mkdtemp(prefix="pptx_lo_")
    try:
        # Write PPTX to temp (LibreOffice needs file path)
        local_pptx = os.path.join(tmp_dir, filename)
        local_pptx = path_handle(local_pptx, mode="sanitize")
        with open(local_pptx, "wb") as f:
            f.write(pptx_data)

        pdf_path, _ = pptx_to_pdf_libreoffice(local_pptx, tmp_dir)

        # Read PDF into memory, then same image-only PDF flow
        try:
            with open(pdf_path, "rb") as f:
                pdf_bytes = f.read()
        except OSError as exc:
            raise FileSystemException(
                internal_message=f"Failed to read converted PPTX PDF at '{pdf_path}'",
                operation="read",
                original_exception=exc,
            ) from exc
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return parse_rendered_pdf_bytes(
        pdf_bytes=pdf_bytes,
        filename=filename,
        output_dir=output_dir,
        base_llm_paras=base_llm_paras,
        relative_root=relative_root,
        rendered_pdf_s3_key=rendered_pdf_s3_key,
    )


def _parse_pptx_to_md(pptx_data, filename, output_dir, base_llm_paras, relative_root):
    """Extract content from PPTX XML via pptx2md + MarkItDown → parse_md."""
    # pptx2md and MarkItDown require file paths
    local_pptx = os.path.join(output_dir, "_pptx_tmp.pptx")
    with open(local_pptx, "wb") as f:
        f.write(pptx_data)

    try:
        img_dir = os.path.join(output_dir, "images")
        os.makedirs(img_dir, exist_ok=True)
        temp_md_path = os.path.join(output_dir, "output.md")

        convert(
            ConversionConfig(
                pptx_path=local_pptx, output_path=temp_md_path, image_dir=img_dir
            )
        )

        md = MarkItDown(enable_plugins=False)
        result = md.convert(local_pptx)

        pattern = r"^!\[.*?\]\(.*?\.(?:png|jpe?g)\)$"
        md_imgs = find_images(output_dir)
        lines = result.text_content.splitlines()

        ppt_md_lines = []
        image_index = 0
        for line in lines:
            if image_index < len(md_imgs):
                if re.match(pattern, line.strip(), re.IGNORECASE):
                    line = f"![image{image_index + 1}]({md_imgs[image_index]})"
                    image_index += 1
            ppt_md_lines.append(line)

        while image_index < len(md_imgs):
            ppt_md_lines.append(f"![image{image_index + 1}]({md_imgs[image_index]})")
            image_index += 1

        parsed_df = parse_md(
            output_dir,
            source_type="pptx",
            md_lines=ppt_md_lines,
            base_llm_paras=base_llm_paras,
            relative_root=relative_root,
        )
        return parsed_df
    finally:
        if os.path.exists(local_pptx):
            os.remove(local_pptx)
