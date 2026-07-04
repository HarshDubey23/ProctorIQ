from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    Image,
)
from reportlab.lib import colors

from backend.models.session import Session, SessionSummary, Verdict
from backend.report.signing import sign_session
from backend.report.timeline import generate_timeline_image

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm


def _grey(level: float) -> tuple[float, ...]:
    return (level, level, level)


def _fmt_dt(dt: datetime | None) -> str:
    if dt is None:
        return "—"
    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")


def _fmt_duration(start: datetime, end: datetime | None) -> str:
    if end is None:
        end = datetime.now(timezone.utc)
    delta = end - start
    total_s = int(delta.total_seconds())
    m, s = divmod(total_s, 60)
    return f"{m}m {s}s"


def _build_styles() -> Any:
    base = getSampleStyleSheet()

    # Dark background/accent styles for clinical premium theme
    base.add(
        ParagraphStyle(
            "DocTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            textColor=colors.HexColor("#0F1E2D"),
            alignment=0, # Left
            spaceAfter=15,
        )
    )
    base.add(
        ParagraphStyle(
            "MonospaceSessionId",
            parent=base["Code"],
            fontName="Courier",
            fontSize=10,
            leading=12,
            textColor=colors.HexColor("#0284C7"),
            spaceAfter=10,
        )
    )
    base.add(
        ParagraphStyle(
            "ScoreHeader",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=13,
            textColor=colors.HexColor("#64748B"),
            alignment=1, # Center
            spaceAfter=5,
        )
    )
    base.add(
        ParagraphStyle(
            "AntonStyleScore",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=82,
            leading=86,
            textColor=colors.HexColor("#0F1E2D"),
            alignment=1, # Center
            spaceAfter=10,
        )
    )
    base.add(
        ParagraphStyle(
            "VerdictLabel",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=18,
            textColor=colors.HexColor("#0F1E2D"),
            alignment=1, # Center
            spaceAfter=15,
        )
    )
    base.add(
        ParagraphStyle(
            "SectionTitle",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=16,
            textColor=colors.HexColor("#0F1E2D"),
            spaceBefore=10,
            spaceAfter=8,
            keepWithNext=True,
        )
    )
    base.add(
        ParagraphStyle(
            "PageSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#64748B"),
            spaceAfter=15,
        )
    )
    base.add(
        ParagraphStyle(
            "MonoText",
            parent=base["Code"],
            fontName="Courier",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#334155"),
        )
    )
    base.add(
        ParagraphStyle(
            "VerifyInstruction",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#475569"),
            spaceAfter=10,
        )
    )
    return base


def generate_session_pdf(
    session: Session,
    recent_sessions: list[SessionSummary] | None = None,
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
    )
    styles = _build_styles()
    story: list[Any] = []

    # Pre-calculate session metadata
    signature = sign_session(session)
    duration_sec = 0
    if session.end and session.start:
        duration_sec = int((session.end - session.start).total_seconds())

    # Map verdict to color
    verdict_text = session.verdict.value if session.verdict else "INCONCLUSIVE"
    if session.verdict == Verdict.PASS:
        verdict_color = "#059669"  # green
    elif session.verdict == Verdict.FLAGGED:
        verdict_color = "#EA580C"  # orange
    elif session.verdict == Verdict.REVIEW:
        verdict_color = "#DC2626"  # red
    else:
        verdict_color = "#6B7280"  # gray

    # -------------------------------------------------------------
    # PAGE 1: COVER & LIVE SCORE
    # -------------------------------------------------------------
    story.append(Paragraph("ProctorIQ Session Report", styles["DocTitle"]))
    story.append(Paragraph(f"SESSION ID: {session.id}", styles["MonospaceSessionId"]))
    story.append(Spacer(1, 10 * mm))

    # Info grid
    info_data = [
        [Paragraph("<b>Date & Time:</b>", styles["Normal"]), Paragraph(_fmt_dt(session.start), styles["Normal"])],
        [Paragraph("<b>Session Mode:</b>", styles["Normal"]), Paragraph(session.mode.upper(), styles["Normal"])],
        [Paragraph("<b>Duration:</b>", styles["Normal"]), Paragraph(_fmt_duration(session.start, session.end), styles["Normal"])],
    ]
    info_table = Table(info_data, colWidths=[doc.width * 0.3, doc.width * 0.7])
    info_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 35 * mm))

    # Center block: Score + Verdict
    story.append(Paragraph("ATTENTION & INTEGRITY SCORE", styles["ScoreHeader"]))
    score_val = str(round(session.final_score)) if session.final_score is not None else "—"
    story.append(Paragraph(score_val, styles["AntonStyleScore"]))

    # Verdict badge table for padding/border
    verdict_badge = Table(
        [[verdict_text]],
        colWidths=[150],
        rowHeights=[30],
    )
    verdict_badge.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(verdict_color)),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(verdict_badge)
    story.append(PageBreak())

    # -------------------------------------------------------------
    # PAGE 2: METRICS, INTEGRITY & TRENDS
    # -------------------------------------------------------------
    story.append(Paragraph("Metrics & Session Integrity", styles["SectionTitle"]))
    story.append(Paragraph("Detailed telemetry aggregates and cryptographic proof of session validity.", styles["PageSubtitle"]))

    # Metrics details
    events_by_type: dict[str, int] = {}
    for e in session.events:
        events_by_type[e.event_type] = events_by_type.get(e.event_type, 0) + 1

    metrics_data = [
        ["Aggregate Metric", "Value"],
        ["Attention Score", score_val],
        ["Focused %", f"{session.pct_focused:.1f}%" if session.pct_focused is not None else "—"],
        ["Distracted Incidents", str(events_by_type.get("distracted", 0))],
        ["Absence Incidents", str(events_by_type.get("absent", 0))],
        ["Drowsy Incidents", str(events_by_type.get("drowsy", 0))],
        ["Multi-Face Violations", str(events_by_type.get("multi", 0) + events_by_type.get("multi_face", 0))],
    ]
    metrics_table = Table(metrics_data, colWidths=[doc.width * 0.6, doc.width * 0.4])
    metrics_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F1E2D")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ]
        )
    )
    story.append(metrics_table)
    story.append(Spacer(1, 10 * mm))

    # Session Signing Section
    story.append(Paragraph("Session Verification Signature", styles["SectionTitle"]))
    story.append(Paragraph("The hash below guarantees that this report and its associated timeline events have not been modified. Any discrepancy in the event log or score will invalidate the verification check.", styles["PageSubtitle"]))
    story.append(Paragraph(f"<b>SHA-256 Hash:</b><br/>{signature}", styles["MonoText"]))
    story.append(Spacer(1, 10 * mm))

    # Trends
    story.append(Paragraph("Recent Performance Trend", styles["SectionTitle"]))
    if recent_sessions:
        trend_headers = ["Date", "Mode", "Score", "Verdict"]
        trend_rows = []
        for s in recent_sessions[:5]:
            trend_rows.append(
                [
                    s.start.strftime("%Y-%m-%d %H:%M"),
                    s.mode.upper(),
                    str(round(s.final_score)) if s.final_score is not None else "—",
                    s.verdict.value if s.verdict else "—",
                ]
            )
        trend_table = Table([trend_headers] + trend_rows, colWidths=[doc.width * 0.4, doc.width * 0.2, doc.width * 0.2, doc.width * 0.2])
        trend_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8FAFC")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(trend_table)
    else:
        story.append(Paragraph("No historical session data available.", styles["Normal"]))

    story.append(PageBreak())

    # -------------------------------------------------------------
    # PAGE 3: TIMELINE & EVENT DETAIL
    # -------------------------------------------------------------
    story.append(Paragraph("Attention Timeline", styles["SectionTitle"]))
    story.append(Paragraph("A continuous flight recorder tracking user presence and gaze stability. The color bars show the primary state for each second of the session.", styles["PageSubtitle"]))

    # PIL Timeline Rendering
    try:
        events_dicts = [
            {"timestamp_s": e.timestamp_s, "event_type": e.event_type}
            for e in session.events
        ]
        png_bytes = generate_timeline_image(duration_sec, events_dicts)
        timeline_img = Image(io.BytesIO(png_bytes), width=doc.width, height=36)
        story.append(timeline_img)
    except Exception as exc:
        story.append(Paragraph(f"Timeline generation unavailable: {exc}", styles["Normal"]))

    story.append(Spacer(1, 10 * mm))

    # Event Detail table
    story.append(Paragraph("Detailed Violations Feed", styles["SectionTitle"]))
    story.append(Paragraph("The log below lists the chronologically ordered flag events. To ensure a concise printed document, only the first 15 events are shown in this report.", styles["PageSubtitle"]))

    if session.events:
        ev_headers = ["Time (s)", "Event Type", "Confidence", "Reason / Details"]
        ev_rows = []
        # Limit to 15 events to prevent page overflow
        for e in session.events[:15]:
            reason = "—"
            if e.details:
                reason = e.details.get("reason", e.details.get("raw_value", "—"))
            ev_rows.append(
                [
                    f"{e.timestamp_s:.1f}s",
                    e.event_type.upper(),
                    f"{e.confidence * 100:.1f}%" if e.confidence is not None else "—",
                    str(reason),
                ]
            )
        if len(session.events) > 15:
            ev_rows.append(["...", "TRUNCATED", "—", f"And {len(session.events) - 15} more events. View full report in dashboard."])

        ev_table = Table([ev_headers] + ev_rows, colWidths=[doc.width * 0.15, doc.width * 0.25, doc.width * 0.18, doc.width * 0.42])
        ev_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F1E2D")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(ev_table)
    else:
        story.append(Paragraph("No integrity or distraction events recorded during this session.", styles["Normal"]))

    story.append(PageBreak())

    # -------------------------------------------------------------
    # PAGE 4: BENCHMARKS & VERIFICATION INFO
    # -------------------------------------------------------------
    story.append(Paragraph("In-Browser Benchmarks", styles["SectionTitle"]))
    story.append(Paragraph("Performance data collected directly during this browser session to prove client-side low-latency evaluation.", styles["PageSubtitle"]))

    if session.benchmark:
        bench_data = [
            ["Metric", "Value"],
            ["Average Model Inference Latency", f"{session.benchmark.model_latency_ms:.2f} ms"],
            ["Total ONNX Inference Runs", str(session.benchmark.inference_count)],
            ["Average PCA Projection Latency", f"{session.benchmark.pca_latency_ms:.2f} ms"],
            ["Total Event Broadcasts", str(session.benchmark.total_events)],
        ]
        bench_table = Table(bench_data, colWidths=[doc.width * 0.6, doc.width * 0.4])
        bench_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8FAFC")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(bench_table)
    else:
        story.append(Paragraph("No client benchmark metrics were attached to this session.", styles["Normal"]))

    story.append(Spacer(1, 15 * mm))

    story.append(Paragraph("Verification Instructions", styles["SectionTitle"]))
    story.append(
        Paragraph(
            "This report is cryptographically sealed. You can verify its integrity and matching details "
            "by submitting the verification query to the ProctorIQ verification gateway.",
            styles["VerifyInstruction"]
        )
    )
    story.append(
        Paragraph(
            "<b>To verify this document:</b><br/>"
            "1. Visit the ProctorIQ verify portal or curl the endpoint directly:<br/>"
            f"<font face=\"Courier\">http://localhost:8000/api/verify/{session.id}</font><br/>"
            "2. Confirm that the returned SHA-256 matches the hash printed below.<br/>"
            "3. If any field or event has been tampered with, the generated hash will fail verification.",
            styles["VerifyInstruction"]
        )
    )

    # Inline closure to draw page headers & footers on build
    def draw_page_decorations(canvas: Any, doc: Any) -> None:
        canvas.saveState()
        canvas.setFont("Courier", 8)
        canvas.setFillColor(colors.HexColor("#64748B"))
        
        # Header
        canvas.drawString(MARGIN, PAGE_H - 12 * mm, "ProctorIQ Analytics Report")
        canvas.setStrokeColor(colors.HexColor("#E2E8F0"))
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, PAGE_H - 13 * mm, PAGE_W - MARGIN, PAGE_H - 13 * mm)
        
        # Footer
        footer_text = f"ProctorIQ • Session {session.id[:8]}... • SHA-256: {signature[:16]}..."
        canvas.drawString(MARGIN, 12 * mm, footer_text)
        canvas.drawRightString(PAGE_W - MARGIN, 12 * mm, f"Page {canvas.getPageNumber()} of 4")
        canvas.restoreState()

    doc.build(
        story,
        onFirstPage=draw_page_decorations,
        onLaterPages=draw_page_decorations,
    )
    return buf.getvalue()
