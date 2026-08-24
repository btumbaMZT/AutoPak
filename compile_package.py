#!/usr/bin/env python3
"""
Mazzetti Luminaire Package Compiler — v3.

What changed vs v2
------------------
  * The per-sheet stamp moved from the FOOT of the page to a TOP HEADER BAND:
    logo left, project name over "ISSUANCE / MM.DD.YY" centred, and the
    luminaire type in a box on the right with "LUMINAIRE TYPE" beneath it.
    A rule closes the band at y=717.25.
  * A footer band under a matching rule at y=42 carries the studio line and
    address (left) with the project location and "Page X of Y" (right).
  * The cover page is now a centred, all-caps typographic block on white —
    project name, optional subtitle, issuance description, issuance date,
    then location · abbreviation small and grey, then the logo. The blue
    band, mustard accent rule and left-aligned label/value rows are gone.
  * The Mazzetti lockup is real vector artwork (mz_logo.pdf), embedded once
    per document and referenced from every page.
  * New optional --subtitle for the reference's second cover line
    ("LIGHTING AND CONTROLS UPGRADE").
  * Placed-sheet box is now 540 x 675.25 (left/right 0.5", top at the header
    rule, bottom at the footer rule) instead of the old 468 x 594.

Unchanged: Letter output, scale-to-fit centring, optional fixture schedule
inserted unmodified, per-datasheet "Page X of Y", bookmarks + /UseOutlines,
the fixture-tag rule (cut at the first space or "_"), and the
"YYYYMMDD - Project - Issuance - Luminaire Cutsheets.pdf" filename.
"""

import argparse
import io
import json
import os
import re
import sys
from datetime import date

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (ArrayObject, DecodedStreamObject, DictionaryObject,
                           FloatObject, NameObject, NumberObject)
from reportlab.pdfgen import canvas

import mz_design as D

PT = D.PT
LETTER = D.LETTER


# ── Filename / tag helpers ────────────────────────────────────────────────
# A luminaire type looks like P1, R6, P4-S, S8-S, W1-S, X1, HR1B, and may
# carry one ALL-CAPS qualifier after a space — "S8-S SERIES".  The qualifier
# is matched case-SENSITIVELY on purpose: that is what stops a space-separated
# filename like "P1 Finelite HP4.pdf" being read as the type "P1 Finelite".
TAG_BASE_RE = re.compile(
    r"^[A-Z]{1,3}\d{1,3}[A-Z]?(?:\.\d{1,2})?(?:-[A-Z0-9,]{1,6})?$", re.I)
TAG_QUAL_RE = re.compile(r"^[A-Z][A-Z0-9-]{1,11}$")


def fixture_tag_from_name(stem):
    """Everything up to the first '_'.  Spaces and dashes are kept.

    'S8-S SERIES_Finelite_HP6_Surface'  -> 'S8-S SERIES'
    'S1-S_HEW_Strip Light 75R-75S'      -> 'S1-S'
    'P1_Finelite_HP4_Circle_2FT DIA'    -> 'P1'
    'R1-S'                              -> 'R1-S'
    """
    if not stem:
        return ""
    return re.sub(r"\s+", " ", str(stem).split("_")[0]).strip()


def is_fixture_tag(tag):
    """True for 'P1', 'S8-S', 'S8-S SERIES'; false for '260722 Cutsheet Binder'."""
    if not tag:
        return False
    parts = str(tag).strip().split(" ")
    if len(parts) > 2 or not TAG_BASE_RE.match(parts[0]):
        return False
    return len(parts) == 1 or bool(TAG_QUAL_RE.match(parts[1]))


def is_fixture_file(path):
    stem = re.sub(r"\.pdf$", "", os.path.basename(path), flags=re.I)
    return is_fixture_tag(fixture_tag_from_name(stem))


def safe_part(value):
    text = re.sub(r'[\\/:*?"<>|]', "-", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text.rstrip(". ")


def package_file_name(file_date, project_name, issuance_description):
    parts = [p for p in (file_date, safe_part(project_name),
                         safe_part(issuance_description)) if p]
    parts.append("Luminaire Cutsheets")
    return " - ".join(parts) + ".pdf"


def natural_key(name):
    parts = re.split(r"(\d+)", name)
    return [int(p) if p.isdigit() else p.casefold() for p in parts]


# ── Overlay builders ──────────────────────────────────────────────────────
def make_cover_overlay(project_name, project_subtitle, issuance_description,
                       issuance_date_long, project_location,
                       project_abbreviation):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=LETTER)
    lockup = D.draw_cover(c, project_name, project_subtitle,
                          issuance_description, issuance_date_long,
                          project_location, project_abbreviation)
    c.showPage()
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0], lockup


def make_stamp_overlay(project_name, issuance_description, issuance_date_iso,
                       project_location, fixture_tag, current_page,
                       total_pages):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=LETTER)
    D.draw_page_header(c, project_name,
                       D.header_issuance_line(issuance_description,
                                              issuance_date_iso),
                       fixture_tag)
    D.draw_page_footer(c, project_location, current_page, total_pages)
    c.showPage()
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


# ── Source-page embedding (unchanged from v2) ─────────────────────────────
def embed_page_as_form(writer, src, box):
    """Wrap a source page in a Form XObject, the way pdf-lib's embedPage does.

    Isolating the source in a form keeps gradients and soft masks rendering
    correctly; inlining it into the target page flattens them.  The source
    page's /Group is deliberately NOT copied — pdf-lib leaves it off too, and
    adding a transparency group lightens rules and logos on some sheets.
    """
    x0, y0, w, h = box
    form = DecodedStreamObject()
    form.set_data(src.get_contents().get_data())
    form[NameObject("/Type")] = NameObject("/XObject")
    form[NameObject("/Subtype")] = NameObject("/Form")
    form[NameObject("/FormType")] = NumberObject(1)
    form[NameObject("/BBox")] = ArrayObject(
        [FloatObject(x0), FloatObject(y0), FloatObject(x0 + w),
         FloatObject(y0 + h)])
    form[NameObject("/Matrix")] = ArrayObject(
        [FloatObject(1), FloatObject(0), FloatObject(0),
         FloatObject(1), FloatObject(0), FloatObject(0)])
    if "/Resources" in src:
        res = src.raw_get("/Resources")
        form[NameObject("/Resources")] = (
            res.clone(writer) if hasattr(res, "clone") else res)
    return writer._add_object(form)


def source_box(page):
    box = page.mediabox
    try:
        cb = page.cropbox
        if cb is not None and float(cb.width) > 0 and float(cb.height) > 0:
            box = cb
    except Exception:
        pass
    return (float(box.left), float(box.bottom), float(box.width),
            float(box.height))


# ── Compile ───────────────────────────────────────────────────────────────
def compile_package(schedule_pdf, datasheet_pdfs, project_name,
                    project_abbreviation, issuance_date_iso, project_location,
                    issuance_description, out_dir, cover=True, subtitle="",
                    logo_path=None):
    writer = PdfWriter()
    logo = D.LogoAsset(logo_path)
    if not logo.available:
        print("WARNING: mz_wordmark.pdf not found — pages will carry the "
              "studio line but no wordmark.", file=sys.stderr)
    if not D.FONTS_OK:
        print("WARNING: ArchivoBlack.ttf not found next to this script. "
              "Falling back to Helvetica-Bold, which is ~18% narrower than "
              "the reference's Arial Black — the stamp will not match.",
              file=sys.stderr)

    formatted_date = ""
    file_date = ""
    if issuance_date_iso:
        d = date.fromisoformat(issuance_date_iso)
        formatted_date = f"{d.strftime('%B')} {d.day}, {d.year}"
        file_date = issuance_date_iso.replace("-", "")

    skipped = []
    bookmarks = []

    # ── Cover ──
    if cover:
        overlay, (sx, sy, ssize) = make_cover_overlay(
            project_name, subtitle, issuance_description, formatted_date,
            project_location, project_abbreviation)
        page = writer.add_blank_page(width=LETTER[0], height=LETTER[1])
        D.set_content(writer, page,
                      logo.wordmark_ops(writer, page, sx, sy, ssize))
        page.merge_page(overlay, over=True)
        bookmarks.append(("Cover", 0))

    # ── Fixture schedule, unmodified ──
    if schedule_pdf:
        r = PdfReader(schedule_pdf)
        if r.is_encrypted:
            r.decrypt("")
        bookmarks.append(("Fixture Schedule", len(writer.pages)))
        for p in r.pages:
            writer.add_page(p)

    # ── Datasheets ──
    for path in datasheet_pdfs:
        stem = re.sub(r"\.pdf$", "", os.path.basename(path), flags=re.I)
        tag = fixture_tag_from_name(stem)
        first_page_index = len(writer.pages)

        r = PdfReader(path)
        if r.is_encrypted:
            r.decrypt("")
        total_in_file = len(r.pages)

        for j, src in enumerate(r.pages):
            if "/Contents" not in src:
                skipped.append(f"{os.path.basename(path)} p{j + 1} "
                               f"(no content stream)")
                continue

            try:
                if int(src.get("/Rotate", 0) or 0) % 360 != 0:
                    src.transfer_rotation_to_content()
            except Exception:
                pass

            x0, y0, ow, oh = source_box(src)
            if ow <= 0 or oh <= 0:
                skipped.append(f"{os.path.basename(path)} p{j + 1} "
                               f"(zero-size page)")
                continue

            s = min(D.CONTENT_W / ow, D.CONTENT_H / oh)
            sw, sh = ow * s, oh * s
            tx = D.CONTENT["left"] + (D.CONTENT_W - sw) / 2
            ty = D.CONTENT["bottom"] + (D.CONTENT_H - sh) / 2

            new_page = writer.add_blank_page(width=LETTER[0], height=LETTER[1])
            form_ref = embed_page_as_form(writer, src, (x0, y0, ow, oh))
            res = new_page.setdefault(NameObject("/Resources"),
                                      DictionaryObject())
            xobjs = res.setdefault(NameObject("/XObject"), DictionaryObject())
            xobjs[NameObject("/MzPage")] = form_ref
            # The placed sheet and the logo share ONE content stream — see
            # LogoAsset.ops() for why a second stream would blank the page.
            D.set_content(writer, new_page, (
                f"q\n"
                f"1 0 0 1 {tx!r} {ty!r} cm\n"
                f"{s!r} 0 0 {s!r} 0 0 cm\n"
                f"1 0 0 1 {-x0!r} {-y0!r} cm\n"
                f"/MzPage Do\n"
                f"Q\n"
            ) + logo.wordmark_ops(writer, new_page, D.HDR_LOGO_X,
                                  D.HDR_LOGO_BASE, D.HDR_LOGO_SIZE))

            new_page.merge_page(
                make_stamp_overlay(project_name, issuance_description,
                                   issuance_date_iso, project_location, tag,
                                   j + 1, total_in_file),
                over=True)

        if len(writer.pages) > first_page_index:
            bookmarks.append((stem, first_page_index))

    for title, page_index in bookmarks:
        writer.add_outline_item(title, page_index)
    writer._root_object[NameObject("/PageMode")] = NameObject("/UseOutlines")

    out_name = package_file_name(file_date, project_name, issuance_description)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, out_name)
    with open(out_path, "wb") as f:
        writer.write(f)

    return {"out_path": out_path, "pages": len(writer.pages),
            "bookmarks": bookmarks, "skipped": skipped}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--schedule", default=None)
    ap.add_argument("--datasheets", nargs="+", required=True)
    ap.add_argument("--project-name", default="")
    ap.add_argument("--subtitle", default="",
                    help='second cover line, e.g. "Lighting and Controls Upgrade"')
    ap.add_argument("--abbreviation", default="")
    ap.add_argument("--date", dest="issuance_date", default="")
    ap.add_argument("--location", default="")
    ap.add_argument("--issuance-description", default="")
    ap.add_argument("--logo", default=None)
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--no-cover", action="store_true")
    ap.add_argument("--no-sort", action="store_true")
    a = ap.parse_args()

    sheets = [p for p in a.datasheets if is_fixture_file(p)]
    dropped = [p for p in a.datasheets if p not in sheets]
    if dropped:
        print("Skipping %d non-fixture PDF(s): %s" % (
            len(dropped), ", ".join(os.path.basename(p) for p in dropped[:6])
            + (" …" if len(dropped) > 6 else "")), file=sys.stderr)
    if not sheets:
        print("No fixture cutsheets found — filenames must start with a "
              "luminaire type such as P1, R6 or S8-S.", file=sys.stderr)
        return 1
    if not a.no_sort:
        sheets.sort(key=lambda p: natural_key(os.path.basename(p)))

    out_dir = a.out_dir or os.path.dirname(os.path.abspath(sheets[0]))
    res = compile_package(a.schedule, sheets, a.project_name, a.abbreviation,
                          a.issuance_date, a.location, a.issuance_description,
                          out_dir, cover=not a.no_cover, subtitle=a.subtitle,
                          logo_path=a.logo)
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    sys.exit(main())
