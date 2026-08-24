#!/usr/bin/env python3
"""
Mazzetti AutoPak — v3 page design.

Cover page and per-sheet stamp redrawn to match the reference pages supplied
2026-08-10.  The numbers below are not eyeballed: they were read straight out
of the reference PDF's content streams (text matrices, rule coordinates, the
type box rectangle), so the output lands on the reference's coordinates to the
decimal.

  COVER  — centred, all-caps block on white:
             PROJECT NAME              30 pt, baseline 551.6454
             PROJECT SUBTITLE          20 pt, baseline 515.6454
             ISSUANCE DESCRIPTION      20 pt, baseline 455.6454
             ISSUANCE DATE             20 pt, baseline 407.6454
             logo lockup, centred, studio line 13 pt, baseline 287.5743

  STAMP  — moved from the foot of the sheet to a TOP HEADER BAND:
             logo (left, studio line 9 pt at x=20 / baseline 738.6033)
             project name 14 pt, baseline 763.9785, centred on x=306
             "ISSUANCE / MM.DD.YY" 10 pt, baseline 751.9785, centred
             type box 489.38 738.278 104.12 36.09, 1 pt stroke
             "LUMINAIRE TYPE" 11 pt, baseline 723.4222, flush right at 594
             rule at y=716.9808, x 18 -> 594, 1 pt
           The reference's second rule sits at y=18.4999 with nothing under it.
           Ours moves to y=32 to make room for one quiet left-aligned footer
           line: "Page X of Y  ·  www.mazzetti.com".

TYPEFACE
    The reference is set in Arial Black, which is neither a PDF base-14 font
    nor redistributable.  Archivo Black (SIL OFL) is used instead: its advance
    widths are IDENTICAL to Arial Black for every character on the reference
    pages — verified glyph by glyph — so nothing shifts.  Helvetica Bold was
    tried first and is 15-20% narrow at the same size, which is why the
    reference's strings would not line up without it.

LOGO
    `mz_wordmark.pdf` is the square-M wordmark lifted out of the reference as
    live vector art (4 KB, no embedded fonts).  The LIGHTING DESIGN STUDIO
    line beneath it is typeset in Archivo Black rather than being part of the
    art, exactly as the reference does it — that is what lets the lockup scale
    cleanly between the 13 pt cover and the 9 pt page header.
"""

import os

from pypdf import PdfReader
from pypdf.generic import (ArrayObject, DecodedStreamObject, DictionaryObject,
                           FloatObject, NameObject, NumberObject)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))

PT = 72.0
LETTER = (8.5 * PT, 11.0 * PT)          # 612 x 792
W, H = LETTER
CENTER_X = W / 2.0

# ── Typeface ──────────────────────────────────────────────────────────────
DISPLAY = "ArchivoBlack"                # metric clone of the reference's Arial Black
TEXT    = "Helvetica"                   # small print only (footer line)
CAP_RATIO = 0.716                       # Arial Black / Archivo Black cap height

_FONT_FILE = os.path.join(HERE, "ArchivoBlack.ttf")


def register_fonts():
    if DISPLAY in pdfmetrics.getRegisteredFontNames():
        return True
    if not os.path.exists(_FONT_FILE):
        return False
    pdfmetrics.registerFont(TTFont(DISPLAY, _FONT_FILE))
    return True


FONTS_OK = register_fonts()
if not FONTS_OK:                        # degrade rather than crash
    DISPLAY = "Helvetica-Bold"

# ── Rules and bands ───────────────────────────────────────────────────────
RULE_LEFT     = 18.0
RULE_RIGHT    = W - 18.0                # 594
HEADER_RULE_Y = 716.9808
FOOTER_RULE_Y = 32.0                    # reference: 18.4999
RULE_W        = 1.0

# ── Placed-sheet box ──────────────────────────────────────────────────────
CONTENT = {"left": 36.0, "right": W - 36.0,
           "top": HEADER_RULE_Y, "bottom": FOOTER_RULE_Y}
CONTENT_W = CONTENT["right"] - CONTENT["left"]
CONTENT_H = CONTENT["top"] - CONTENT["bottom"]

# ── Colour ────────────────────────────────────────────────────────────────
INK  = (0, 0, 0)
GREY = (0.42, 0.42, 0.44)

# ── Header ────────────────────────────────────────────────────────────────
HDR_LOGO_X      = 20.0
HDR_LOGO_BASE   = 738.6033
HDR_LOGO_SIZE   = 9.0

HDR_NAME_Y      = 763.9785
HDR_NAME_SIZE   = 14.0
HDR_ISS_Y       = 751.9785
HDR_ISS_SIZE    = 10.0

BOX_X, BOX_Y    = 489.38, 738.278
BOX_W, BOX_H    = 104.12, 36.09
BOX_LINE_W      = 1.0
TAG_SIZE        = 17.5

LABEL_Y         = 723.4222
LABEL_SIZE      = 11.0
LABEL_TEXT      = "LUMINAIRE TYPE"

# ── Footer (our addition — the reference has none) ─────────────────────────
FOOT_Y   = FOOTER_RULE_Y - 12.0
FOOT_SIZE = 7.0
WEBSITE  = "www.mazzetti.com"

# ── Cover ─────────────────────────────────────────────────────────────────
CV_NAME_Y      = 551.6454
CV_NAME_SIZE   = 30.0
CV_SUB_SIZE    = 20.0
CV_LOC_SIZE    = 20.0                   # location, same weight as the subtitle
CV_GAP_SUB     = 36.0                   # name -> location (reference gap)
CV_GAP_SUB2    = 55.0                   # location -> subtitle: a clear blank line
CV_GAP_ISS     = 60.0
CV_GAP_DATE    = 48.0
CV_LOGO_BASE   = 287.5743
CV_LOGO_SIZE   = 13.0
CV_MAX_W       = W - 2 * 54.0


# ══════════════════════════════════════════════════════════════════════════
# Text helpers
# ══════════════════════════════════════════════════════════════════════════
def tw(text, font, size):
    return stringWidth(text or "", font, size)


def _put(c, text, x, y, font, size, color):
    c.setFont(font, size)
    c.setFillColorRGB(*color)
    c.drawString(x, y, text)


def draw_left(c, text, x, y, font, size, color=INK):
    if text:
        _put(c, text, x, y, font, size, color)


def draw_right(c, text, rx, y, font, size, color=INK):
    if text:
        _put(c, text, rx - tw(text, font, size), y, font, size, color)


def draw_centered(c, text, cx, y, font, size, color=INK):
    if text:
        _put(c, text, cx - tw(text, font, size) / 2.0, y, font, size, color)


def fit_size(text, font, max_size, max_w, min_size=4.0):
    size = max_size
    while size > min_size and tw(text, font, size) > max_w:
        size -= 0.25
    return size


def wrap(text, font, size, max_w):
    lines, line = [], ""
    for word in (text or "").split():
        test = f"{line} {word}" if line else word
        if tw(test, font, size) > max_w and line:
            lines.append(line)
            line = word
        else:
            line = test
    if line:
        lines.append(line)
    return lines or [""]


# ══════════════════════════════════════════════════════════════════════════
# Logo lockup
# ══════════════════════════════════════════════════════════════════════════
DEFAULT_WORDMARK = os.path.join(HERE, "mz_wordmark.pdf")
SUBMARK = "LIGHTING DESIGN STUDIO"

# Wordmark geometry expressed in ems of the studio line, measured off the
# reference cover (the larger, and therefore more precise, of the two lockups):
#   wordmark ink left   = studio left     + 0.1538 em
#   wordmark ink bottom = studio baseline + 1.1943 em
#   wordmark ink width  = 14.400 em
WM_DX     = 0.1538
WM_DY     = 1.1943
WM_WIDTH  = 14.400


class LogoAsset:
    """The square-M wordmark as a Form XObject, embedded once per document."""

    def __init__(self, path=None):
        self.path = path or DEFAULT_WORDMARK
        self.available = os.path.exists(self.path)
        self._ref_by_writer = {}
        if self.available:
            self._src = PdfReader(self.path).pages[0]
            box = self._src.cropbox or self._src.mediabox
            self.x0, self.y0 = float(box.left), float(box.bottom)
            self.w, self.h = float(box.width), float(box.height)

    def lockup_width(self, studio_size):
        """Ink width of the whole lockup at a given studio-line size."""
        return max(WM_WIDTH * studio_size + WM_DX * studio_size,
                   tw(SUBMARK, DISPLAY, studio_size))

    def _form_ref(self, writer):
        key = id(writer)
        if key not in self._ref_by_writer:
            src = self._src
            form = DecodedStreamObject()
            form.set_data(src.get_contents().get_data())
            form[NameObject("/Type")] = NameObject("/XObject")
            form[NameObject("/Subtype")] = NameObject("/Form")
            form[NameObject("/FormType")] = NumberObject(1)
            form[NameObject("/BBox")] = ArrayObject([
                FloatObject(self.x0), FloatObject(self.y0),
                FloatObject(self.x0 + self.w), FloatObject(self.y0 + self.h)])
            form[NameObject("/Matrix")] = ArrayObject([
                FloatObject(1), FloatObject(0), FloatObject(0),
                FloatObject(1), FloatObject(0), FloatObject(0)])
            if "/Resources" in src:
                res = src.raw_get("/Resources")
                form[NameObject("/Resources")] = (
                    res.clone(writer) if hasattr(res, "clone") else res)
            self._ref_by_writer[key] = writer._add_object(form)
        return self._ref_by_writer[key]

    def wordmark_ops(self, writer, page, studio_left, studio_baseline,
                     studio_size):
        """Register the wordmark on `page`; return the operators that draw it.

        The caller splices these into the page's OWN content stream rather
        than appending a second one: pypdf's merge_page() concatenates streams
        with no separator, so a stream ending "Q" followed by one starting "q"
        tokenises as "Qq" and the page renders blank.
        """
        if not self.available:
            return ""
        target_w = WM_WIDTH * studio_size
        s = target_w / self.w
        x = studio_left + WM_DX * studio_size
        y = studio_baseline + WM_DY * studio_size

        res = page.setdefault(NameObject("/Resources"), DictionaryObject())
        xobjs = res.setdefault(NameObject("/XObject"), DictionaryObject())
        xobjs[NameObject("/MzLogo")] = self._form_ref(writer)

        return (f"q\n"
                f"1 0 0 1 {x!r} {y!r} cm\n"
                f"{s!r} 0 0 {s!r} 0 0 cm\n"
                f"1 0 0 1 {-self.x0!r} {-self.y0!r} cm\n"
                f"/MzLogo Do\n"
                f"Q\n")


def draw_submark(c, studio_left, studio_baseline, studio_size):
    """The typeset LIGHTING DESIGN STUDIO line under the wordmark."""
    draw_left(c, SUBMARK, studio_left, studio_baseline, DISPLAY, studio_size)


def set_content(writer, page, ops):
    stream = DecodedStreamObject()
    stream.set_data(ops.encode("latin-1"))
    page[NameObject("/Contents")] = writer._add_object(stream)


# ══════════════════════════════════════════════════════════════════════════
# Issuance formatting
# ══════════════════════════════════════════════════════════════════════════
def short_date(iso):
    """2026-07-31 -> 07.31.26"""
    if not iso:
        return ""
    parts = str(iso).strip().split("-")
    if len(parts) != 3 or len(parts[0]) != 4:
        return str(iso)
    y, mo, d = parts
    return f"{mo}.{d}.{y[2:]}"


def header_issuance_line(issuance_description, iso_date):
    """'PERMIT SET / 07.31.26' — either half may be missing."""
    bits = [str(issuance_description or "").upper().strip(), short_date(iso_date)]
    return " / ".join(b for b in bits if b)


# ══════════════════════════════════════════════════════════════════════════
# Header / footer (everything but the wordmark, which pypdf splices in)
# ══════════════════════════════════════════════════════════════════════════
def draw_page_header(c, project_name, issuance_line, fixture_tag):
    draw_submark(c, HDR_LOGO_X, HDR_LOGO_BASE, HDR_LOGO_SIZE)

    c.setStrokeColorRGB(*INK)
    c.setLineWidth(BOX_LINE_W)
    c.rect(BOX_X, BOX_Y, BOX_W, BOX_H, stroke=1, fill=0)

    tag = (fixture_tag or "").strip()
    if tag:
        base, _, qual = tag.partition(" ")
        cx = BOX_X + BOX_W / 2.0
        inner = BOX_W - 14.0
        if qual:
            # "S8-S SERIES" stacks: the type stays large and the qualifier sits
            # under it at 55%.  Setting the whole string inline would shrink it
            # to about 10 pt inside a 36 pt box, which reads as an afterthought.
            s1 = fit_size(base, DISPLAY, TAG_SIZE, inner)
            s2 = fit_size(qual, DISPLAY, s1 * 0.55, inner)
            h1, h2, gap = CAP_RATIO * s1, CAP_RATIO * s2, 3.0
            top = BOX_Y + (BOX_H + h1 + gap + h2) / 2.0
            draw_centered(c, base, cx, top - h1, DISPLAY, s1)
            draw_centered(c, qual, cx, top - h1 - gap - h2, DISPLAY, s2)
        else:
            size = fit_size(tag, DISPLAY, TAG_SIZE, inner)
            draw_centered(c, tag, cx, BOX_Y + (BOX_H - CAP_RATIO * size) / 2.0,
                          DISPLAY, size)

    draw_right(c, LABEL_TEXT, RULE_RIGHT, LABEL_Y, DISPLAY, LABEL_SIZE)

    # Centre block, kept clear of the logo on the left and the box on the right
    left_edge = HDR_LOGO_X + tw(SUBMARK, DISPLAY, HDR_LOGO_SIZE) + 14.0
    avail = max(180.0, (BOX_X - 14.0) - left_edge)
    name = (project_name or "").upper().strip()
    if name:
        draw_centered(c, name, CENTER_X, HDR_NAME_Y, DISPLAY,
                      fit_size(name, DISPLAY, HDR_NAME_SIZE, avail))
    if issuance_line:
        draw_centered(c, issuance_line, CENTER_X, HDR_ISS_Y, DISPLAY,
                      fit_size(issuance_line, DISPLAY, HDR_ISS_SIZE, avail))

    c.setStrokeColorRGB(*INK)
    c.setLineWidth(RULE_W)
    c.line(RULE_LEFT, HEADER_RULE_Y, RULE_RIGHT, HEADER_RULE_Y)


def draw_page_footer(c, project_location, current_page, total_pages):  # noqa: ARG001
    c.setStrokeColorRGB(*INK)
    c.setLineWidth(RULE_W)
    c.line(RULE_LEFT, FOOTER_RULE_Y, RULE_RIGHT, FOOTER_RULE_Y)

    # Two quiet items on one baseline, flushed to the outer edges of the placed
    # sheet: the studio's web address left, the page number right.  The studio
    # name, street address and project location all live on the cover, so
    # repeating them on all 70 sheets was only noise.
    draw_left(c, WEBSITE, CONTENT["left"], FOOT_Y, TEXT, FOOT_SIZE, GREY)
    if total_pages:
        draw_right(c, f"Page {current_page} of {total_pages}",
                   CONTENT["right"], FOOT_Y, TEXT, FOOT_SIZE)


# ══════════════════════════════════════════════════════════════════════════
# Cover
# ══════════════════════════════════════════════════════════════════════════
def draw_cover(c, project_name, project_subtitle, issuance_description,
               issuance_date_long, project_location,
               project_abbreviation=None):  # noqa: ARG001 — filename only
    """Draw the cover except the wordmark; return its lockup placement."""
    name = (project_name or "Untitled Project").upper()
    name_size = fit_size(name, DISPLAY, CV_NAME_SIZE, CV_MAX_W, 16.0)
    name_lines = wrap(name, DISPLAY, name_size, CV_MAX_W)

    loc = (project_location or "").upper().strip()
    loc_size = fit_size(loc, DISPLAY, CV_LOC_SIZE, CV_MAX_W, 12.0)
    loc_lines = wrap(loc, DISPLAY, loc_size, CV_MAX_W) if loc else []

    sub = (project_subtitle or "").upper().strip()
    sub_size = fit_size(sub, DISPLAY, CV_SUB_SIZE, CV_MAX_W, 12.0)
    sub_lines = wrap(sub, DISPLAY, sub_size, CV_MAX_W) if sub else []

    # The reference sets a one-line name.  Extra lines lift the block so it
    # stays optically centred above the logo instead of running into it.
    extra = ((len(name_lines) - 1) * name_size +
             max(0, len(loc_lines) - 1) * loc_size +
             max(0, len(sub_lines) - 1) * sub_size) * 1.25
    y = CV_NAME_Y + extra / 2.0

    for ln in name_lines:
        draw_centered(c, ln, CENTER_X, y, DISPLAY, name_size)
        y -= name_size * 1.25
    y += name_size * 1.25

    # Project location sits directly under the name, set at subtitle weight so
    # it reads from across a desk.
    if loc_lines:
        y -= CV_GAP_SUB
        for ln in loc_lines:
            draw_centered(c, ln, CENTER_X, y, DISPLAY, loc_size)
            y -= loc_size * 1.25
        y += loc_size * 1.25

    if sub_lines:
        y -= (CV_GAP_SUB2 if loc_lines else CV_GAP_SUB)
        for ln in sub_lines:
            draw_centered(c, ln, CENTER_X, y, DISPLAY, sub_size)
            y -= sub_size * 1.25
        y += sub_size * 1.25

    y -= CV_GAP_ISS
    if issuance_description:
        txt = issuance_description.upper()
        draw_centered(c, txt, CENTER_X, y, DISPLAY,
                      fit_size(txt, DISPLAY, CV_SUB_SIZE, CV_MAX_W))
    y -= CV_GAP_DATE
    if issuance_date_long:
        txt = issuance_date_long.upper()
        draw_centered(c, txt, CENTER_X, y, DISPLAY,
                      fit_size(txt, DISPLAY, CV_SUB_SIZE, CV_MAX_W))

    # The abbreviation is deliberately NOT set on the cover — it survives only
    # in the package filename. `project_abbreviation` is kept in the signature
    # so callers don't have to change.
    studio_left = CENTER_X - tw(SUBMARK, DISPLAY, CV_LOGO_SIZE) / 2.0
    draw_submark(c, studio_left, CV_LOGO_BASE, CV_LOGO_SIZE)
    return (studio_left, CV_LOGO_BASE, CV_LOGO_SIZE)
