#!/usr/bin/env python3
"""
Generates the meal-prep wireframes (mobile 375x812, monochrome, 8px grid) into ./wireframes.

    python3 design/meal-prep/build_wireframes.py

Edit a screen function below and re-run; the SVGs are generated output, but they are committed so the
viewer (index.html) works without running anything. House style: stroke #000 1.5, fill #fff, placeholder
#e6e6e6, muted text #666, one font, sizes 12/14/20/28, annotation layer in #d33 dashed only.
"""
import os
from xml.sax.saxutils import escape

W, H = 375, 812
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wireframes')
FONT = '-apple-system, system-ui, sans-serif'


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

    def group(self, opacity=None):
        self.parts.append(f'<g opacity="{opacity}">' if opacity else '<g>')

    def end(self):
        self.parts.append('</g>')

    def rect(self, x, y, w, h, rx=0, fill='#fff', dash=False, sw=None):
        d = ' stroke-dasharray="6 4"' if dash else ''
        s = f' stroke-width="{sw}"' if sw is not None else ''
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{d}{s}/>')

    def circle(self, cx, cy, r, fill='#fff'):
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>')

    def line(self, x1, y1, x2, y2, color='#000', sw=None):
        s = f' stroke-width="{sw}"' if sw else ''
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}"{s}/>')

    def text(self, x, y, s, size=14, anchor='start', fill='#000', bold=False):
        w = ' font-weight="700"' if bold else ''
        self.add(
            f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" stroke="none" fill="{fill}"{w}>{escape(s)}</text>'
        )

    # --- annotation layer: red, dashed, numbered ---
    def callout(self, x, y):
        """Numbered marker in the left margin, level with what it describes (x is ignored on purpose)."""
        self.n += 1
        x = 8
        self.add(
            f'<g><circle cx="{x}" cy="{y}" r="8" fill="#fff" stroke="#d33" stroke-dasharray="3 2"/>'
            f'<text x="{x}" y="{y + 4}" font-size="11" text-anchor="middle" stroke="none" fill="#d33" font-weight="700">{self.n}</text></g>'
        )

    def finish(self, name):
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, name), 'w') as f:
            f.write('\n'.join(self.parts + ['</svg>']) + '\n')


# --- primitives -------------------------------------------------------------------------------


def status_bar(s):
    s.text(16, 32, '9:41', 12, bold=True)
    s.rect(311, 22, 32, 12, 3)


def header(s, title, plus=True, back=None):
    if back:
        s.text(16, 72, '‹ ' + back, 14)
    s.text(16, 96, title, 28, bold=True)
    if plus:
        s.circle(335, 80, 24, '#000')
        s.line(327, 80, 343, 80, '#fff', 2.5)
        s.line(335, 72, 335, 88, '#fff', 2.5)


def segmented(s, y, options, active):
    s.rect(16, y, 343, 48, 8, '#e6e6e6')
    w = 335 // len(options)
    for i, label in enumerate(options):
        x = 20 + i * w
        on = i == active
        s.rect(x, y + 4, w, 40, 6, '#000' if on else '#e6e6e6', sw=None if on else 0)
        s.text(x + w / 2, y + 29, label, 14, 'middle', '#fff' if on else '#000', bold=on)


def tab_bar(s, active):
    s.line(0, 748, W, 748)
    labels = ['Today', 'Calendar', 'Lists', 'Home', 'Dates']
    for i, label in enumerate(labels):
        cx = 37.5 + i * 75
        on = i == active
        s.rect(cx - 28, 756, 56, 32, 16, '#000' if on else '#fff')
        s.text(cx, 777, '▫', 14, 'middle', '#fff' if on else '#000')
        s.text(cx, 804, label, 12, 'middle', '#000' if on else '#666')


def input_box(s, x, y, w, placeholder, h=48, value=False):
    s.rect(x, y, w, h, 8)
    s.text(x + 12, y + h / 2 + 5, placeholder, 14, fill='#000' if value else '#666')


def button(s, x, y, w, label, filled=True, h=48, dash=False):
    s.rect(x, y, w, h, 8, '#000' if filled else '#fff', dash=dash)
    s.text(x + w / 2, y + h / 2 + 5, label, 14, 'middle', '#fff' if filled else '#000', bold=filled)


def chip(s, x, y, label, active=False, w=None):
    w = w or (len(label) * 8 + 32)
    s.rect(x, y, w, 40, 20, '#000' if active else '#fff')
    s.text(x + w / 2, y + 25, label, 14, 'middle', '#fff' if active else '#000')
    return w


def card(s, x, y, w, h):
    s.rect(x, y, w, h, 8)


def stepper(s, x, y, value, small=True):
    s.rect(x, y, 32, 32, 16)
    s.text(x + 16, y + 21, '−', 14, 'middle')
    s.text(x + 48, y + 21, str(value), 14, 'middle', bold=True)
    s.rect(x + 64, y, 32, 32, 16)
    s.text(x + 80, y + 21, '+', 14, 'middle')


def checkbox(s, x, y, on):
    s.rect(x, y, 24, 24, 4, '#000' if on else '#fff')
    if on:
        s.text(x + 12, y + 18, '✓', 14, 'middle', '#fff', bold=True)


def pill(s, x, y, label, on=False):
    w = len(label) * 7 + 16
    s.rect(x, y, w, 24, 12, '#e6e6e6' if on else '#fff')
    s.text(x + w / 2, y + 16, label, 12, 'middle')
    return w


def recipe_card(s, y, name, meta, h=88):
    card(s, 16, y, 343, h)
    s.circle(52, y + h / 2, 20, '#e6e6e6')
    s.text(84, y + h / 2 - 4, name, 14, bold=True)
    s.text(84, y + h / 2 + 16, meta, 12, fill='#666')
    s.text(335, y + h / 2 + 5, '›', 20, 'middle')


def ghost(s, draw):
    """Draw the screen behind a sheet, faded."""
    s.group('0.25')
    draw(s)
    s.end()
    s.rect(0, 0, W, H, 0, '#000')  # scrim replaces the fill below via opacity trick
    s.parts[-1] = f'<rect x="0" y="0" width="{W}" height="{H}" fill="#000" opacity="0.35" stroke="none"/>'


def sheet(s, top, title, back=None, step=None, footer=None):
    s.rect(0, top, W, H - top + 16, 16)
    s.rect(168, top + 8, 40, 4, 2, '#000')
    s.text(W / 2, top + 40, title, 14, 'middle', bold=True)
    if back:
        s.text(16, top + 72, '‹ ' + back, 14, bold=True)
    if step:
        s.text(359, top + 72, f'Step {step[0]} of {step[1]}', 12, 'end', '#666')
        w = 335 // step[1] - 8
        for i in range(step[1]):
            s.rect(16 + i * (w + 8), top + 88, w, 4, 2, '#000' if i < step[0] else '#e6e6e6')
    if footer:
        button(s, 16, 740, 343, footer)


# --- ghost backgrounds ------------------------------------------------------------------------


def lists_screen(s):
    status_bar(s)
    header(s, 'Lists')
    segmented(s, 128, ['Lists', 'Recipes', 'Plan'], 0)
    for i, (n, m) in enumerate([('Groceries', 'Groceries · 2 of 9'), ('Pharmacy', 'Pharmacy')]):
        card(s, 16, 208 + i * 96, 343, 80)
        s.circle(52, 248 + i * 96, 20, '#e6e6e6')
        s.text(84, 244 + i * 96, n, 14, bold=True)
        s.text(84, 264 + i * 96, m, 12, fill='#666')
    tab_bar(s, 2)


def week_header(s, y, label, sub):
    """Week navigator: previous, the week, next. A plan always exists for the week shown."""
    s.circle(36, y + 24, 20)
    s.text(36, y + 31, '\u2039', 24, 'middle')
    s.text(W / 2, y + 22, label, 16, 'middle', bold=True)
    s.text(W / 2, y + 42, sub, 12, 'middle', '#666')
    s.circle(339, y + 24, 20)
    s.text(339, y + 31, '\u203a', 24, 'middle')


def plan_screen(s, filled=True):
    status_bar(s)
    header(s, 'Plan', plus=False)
    segmented(s, 128, ['Lists', 'Recipes', 'Plan'], 2)
    tab_bar(s, 2)
    week_header(s, 188, 'Mon 9 \u2013 Sun 15 Nov', 'This week')
    if filled:
        for i, (n, k) in enumerate([('Spaghetti carbonara', 4), ('Chicken curry', 4), ('Lentil soup', 2)]):
            y = 252 + i * 80
            card(s, 16, y, 343, 72)
            s.text(32, y + 32, n, 14, bold=True)
            s.text(32, y + 52, 'servings', 12, fill='#666')
            stepper(s, 191, y + 20, k)
            s.text(335, y + 41, '\u00d7', 20, 'middle')
        button(s, 16, 500, 343, '+ Add recipes', False, 48, True)
    else:
        card(s, 16, 252, 343, 120)
        s.text(W / 2, 296, 'Nothing planned for this week', 14, 'middle', bold=True)
        s.text(W / 2, 318, 'Pick the recipes you want to cook.', 12, 'middle', '#666')
        button(s, 32, 328, 311, 'Add recipes', True, 32)


def recipes_screen(s):
    status_bar(s)
    header(s, 'Recipes')
    segmented(s, 128, ['Lists', 'Recipes', 'Plan'], 1)
    input_box(s, 16, 192, 343, 'Search recipes')
    recipe_card(s, 256, 'Spaghetti carbonara', '4 ingredients · 4 servings')
    recipe_card(s, 352, 'Chicken curry', '9 ingredients · 4 servings')
    recipe_card(s, 448, 'Lentil soup', '7 ingredients · 2 servings')
    tab_bar(s, 2)


# --- screens ----------------------------------------------------------------------------------


def s01():
    s = Svg('01 Lists tab: Lists | Recipes | Plan (Recipes shipped in PR B, Plan arrives in PR C)')
    recipes_screen(s)
    s.callout(343, 152)
    s.callout(343, 216)
    s.callout(343, 300)
    s.finish('01-recipes-library.svg')


def s02():
    s = Svg('02 Recipe sheet (PR B; steps, notes and source added; import moved to screen 12)')
    ghost(s, recipes_screen)
    sheet(s, 96, 'New recipe', footer='Save')
    s.text(16, 160, 'NAME', 12, fill='#666')
    input_box(s, 16, 168, 343, 'Spaghetti carbonara', 48, True)
    s.text(16, 256, 'SERVINGS', 12, fill='#666')
    stepper(s, 263, 240, 4)
    s.text(16, 304, 'INGREDIENTS', 12, fill='#666')
    input_box(s, 16, 312, 343, 'Add an ingredient, e.g. 400 g spaghetti')
    card(s, 16, 376, 343, 96)
    for i, (n, q, p) in enumerate([('Spaghetti', '400 g', False), ('Salt', '1 tsp', True)]):
        y = 376 + i * 48
        if i:
            s.line(16, y, 359, y)
        s.text(32, y + 29, n, 14, bold=True)
        s.text(160, y + 29, q, 14, fill='#666')
        pill(s, 232, y + 12, 'Pantry', p)
        s.text(341, y + 29, '\u00d7', 20, 'middle')
    s.text(16, 496, 'STEPS', 12, fill='#666')
    s.rect(16, 504, 343, 56, 8)
    s.text(28, 536, 'Add a step, e.g. Boil the pasta for 10 minutes', 12, fill='#666')
    button(s, 16, 568, 120, 'Add step', False, 32)
    card(s, 16, 612, 343, 104)
    s.text(32, 640, '1.', 14, bold=True, fill='#666')
    s.text(60, 640, 'Boil the pasta.', 14)
    s.line(16, 664, 359, 664)
    s.rect(16, 664, 343, 52, 8, '#e6e6e6')
    s.text(32, 694, '2.', 14, bold=True, fill='#666')
    s.text(60, 694, 'Fry the guanciale.', 14)
    s.text(W / 2, 730, 'Notes and Source continue below', 11, 'middle', '#666')
    s.callout(343, 128)
    s.callout(343, 336)
    s.callout(343, 400)
    s.callout(343, 532)
    s.callout(343, 690)
    s.finish('02-recipe-sheet.svg')


def s03():
    s = Svg('03 Plan: a week of recipes (PR C, redesigned)')
    plan_screen(s)
    card(s, 16, 560, 343, 136)
    s.text(32, 588, 'Shopping list', 14, bold=True)
    s.text(32, 608, '6 items \u00b7 2 bought', 12, fill='#666')
    s.rect(212, 574, 131, 28, 14, '#e6e6e6')
    s.text(277, 593, 'Plan changed', 12, 'middle', bold=True)
    button(s, 32, 624, 311, 'Open list', True, 56 - 16)
    s.text(W / 2, 722, 'Clear this week', 12, 'middle', '#666')
    s.callout(343, 150)
    s.callout(343, 212)
    s.callout(343, 292)
    s.callout(343, 524)
    s.callout(343, 588)
    s.callout(343, 722)
    s.finish('03-plan.svg')


def s13():
    s = Svg('13 Plan: a week with nothing planned yet')
    plan_screen(s, filled=False)
    s.callout(343, 212)
    s.callout(343, 340)
    s.finish('13-plan-empty-week.svg')


def s04():
    s = Svg('04 Pick recipes sheet (PR C, reused by the wizard in PR D)')
    ghost(s, lambda x: plan_screen(x, True))
    sheet(s, 96, 'Add recipes', footer='Add 2 recipes')
    input_box(s, 16, 128, 343, 'Search recipes or ingredients')
    rows = [('Spaghetti carbonara', '4 ingredients', 0), ('Chicken curry', '9 ingredients', 4), ('Lentil soup', '7 ingredients', 2),
            ('Salmon traybake', '6 ingredients', 0), ('Shakshuka', '8 ingredients', 0)]
    for i, (n, m, k) in enumerate(rows):
        y = 200 + i * 64
        if i:
            s.line(16, y, 359, y)
        checkbox(s, 16, y + 20, bool(k))
        s.text(56, y + 28, n, 14, bold=True)
        s.text(56, y + 46, m, 12, fill='#666')
        if k:
            stepper(s, 263, y + 16, k)
    s.callout(343, 152)
    s.callout(343, 248)
    s.callout(343, 330)
    s.finish('04-pick-recipes.svg')


def s05():
    s = Svg('05 Generated grocery list (PR C)')
    status_bar(s)
    header(s, 'Groceries', plus=False, back='Lists')
    card(s, 16, 120, 343, 72)
    s.text(32, 148, 'From plan · 9–15 Nov', 14, bold=True)
    s.text(32, 168, '3 recipes · 21 items', 12, fill='#666')
    button(s, 207, 136, 136, 'Update from plan', False, 40)
    card(s, 16, 208, 343, 296)
    rows = [('Spaghetti', 'Carbonara', '800 g'), ('Eggs', 'Carbonara', '6'), ('Chicken thighs', 'Curry', '700 g'),
            ('Onions', 'Curry, Lentil soup', '3'), ('Red lentils', 'Lentil soup', '250 g')]
    for i, (n, src, q) in enumerate(rows):
        y = 208 + i * 56
        if i:
            s.line(16, y, 359, y)
        checkbox(s, 32, y + 16, False)
        s.text(72, y + 26, n, 14, bold=True)
        s.text(72, y + 44, src, 12, fill='#666')
        s.text(343, y + 33, q, 14, 'end', '#666')
    s.rect(16, 528, 343, 144, 8, '#e6e6e6')
    s.text(32, 556, 'Pantry staples · 7 left out', 14, bold=True)
    s.text(343, 556, '⌃', 14, 'end')
    s.text(32, 576, 'Tap to add what you have run out of', 12, fill='#666')
    x = 32
    for label in ['+ Salt', '+ Olive oil', '+ Pepper']:
        x += pill(s, x, 600, label) + 8
    x = 32
    for label in ['+ Flour', '+ Cumin', '+ Paprika']:
        x += pill(s, x, 640, label) + 8
    s.callout(343, 148)
    s.callout(343, 296)
    s.callout(343, 576)
    s.finish('05-grocery-list.svg')


def wizard_ghost(s):
    lists_screen(s)


def s06():
    s = Svg('06 New list wizard, step 1: type (PR D)')
    ghost(s, wizard_ghost)
    top = 320
    sheet(s, top, 'New list', step=(1, 4))
    s.text(16, top + 136, 'What kind of list?', 20, bold=True)
    for i, label in enumerate(['Groceries', 'Pharmacy', 'Packing', 'Household', 'Blank']):
        x, y = 16 + (i % 3) * 115, top + 160 + (i // 3) * 88
        s.rect(x, y, 107, 72, 8, '#e6e6e6' if i == 0 else '#fff')
        s.circle(x + 53, y + 28, 12, '#fff')
        s.text(x + 53, y + 60, label, 14, 'middle', bold=i == 0)
    s.callout(343, top + 88)
    s.callout(343, top + 200)
    s.finish('06-wizard-type.svg')


def choice_tile(s, y, title, hint, selected=False, h=72):
    """A full-width choice: title and one line of help. The selected tile is outlined heavier and filled light."""
    s.rect(16, y, 343, h, 8, '#e6e6e6' if selected else '#fff', sw=3 if selected else None)
    s.text(32, y + 30, title, 16, bold=True)
    s.text(32, y + 52, hint, 12, fill='#666')


def s07():
    s = Svg('07 New list wizard, step 2: name and start (PR D, tiles)')
    ghost(s, wizard_ghost)
    top = 224
    sheet(s, top, 'New list', back='Groceries', step=(2, 4))
    s.text(16, top + 136, 'Name your list', 20, bold=True)
    input_box(s, 16, top + 152, 343, 'Groceries', 48, True)
    s.text(16, top + 232, 'START FROM', 12, fill='#666')
    choice_tile(s, top + 248, 'Empty list', 'Add items yourself.', False)
    choice_tile(s, top + 332, 'From a meal plan', 'Pick recipes; their ingredients are added, in metric.', True)
    button(s, 16, 740, 343, 'Continue')
    s.callout(343, top + 88)
    s.callout(343, top + 284)
    s.callout(343, top + 368)
    s.callout(343, 764)
    s.finish('07-wizard-name.svg')


def s08():
    s = Svg('08 New list wizard, step 3: recipes (PR D)')
    ghost(s, wizard_ghost)
    top = 96
    sheet(s, top, 'New list', back='Groceries', step=(3, 4), footer='Continue · 2 recipes')
    s.text(16, top + 136, 'Which recipes?', 20, bold=True)
    x = 16
    for i, label in enumerate(['This week', 'Next week', 'Custom']):
        x += chip(s, x, top + 152, label, i == 0) + 8
    input_box(s, 16, top + 208, 343, 'Search recipes or ingredients')
    for i, (n, m, k) in enumerate([('Spaghetti carbonara', '4 ingredients', 4), ('Chicken curry', '9 ingredients', 4),
                                   ('Lentil soup', '7 ingredients', 0), ('Salmon traybake', '6 ingredients', 0)]):
        y = top + 272 + i * 64
        if i:
            s.line(16, y, 359, y)
        checkbox(s, 16, y + 20, bool(k))
        s.text(56, y + 28, n, 14, bold=True)
        s.text(56, y + 46, m, 12, fill='#666')
        if k:
            stepper(s, 263, y + 16, k)
    s.callout(343, top + 172)
    s.callout(343, top + 320)
    s.finish('08-wizard-recipes.svg')


def s09():
    s = Svg('09 New list wizard, step 4: review (PR D, duplicates PR G)')
    ghost(s, wizard_ghost)
    top = 96
    sheet(s, top, 'New list', back='Groceries', step=(4, 4), footer='Create list')
    s.text(16, top + 136, 'Review ingredients', 20, bold=True)
    s.text(16, top + 160, '21 to buy · 7 pantry staples left out', 12, fill='#666')
    card(s, 16, top + 176, 343, 224)
    for i, (n, src, q, on) in enumerate([('Spaghetti', 'Carbonara', '800 g', True), ('Onions', 'Curry, Lentil soup', '3', False),
                                         ('Meat', 'Stew', '1 kg', True), ('Meet', 'Chilli', '500 g', True)]):
        y = top + 176 + i * 56
        if i:
            s.line(16, y, 359, y)
        checkbox(s, 32, y + 16, on)
        s.text(72, y + 26, n, 14, bold=True, fill='#000' if on else '#666')
        s.text(72, y + 44, src, 12, fill='#666')
        s.text(343, y + 33, q, 14, 'end', '#666')
    # Possible duplicate: a suggestion under the rows, never applied until the member taps Merge.
    s.rect(16, top + 412, 343, 92, 8, '#e6e6e6', dash=True)
    s.text(32, top + 436, 'POSSIBLE DUPLICATE', 11, fill='#666', bold=True)
    s.text(32, top + 458, 'Meat \u2194 Meet', 14, bold=True)
    button(s, 32, top + 466, 140, 'Merge', h=30)
    button(s, 184, top + 466, 160, 'Keep separate', filled=False, h=30)
    s.rect(16, top + 516, 343, 56, 8, '#e6e6e6')
    s.text(32, top + 549, 'Pantry staples · 7 left out', 14, bold=True)
    s.text(343, top + 549, '\u2304', 14, 'end')
    s.callout(343, top + 160)
    s.callout(343, top + 200)
    s.callout(343, top + 340)
    s.callout(343, top + 458)
    s.callout(343, top + 544)
    s.finish('09-wizard-review.svg')


def s10():
    s = Svg('10 Import recipes from markdown: entry (PR E)')
    ghost(s, recipes_screen)
    top = 96
    sheet(s, top, 'Import recipes', footer='Preview')
    s.text(16, top + 76, 'PASTE MARKDOWN', 12, bold=True, fill='#666')
    s.rect(16, top + 92, 343, 280, 8)
    for i, line in enumerate(['# Spaghetti carbonara', 'servings: 4', '', '## Ingredients', '- 400 g spaghetti', '- 200 g guanciale',
                              '- 4 eggs', '- 1 tsp salt']):
        s.text(28, top + 120 + i * 24, line, 12, fill='#000' if line else '#666')
    s.text(16, top + 404, 'One note can hold several recipes: each', 12, fill='#666')
    s.text(16, top + 422, 'starts at a # heading. Nothing is saved yet.', 12, fill='#666')
    s.callout(343, top + 224)
    s.callout(343, top + 414)
    s.finish('10-import-entry.svg')


def s11():
    s = Svg('11 Import recipes from markdown: review (PR E)')
    ghost(s, recipes_screen)
    top = 96
    sheet(s, top, 'Import recipes', back='Edit text', footer='Import 2 recipes')
    s.text(16, top + 120, '2 recipes found', 20, bold=True)
    card(s, 16, top + 144, 343, 240)
    s.rect(30, top + 160, 20, 20, 4)
    s.text(60, top + 172, 'Spaghetti carbonara', 14, bold=True)
    s.text(343, top + 172, '4 servings', 12, 'end', '#666')
    rows = [('400 g', 'Spaghetti', False), ('454 g', 'Guanciale  (from 1 lb)', False), ('4', 'Eggs', False),
            ('1 tsp', 'Salt  · pantry', False), ('?', '1 knob butter', True)]
    for i, (q, n, flag) in enumerate(rows):
        y = top + 192 + i * 36
        if flag:
            s.rect(24, y - 4, 327, 32, 6, '#fff', dash=True)
        s.text(40, y + 17, q, 14, fill='#666')
        s.text(104, y + 17, n, 14)
        if flag:
            s.text(335, y + 17, 'Fix', 12, 'end', bold=True)
    card(s, 16, top + 400, 343, 64)
    s.rect(30, top + 418, 20, 20, 4)
    s.text(60, top + 430, 'Chicken curry', 14, bold=True)
    s.text(60, top + 450, '9 ingredients · all read', 12, fill='#666')
    s.text(335, top + 440, '⌄', 14, 'end')
    s.callout(343, top + 120)
    s.callout(343, top + 340)
    s.callout(343, top + 432)
    s.finish('11-import-review.svg')


def s14():
    s = Svg('14 Recipe detail with sections')
    status_bar(s)
    header(s, 'Spaghetti carbonara', plus=False, back='Recipes')
    s.text(335, 72, 'Edit', 14, 'end', bold=True)
    s.text(16, 120, '4 servings', 12, fill='#666')
    card(s, 16, 136, 343, 136)
    s.text(32, 162, 'INGREDIENTS', 12, fill='#666')
    for i, (n, q) in enumerate([('Spaghetti', '400 g'), ('Guanciale', '200 g'), ('Eggs', '4')]):
        y = 176 + i * 32
        s.text(32, y + 14, n, 14, bold=True)
        s.text(343, y + 14, q, 14, 'end', '#666')
    card(s, 16, 284, 343, 128)
    s.text(32, 310, 'STEPS', 12, fill='#666')
    for i, step in enumerate(['Boil the pasta.', 'Fry the guanciale.', 'Toss with the egg and cheese.']):
        y = 324 + i * 28
        s.text(32, y + 14, f'{i + 1}.', 14, bold=True, fill='#666')
        s.text(60, y + 14, step, 14)
    card(s, 16, 424, 343, 72)
    s.text(32, 450, 'NOTES', 12, fill='#666')
    s.text(32, 474, 'Never add cream.', 14)
    card(s, 16, 508, 343, 72)
    s.text(32, 534, 'SOURCE', 12, fill='#666')
    s.text(32, 558, 'https://example.test/carbonara', 14)
    s.line(32, 562, 262, 562)
    button(s, 16, 600, 343, 'Share', False, 48)
    button(s, 16, 656, 343, 'Delete recipe', False, 48)
    tab_bar(s, 2)
    s.callout(343, 180)
    s.callout(343, 340)
    s.callout(343, 474)
    s.callout(343, 558)
    s.finish('14-recipe-detail.svg')


def cooking_frame(s, active):
    """The cooking view: full screen, no tab bar. Close, the recipe name, and the two tabs."""
    status_bar(s)
    s.circle(40, 76, 22, '#e6e6e6')
    s.text(40, 82, '\u00d7', 22, 'middle')
    s.text(80, 82, 'Spaghetti carbonara', 16, bold=True)
    segmented(s, 112, ['Steps', 'Ingredients'], active)


def s15():
    s = Svg('15 Cooking view: steps')
    cooking_frame(s, 0)
    s.text(16, 196, 'Step 2 of 4', 12, fill='#666')
    s.rect(16, 206, 343, 4, 2, '#e6e6e6')
    s.rect(16, 206, 171, 4, 2, '#000')
    for j, line in enumerate(['Fry the guanciale in its own', 'fat until the edges turn', 'golden and crisp.']):
        s.text(16, 276 + j * 38, line, 26, bold=False)
    button(s, 16, 724, 163, 'Back', False, 56)
    button(s, 196, 724, 163, 'Next step', True, 56)
    s.callout(343, 120)
    s.callout(343, 206)
    s.callout(343, 300)
    s.callout(343, 752)
    s.finish('15-cooking-steps.svg')


def s16():
    s = Svg('16 Cooking view: ingredients')
    cooking_frame(s, 1)
    s.text(16, 196, '2 of 4 ready', 12, fill='#666')
    for i, (n, q, on) in enumerate([('Spaghetti', '400 g', True), ('Guanciale', '200 g', True), ('Eggs', '4', False), ('Pecorino', '50 g', False)]):
        y = 212 + i * 64
        if i:
            s.line(16, y, 359, y)
        checkbox(s, 16, y + 20, on)
        s.text(56, y + 38, n, 16, fill='#666' if on else '#000')
        if on:
            s.line(56, y + 33, 56 + len(n) * 9, y + 33, '#666', 1.5)
        s.text(359, y + 38, q, 16, 'end', '#666')
    s.callout(343, 196)
    s.callout(343, 262)
    s.finish('16-cooking-ingredients.svg')


def s12():
    s = Svg('12 New recipe: write or import')
    ghost(s, recipes_screen)
    top = 456
    sheet(s, top, 'Add a recipe')
    choice_tile(s, top + 72, 'Write a recipe', 'Type the ingredients and the steps.', False, 88)
    choice_tile(s, top + 176, 'Import', 'Paste a recipe from your notes, a chat or a website.', False, 88)
    s.callout(343, top + 116)
    s.callout(343, top + 220)
    s.finish('12-add-recipe.svg')


def flow():
    s = Svg('Flow: five PRs, left to right')
    s.add('<rect x="0" y="0" width="375" height="812" fill="#fff" stroke="none"/>')
    s.parts[2] = ''  # overwritten below by a wide canvas
    s.parts[0] = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1464" height="520" viewBox="0 0 1464 520" '
        f'font-family="{FONT}" fill="#fff" stroke="#000" stroke-width="1.5">'
    )
    s.parts[3] = '<rect x="0" y="0" width="1464" height="520" fill="#fff"/>'
    cols = [
        ('PR A · done', 'Wizard motion', ['StepPager on the UI thread', 'Folding footer', 'Progress bar']),
        ('PR B · this PR', 'Recipes', ['01 Library', '02 Recipe sheet', 'Metric parser', 'Pantry flag']),
        ('PR C', 'Plan + groceries', ['03 Plan', '04 Pick recipes', '05 Generated list', 'Merge + staples']),
        ('PR D', 'New list wizard', ['06 Type', '07 Name + start', '08 Recipes', '09 Review']),
        ('PR E', 'Markdown import', ['10 Entry', '11 Review', 'Export .md']),
    ]
    for i, (tag, title, items) in enumerate(cols):
        x = 24 + i * 288
        s.rect(x, 48, 264, 392, 8, '#e6e6e6' if i < 2 else '#fff')
        s.text(x + 16, 80, tag, 12, fill='#666')
        s.text(x + 16, 112, title, 20, bold=True)
        for j, it in enumerate(items):
            s.rect(x + 16, 136 + j * 56, 232, 40, 6)
            s.text(x + 32, 161 + j * 56, it, 14)
        if i < 4:
            s.line(x + 264, 244, x + 288, 244)
            s.text(x + 280, 240, '›', 14, 'middle')
    s.text(24, 480, 'Each PR ships on its own and leaves the app working. C needs B; D needs B and C; E needs B.', 12, fill='#666')
    s.finish('flow.svg')


if __name__ == '__main__':
    for fn in (s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16, flow):
        fn()
    print('wrote', len(os.listdir(OUT)), 'files to', OUT)
