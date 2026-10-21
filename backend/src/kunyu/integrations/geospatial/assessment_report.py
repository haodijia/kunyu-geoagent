"""Fixed-format reports use recorded metrics; no language model calculates figures."""

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from kunyu.domain.geospatial.assessment import Assessment
from kunyu.integrations.geospatial.assessment_raster import CATEGORIES

METRICS = [
    ("研究区几何面积", "aoi_area_m2", "km²"),
    ("共同有效观测面积", "common_valid_area_m2", "km²"),
    ("无效观测面积", "invalid_area_m2", "km²"),
    ("前期水体（共同有效区域）", "before_water_area_m2", "km²"),
    ("后期水体（共同有效区域）", "after_water_area_m2", "km²"),
    ("新增水体候选（未筛小图斑）", "raw_added_water_area_m2", "km²"),
    ("保留新增候选图斑", "retained_added_water_area_m2", "km²"),
    ("退水区域", "retreat_area_m2", "km²"),
]


def write_report(value: Assessment, directory: Path, preview: Path) -> None:
    request = value.request
    rows = [
        (label, f"{float(value.metrics[key]) / 1_000_000:.4f}", unit)
        for label, key, unit in METRICS
    ]
    limitations = [
        "结果表征两次卫星过境之间的水体变化，不能代表洪峰最大淹没范围。",
        "新增候选可能包含季节性水面、水田灌溉与分类误差，需要人工和现场资料核查。",
        "分析仅采用两期共同清晰有效区域；云、阴影、未分类和无数据区域不作无积水判断。",
        "本次未接入耕地、道路、居民点、人口及现场真值，不提供相应损失或受灾对象估算。",
        "SCL 用于质量筛选，不作为独立分类精度真值；本次未完成独立精度评价。",
    ]
    if request.method_status == "exploratory":
        limitations.insert(
            0, "当前阈值为探索性参数，未经独立样本校准；候选面积不能作为已核实灾情。"
        )
    method = f"MNDWI > {request.threshold:g}；两期 SCL 仅保留 4、5、6；最小保留图斑 {request.min_patch_area_m2:g} m²。原始变化栅格保留所有候选，小图斑筛选只影响矢量和保留面积。"
    coverage = f"共同有效观测覆盖率：{float(value.metrics['common_valid_fraction']) * 100:.2f}%；面积按 WGS84 椭球测量；研究区按像元中心纳入，几何面积与栅格化面积分别保存。"
    markdown = [
        f"# {request.title}",
        "",
        f"研判记录：{value.id}",
        f"观测：{request.before_date} → {request.after_date}",
        f"研究区：{value.area.name}，版本 {value.area.revision}",
        "",
        "## 事件背景",
        request.event_context,
        "",
        "## 方法与质量",
        method,
        coverage,
        "",
        "参数依据：" + request.calibration,
        "",
        "## 指标",
        "| 指标 | 数值 | 单位 |",
        "|---|---:|---|",
    ]
    markdown.extend(f"| {label} | {number} | {unit} |" for label, number, unit in rows)
    markdown += [
        "",
        "## 限制与核查",
        *[f"- {item}" for item in limitations],
        "",
        "## 来源",
    ]
    for index, source in enumerate(value.sources, 1):
        markdown.append(
            f"{index}. {source['title']}；成果 {source['id']}；任务 {source['job_id']}；路径 {source['file_path']}"
        )
    markdown += [
        "",
        "完整输入快照及脚本来源见 assessment.json，统计见 metrics.json / metrics.csv。",
        "",
    ]
    (directory / "brief.md").write_text("\n".join(markdown), encoding="utf-8")
    (directory / "assessment.json").write_text(
        value.model_dump_json(indent=2), encoding="utf-8"
    )
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    normal = ParagraphStyle(
        "normal",
        fontName="STSong-Light",
        fontSize=10,
        leading=16,
        wordWrap="CJK",
        spaceAfter=7,
    )
    heading = ParagraphStyle(
        "heading", parent=normal, fontSize=15, leading=22, spaceAfter=12
    )
    small = ParagraphStyle("small", parent=normal, fontSize=8, leading=12)

    def paragraph(text: str, style=normal):
        markup = escape(text).replace("\n", "<br/>")
        markup = markup.replace("km²", "km<super>2</super>").replace(
            "m²", "m<super>2</super>"
        )
        return Paragraph(markup, style)

    story = [
        paragraph(request.title, heading),
        paragraph(
            f"{request.before_date} → {request.after_date} ｜ {value.area.name} v{value.area.revision}"
        ),
        paragraph(request.event_context),
        paragraph(coverage),
        Image(str(preview), width=112 * mm, height=112 * mm),
    ]
    legend_light = ParagraphStyle("legend_light", parent=small, textColor=colors.white)
    legend = Table(
        [
            [
                paragraph(
                    entry["label"],
                    legend_light if entry["value"] in {1, 2, 4} else small,
                )
                for entry in CATEGORIES
            ]
        ],
        colWidths=[34 * mm] * 5,
    )
    legend.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (i, 0), (i, 0), colors.HexColor(entry["color"]))
                for i, entry in enumerate(CATEGORIES)
            ]
        )
    )
    story += [legend, Spacer(1, 8 * mm)]
    table = Table(
        [[paragraph(t, small) for t in ["指标", "数值", "单位"]]]
        + [[paragraph(t, small) for t in row] for row in rows],
        colWidths=[95 * mm, 45 * mm, 25 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.lightgrey),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story += [
        table,
        PageBreak(),
        paragraph("方法、证据与核查", heading),
        paragraph(method),
        paragraph("参数依据：" + request.calibration),
    ]
    story += [
        paragraph(f"{index}. {item}") for index, item in enumerate(limitations, 1)
    ]
    story += [Spacer(1, 5 * mm), paragraph("输入与任务来源", heading)]
    for source in value.sources:
        story += [
            paragraph(str(source["title"])),
            paragraph(f"成果：{source['id']}；任务：{source['job_id']}", small),
            paragraph(str(source["file_path"]), small),
        ]
    story += [
        paragraph("研判身份：" + value.id, small),
        paragraph("完整来源、参数与脚本记录见配套 assessment.json。", small),
    ]
    doc = SimpleDocTemplate(
        str(directory / "brief.pdf"),
        pagesize=(210 * mm, 297 * mm),
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=request.title,
        author="坤舆智枢",
    )

    def footer(canvas, _doc):
        canvas.setFont("STSong-Light", 8)
        canvas.drawString(
            20 * mm, 9 * mm, f"坤舆智枢 | 水体变化研判 | {canvas.getPageNumber()}"
        )

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
