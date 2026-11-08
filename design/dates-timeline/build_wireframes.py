#!/usr/bin/env python3
"""
Generates the Dates timeline wireframes (mobile 375x812, monochrome, 8px grid) into ./wireframes.

    python3 design/dates-timeline/build_wireframes.py

Edit a screen function below and re-run; the SVGs are generated output, but they are committed so the
viewer (index.html) works without running anything. House style: stroke #000 1.5, fill #fff, placeholder
#e6e6e6, muted text #666, one font, sizes 12/14/20/28, annotation layer in #d33 dashed only.

The sample data is the real prod data (read from the app on 2026-11-08), so the wireframes show what the
couple would actually see.
"""
import os
from xml.sax.saxutils import escape

W, H = 375, 812
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wireframes')
FONT = '-apple-system, system-ui, sans-serif'

RAIL = 40  # x of the vertical rail
CX = 72  # x where timeline content starts
CW = 287  # width of timeline content (72..359)


class Svg:
    def __init__(self, comment):
        self.parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
            f'font-family="{FONT}" fill="#fff" stroke="#000" stroke-width="1.5">',
            f'<!-- {comment} · mobile 375x812 · 8px grid -->',
            f'<rect x="0" y="0" width="{W}" height="{H}" fill="#fff"/>',
        ]
        self.n = 0

    def add(self, s):
        self.parts.append(s)

    def rect(self, x, y, w, h, rx=0, fill='#fff', dash=False, sw=None, stroke=None):
        d = ' stroke-dasharray="6 4"' if dash else ''
        s = f' stroke-width="{sw}"' if sw is not None else ''
        c = f' stroke="{stroke}"' if stroke else ''
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{d}{s}{c}/>')

    def circle(self, cx, cy, r, fill='#fff', dash=False):
        d = ' stroke-dasharray="3 3"' if dash else ''
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{d}/>')

    def line(self, x1, y1, x2, y2, color='#000', sw=None, dash=False):
        s = f' stroke-width="{sw}"' if sw else ''
        d = ' stroke-dasharray="4 4"' if dash else ''
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}"{s}{d}/>')

    def text(self, x, y, s, size=14, anchor='start', fill='#000', bold=False):
        w = ' font-weight="700"' if bold else ''
        self.add(
            f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" stroke="none" fill="{fill}"{w}>{escape(s)}</text>'
        )

    def callout(self, y):
        """Numbered marker in the left margin, level with what it describes."""
        self.n += 1
        self.add(
            f'<g><circle cx="8" cy="{y}" r="8" fill="#fff" stroke="#d33" stroke-dasharray="3 2"/>'
            f'<text x="8" y="{y + 4}" font-size="11" text-anchor="middle" stroke="none" fill="#d33" font-weight="700">{self.n}</text></g>'
        )

    def finish(self, name):
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, name), 'w') as f:
            f.write('\n'.join(self.parts + ['</svg>']) + '\n')


# --- chrome -----------------------------------------------------------------------------------


def status_bar(s):
    s.text(16, 32, '9:41', 12, bold=True)
    s.rect(311, 22, 32, 12, 3)


def header(s, title, plus=True):
    s.text(16, 96, title, 28, bold=True)
    if plus:
        s.circle(335, 80, 24, '#000')
        s.line(327, 80, 343, 80, '#fff', 2.5)
        s.line(335, 72, 335, 88, '#fff', 2.5)


def tab_bar(s, active=4):
    s.line(0, 748, W, 748)
    for i, label in enumerate(['Today', 'Calendar', 'Lists', 'Home', 'Dates']):
        cx = 37.5 + i * 75
        on = i == active
        s.rect(cx - 28, 756, 56, 32, 16, '#000' if on else '#fff')
        s.text(cx, 777, '▫', 14, 'middle', '#fff' if on else '#000')
        s.text(cx, 804, label, 12, 'middle', '#000' if on else '#666')


CHIPS = ['All', 'Couple', 'Birthdays', 'Trips', 'Other']


def chips(s, y, active):
    x = 16
    for i, label in enumerate(CHIPS):
        w = len(label) * 8 + 32
        on = i == active
        s.rect(x, y, w, 40, 20, '#000' if on else '#fff')
        s.text(x + w / 2, y + 25, label, 14, 'middle', '#fff' if on else '#000')
        x += w + 8


def label(s, x, y, text):
    s.text(x, y, text, 12, fill='#666')


# --- timeline primitives ----------------------------------------------------------------------


def rail(s, y0, y1, dash=False):
    s.line(RAIL, y0, RAIL, y1, dash=dash)


def year_divider(s, y, year):
    """24px tall. The year, then a hairline to the right edge."""
    s.text(CX, y + 16, year, 12, bold=True)
    s.line(CX + 40, y + 12, 359, y + 12, '#e6e6e6', 1.5)


def tick(s, y, title, right, dash=False):
    """32px tall. A computed 'N years together' marker: hollow dot, one line, no card, not tappable."""
    s.circle(RAIL, y + 16, 5, '#fff', dash)
    s.text(CX, y + 21, title, 14, fill='#666' if dash else '#000')
    s.text(359, y + 21, right, 12, 'end', '#666')


def milestone(s, y, title, date, icon, h=64, dash=False):
    """64px tall card on the rail. The node holds the type icon (named, not drawn)."""
    cy = y + h // 2
    s.line(RAIL + 16, cy, CX, cy, dash=dash)
    s.rect(CX, y, CW, h, 8, dash=dash)
    s.circle(RAIL, cy, 16, '#e6e6e6', dash)
    s.text(RAIL, cy + 4, icon[:3], 12, 'middle', '#666')
    s.text(CX + 16, y + 28, title, 14, bold=True)
    s.text(CX + 16, y + 48, date, 12, fill='#666')
    s.text(343, cy + 5, '›', 20, 'middle')


def origin(s, y):
    """96px tall. The pinned first date closes the story: a filled node and a taller card."""
    cy = y + 48
    s.line(RAIL + 16, cy, CX, cy)
    s.rect(CX, y, CW, 96, 8, sw=3)
    s.circle(RAIL, cy, 16, '#000')
    s.text(RAIL, cy + 4, 'hea', 12, 'middle', '#fff')
    s.text(CX + 16, y + 28, 'First Date', 14, bold=True)
    s.text(CX + 16, y + 48, 'Tue 18 Aug 2020', 12, fill='#666')
    s.text(CX + 16, y + 72, 'Where it began · 2274 days ago', 12, fill='#666')
    s.text(343, cy + 5, '›', 20, 'middle')


def gap(s, y, text):
    """24px tall. The time between two milestones, written on the rail."""
    s.text(CX, y + 16, '↕ ' + text, 12, fill='#666')


def today_marker(s, y):
    """24px tall. Above it the rail is dashed (future), below it solid (past)."""
    s.circle(RAIL, y + 12, 8, '#000')
    s.rect(CX, y, 72, 24, 12, '#000')
    s.text(CX + 36, y + 16, 'TODAY', 12, 'middle', '#fff', bold=True)
    s.text(CX + 84, y + 16, '8 Nov 2026', 12, fill='#666')


def person(s, cx, cy, r, initial, me):
    """A couple member's round initial: filled for the signed-in user, grey for their partner."""
    s.circle(cx, cy, r, '#000' if me else '#e6e6e6')
    s.text(cx, cy + 4, initial, 14, 'middle', '#fff' if me else '#000', bold=True)


def birthday_card(s, x, y, name, turns, when, initial, me):
    s.rect(x, y, 167, 88, 8)
    person(s, x + 28, y + 28, 16, initial, me)
    s.text(x + 52, y + 33, name, 14, bold=True)
    s.text(x + 16, y + 64, turns, 12, fill='#666')
    s.text(x + 16, y + 80, when, 12, bold=True)


# --- screens ----------------------------------------------------------------------------------


def s01():
    s = Svg('01 Dates, top of the screen: hero, birthdays strip, then the timeline starts')
    status_bar(s)
    header(s, 'Dates')
    chips(s, 120, 0)
    # hero: the day counter, the same card as today, plus elapsed years and the next anniversary
    s.rect(16, 176, 343, 144, 8)
    s.text(W / 2, 204, 'First Date', 12, 'middle', '#666')
    s.text(W / 2, 240, '2274 days', 28, 'middle', bold=True)
    s.text(W / 2, 264, '6 years · 2 months · 21 days', 14, 'middle', '#666')
    s.rect(32, 280, 311, 4, 2, '#e6e6e6', sw=0)
    s.rect(32, 280, 243, 4, 2, '#000')
    s.text(32, 308, 'Next: 7 years together', 12, fill='#666')
    s.text(343, 308, '283 days to go', 12, 'end', bold=True)
    # birthdays strip
    label(s, 16, 344, 'BIRTHDAYS')
    birthday_card(s, 16, 360, 'Gonçalo', 'turns 39', 'in 88 days', 'G', True)
    birthday_card(s, 176, 360, 'Mónica', 'turns 36', 'in 223 days', 'M', False)
    # the story
    label(s, 16, 480, 'OUR STORY')
    y0 = 488
    rail(s, y0 + 16, 528, dash=True)  # future: dashed
    rail(s, 540, 748)  # past: solid, runs off the bottom
    tick(s, y0, '7 years together', 'in 283 days', dash=True)
    today_marker(s, 528)
    year_divider(s, 560, '2026')
    tick(s, 584, '6 years together', '18 Aug 2026')
    year_divider(s, 624, '2025')
    tick(s, 648, '5 years together', '18 Aug 2025')
    year_divider(s, 688, '2024')
    tick(s, 712, '4 years together', '18 Aug 2024')
    tab_bar(s)
    s.callout(80)
    s.callout(144)
    s.callout(240)
    s.callout(284)
    s.callout(404)
    s.callout(504)
    s.callout(540)
    s.callout(600)
    s.finish('01-timeline-top.svg')
    return s


def s02():
    s = Svg('02 Dates, scrolled to the origin: milestones as cards, anniversaries as ticks, First Date at the end')
    status_bar(s)
    rail(s, 56, 680)
    year_divider(s, 56, '2022')
    tick(s, 80, '2 years together', '18 Aug 2022')
    milestone(s, 120, 'Bruno comes home', '30 Apr 2022 · 4 years 6 months ago', 'sta')
    gap(s, 184, '1 week')
    milestone(s, 208, 'First trip to Porto', '23 Apr 2022 · 4 years 6 months ago', 'bag')
    gap(s, 272, '3 months')
    milestone(s, 296, 'Moved in together', '15 Jan 2022 · 4 years 9 months ago', 'sta')
    year_divider(s, 368, '2021')
    tick(s, 392, '1 year together', '18 Aug 2021')
    year_divider(s, 432, '2020')
    milestone(s, 456, 'First trip to Lisbon', '1 Dec 2020 · 5 years 11 months ago', 'bag')
    gap(s, 520, '2 months')
    milestone(s, 544, 'First trip to Porto Santo', '2 Oct 2020 · 6 years 1 month ago', 'bag')
    gap(s, 608, '6 weeks')
    origin(s, 632)
    tab_bar(s)
    s.callout(100)
    s.callout(152)
    s.callout(196)
    s.callout(404)
    s.callout(580)
    s.callout(680)
    s.finish('02-timeline-origin.svg')
    return s


def s03():
    s = Svg('03 Timeline parts: every element the rail is built from')
    status_bar(s)
    header(s, 'Parts', plus=False)
    rail(s, 136, 704)
    label(s, CX, 136, 'ORIGIN · the pinned first date')
    origin(s, 144)
    label(s, CX, 264, 'MILESTONE · any entry that is not a birthday')
    milestone(s, 272, 'First trip to Porto', '23 Apr 2022 · 4 years 6 months ago', 'bag')
    label(s, CX, 352, 'ANNIVERSARY TICK · computed, not stored')
    tick(s, 360, '2 years together', '18 Aug 2022')
    label(s, CX, 408, 'PLANNED · a date still ahead (dashed)')
    milestone(s, 416, 'Trip to Madeira', '12 Mar 2027 · in 124 days', 'bag', dash=True)
    label(s, CX, 496, 'GAP · time between two milestones')
    gap(s, 504, '3 months')
    label(s, CX, 544, 'TODAY · splits future from past')
    today_marker(s, 552)
    label(s, CX, 600, 'YEAR · divider')
    year_divider(s, 608, '2022')
    label(s, CX, 648, 'RAIL · dashed ahead, solid behind')
    rail(s, 656, 704, dash=True)
    s.text(CX, 684, 'dashed', 12, fill='#666')
    tab_bar(s)
    s.callout(212)
    s.callout(300)
    s.callout(376)
    s.callout(448)
    s.callout(512)
    s.callout(564)
    s.callout(620)
    s.callout(684)
    s.finish('03-timeline-parts.svg')
    return s


def s04():
    s = Svg('04 Trips filter: only trips, no hero, no birthdays, no ticks, no Today marker')
    status_bar(s)
    header(s, 'Dates')
    chips(s, 120, 3)
    s.rect(16, 176, 343, 80, 8)
    s.text(48, 232, '3', 28, 'middle', bold=True)
    s.text(72, 216, 'trips together', 14, bold=True)
    s.text(72, 236, 'The first was Porto Santo, Oct 2020', 12, fill='#666')
    label(s, 16, 288, 'TRIPS')
    rail(s, 312, 552)
    year_divider(s, 296, '2022')
    milestone(s, 320, 'First trip to Porto', '23 Apr 2022 · 4 years 6 months ago', 'bag')
    gap(s, 384, '1 year 4 months')
    year_divider(s, 408, '2020')
    milestone(s, 432, 'First trip to Lisbon', '1 Dec 2020 · 5 years 11 months ago', 'bag')
    gap(s, 496, '2 months')
    milestone(s, 520, 'First trip to Porto Santo', '2 Oct 2020 · 6 years 1 month ago', 'bag')
    tab_bar(s)
    s.callout(140)
    s.callout(216)
    s.callout(352)
    s.callout(404)
    s.finish('04-timeline-trips.svg')
    return s


def s05():
    s = Svg('05 Birthdays filter: the soonest first, with the age they are turning')
    status_bar(s)
    header(s, 'Dates')
    chips(s, 120, 2)
    label(s, 16, 192, 'BIRTHDAYS · 2')
    for i, (name, born, turns, days) in enumerate(
        [('Gonçalo', '4 Feb 1988', 'turns 39', '88'), ('Mónica', '19 Jun 1991', 'turns 36', '223')]
    ):
        y = 208 + i * 128
        s.rect(16, y, 343, 112, 8)
        person(s, 56, y + 56, 24, name[0], i == 0)
        s.text(96, y + 44, name, 14, bold=True)
        s.text(96, y + 64, born, 12, fill='#666')
        s.text(96, y + 84, turns, 12, bold=True)
        s.line(255, y + 24, 255, y + 88, '#e6e6e6', 1.5)
        s.text(307, y + 60, days, 28, 'middle', bold=True)
        s.text(307, y + 80, 'days', 12, 'middle', '#666')
    tab_bar(s)
    s.callout(144)
    s.callout(264)
    s.callout(324)
    s.finish('05-birthdays.svg')
    return s


def flow(screens):
    cols = [
        ('01 Top', 'The hero, birthdays, then the rail'),
        ('02 Scrolled', 'Milestones and ticks to the origin'),
        ('03 Parts', 'Every element, named'),
        ('04 Trips', 'A filter narrows the rail'),
        ('05 Birthdays', 'Own list, with ages'),
    ]
    width, height = 1200, 624
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'font-family="{FONT}" fill="#fff" stroke="#000" stroke-width="1.5">',
        '<!-- flow · canvas 1200x624 -->',
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="#fff"/>',
    ]
    s = Svg('flow')
    s.parts = parts
    s.text(48, 56, 'Dates tab — the timeline', 28, bold=True)
    s.text(48, 88, 'One scrolling story: hero, birthdays, then a rail from today back to the first date.', 14, fill='#666')
    for i, (screen, (tag, cap)) in enumerate(zip(screens, cols)):
        x = 48 + i * 228
        s.add(f'<clipPath id="c{i}"><rect x="{x}" y="128" width="188" height="406"/></clipPath>')
        s.add(f'<g clip-path="url(#c{i})"><g transform="translate({x},128) scale(0.5)">')
        s.parts.extend(screen.parts[2:])  # skip the svg tag and the comment
        s.add('</g></g>')
        s.rect(x, 128, 188, 406, 0, 'none')
        s.text(x, 560, tag, 14, bold=True)
        s.text(x, 580, cap, 12, fill='#666')
        if i == 0:
            s.line(x + 192, 330, x + 224, 330)
            s.text(x + 208, 322, 'scroll', 12, 'middle', '#666')
    s.finish('flow.svg')


if __name__ == '__main__':
    shots = [s01(), s02(), s03(), s04(), s05()]
    flow(shots)
    print('wrote', len(os.listdir(OUT)), 'files to', OUT)
