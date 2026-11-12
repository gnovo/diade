#!/usr/bin/env python3
"""
Generates the health wireframes (mobile 375x812, monochrome, 8px grid) into ./wireframes.

    python3 design/health/build_wireframes.py

Reuses the primitives of design/meal-prep/build_wireframes.py so both sets look the same. The SVGs are
generated output, committed so the viewer (index.html) works without running anything.
"""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    'meal_prep_wireframes', os.path.join(HERE, '..', 'meal-prep', 'build_wireframes.py')
)
mp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mp)
mp.OUT = os.path.join(HERE, 'wireframes')

Svg, W, H, FONT = mp.Svg, mp.W, mp.H, mp.FONT
status_bar, header, segmented, tab_bar = mp.status_bar, mp.header, mp.segmented, mp.tab_bar
input_box, button, chip, card, stepper = mp.input_box, mp.button, mp.chip, mp.card, mp.stepper
pill, recipe_card, ghost, sheet, week_header = mp.pill, mp.recipe_card, mp.ghost, mp.sheet, mp.week_header


# --- primitives of this set -------------------------------------------------------------------


def bar(s, x, y, w, share, h=8):
    """A progress bar: filled share of the track, clipped at 100 %."""
    s.rect(x, y, w, h, h / 2, '#e6e6e6', sw=0)
    s.rect(x, y, max(h, round(w * min(share, 1))), h, h / 2, '#000', sw=0)


def metric_row(s, y, label, value, target, share):
    s.text(32, y, label, 14, bold=True)
    s.text(343, y, f'{value} / {target}', 14, 'end', '#666')
    bar(s, 32, y + 12, 311, share)


def toggle(s, x, y, on):
    s.rect(x, y, 48, 28, 14, '#000' if on else '#e6e6e6')
    s.circle(x + (34 if on else 14), y + 14, 10, '#fff')


def setting_row(s, y, label, value=None, last=False):
    s.text(32, y + 30, label, 14)
    if value:
        s.text(335, y + 30, value, 14, 'end', '#666')
    if not last:
        s.line(32, y + 48, 343, y + 48, '#e6e6e6')


def block(s, x, y, w, h, title, sub, kind='block'):
    """Calendar entries: a reserved household block is solid grey, a training block is dashed (optional)."""
    if kind == 'reserved':
        s.rect(x, y, w, h, 6, '#e6e6e6', sw=0)
    else:
        s.rect(x, y, w, h, 6, '#fff', dash=True)
    s.text(x + 8, y + 18, title, 12, bold=True)
    if sub and h >= 36:
        s.text(x + 8, y + 32, sub, 12, fill='#666')


def nutrition_line(s, x, y, kcal, protein):
    s.text(x, y, f'{kcal} kcal · {protein} g protein', 12, fill='#666')


# --- screens ----------------------------------------------------------------------------------


def recipe_detail_nutrition(s):
    status_bar(s)
    s.text(16, 72, '‹ Recipes', 14)
    s.text(16, 96, 'Bowl de frango e grão', 28, bold=True)
    for dy in (-8, 0, 8):
        s.circle(343, 80 + dy, 2, '#000')
    card(s, 16, 120, 343, 128)
    s.text(32, 146, 'PER SERVING', 12, fill='#666')
    s.text(343, 146, 'Edit', 12, 'end', bold=True)
    s.text(32, 192, '512', 28, bold=True)
    s.text(96, 192, 'kcal', 14, fill='#666')
    s.text(184, 192, '41 g', 28, bold=True)
    s.text(248, 192, 'protein', 14, fill='#666')
    pill(s, 32, 208, 'High protein', True)
    s.text(343, 224, '100 % of ingredients known', 12, 'end', '#666')
    card(s, 16, 264, 343, 208)
    s.text(32, 290, 'INGREDIENTS', 12, fill='#666')
    s.text(343, 290, '1 serving', 12, 'end', '#666')
    rows = [('Frango cozido desfiado', '130 g', '215'), ('Grão-de-bico cozido', '100 g', '139'),
            ('Arroz', '40 g', '144'), ('Pimentos congelados', '100 g', '24'), ('Paprika, alho, limão', 'q.b.', '')]
    for i, (n, q, k) in enumerate(rows):
        y = 312 + i * 32
        s.text(32, y + 14, n, 14, bold=True)
        s.text(255, y + 14, q, 14, 'end', '#666')
        s.text(343, y + 14, f'{k} kcal' if k else '—', 12, 'end', '#666')
    card(s, 16, 488, 343, 72)
    s.text(32, 514, 'STEPS', 12, fill='#666')
    s.text(32, 538, '1. Aquecer o frango e o grão.', 14)
    button(s, 16, 576, 343, 'Start cooking', True, 48)
    tab_bar(s, 2)


def s01():
    s = Svg('01 Recipe detail: per-serving nutrition')
    recipe_detail_nutrition(s)
    s.callout(0, 146)
    s.callout(0, 192)
    s.callout(0, 220)
    s.callout(0, 326)
    s.finish('01-recipe-nutrition.svg')


def s02():
    s = Svg('02 Recipes library: kcal and protein on every card, High protein filter')
    status_bar(s)
    header(s, 'Recipes')
    segmented(s, 128, ['Lists', 'Recipes', 'Plan'], 1)
    input_box(s, 16, 192, 343, 'Search recipes')
    x = 16
    for label, on in [('All', False), ('High protein', True), ('Meal', False), ('Prep', False)]:
        x += chip(s, x, 256, label, on) + 8
    recipe_card(s, 312, 'Bowl de frango e grão', 'Meal · 512 kcal · 41 g protein', icon='utensils')
    recipe_card(s, 408, 'Peito de frango a vapor', 'Prep · 165 kcal · 31 g protein', icon='pot')
    recipe_card(s, 504, 'Skyr com frutos vermelhos', 'Snack · 180 kcal · 20 g protein', icon='apple')
    recipe_card(s, 600, 'Hambúrguer caseiro', 'Meal · Flexible · 790 kcal · 46 g', icon='utensils')
    tab_bar(s, 2)
    s.callout(0, 276)
    s.callout(0, 372)
    s.callout(0, 660)
    s.finish('02-recipes-library.svg')


def s03():
    s = Svg('03 Edit nutrition: computed values and a per-serving override')
    ghost(s, recipe_detail_nutrition)
    sheet(s, 352, 'Nutrition per serving', footer='Save')
    card(s, 16, 416, 343, 72)
    s.text(32, 442, 'COMPUTED FROM THE INGREDIENTS', 12, fill='#666')
    s.text(32, 468, '512 kcal · 41 g protein · 100 % known', 14)
    s.text(16, 520, 'Calories (kcal)', 12, fill='#666')
    input_box(s, 16, 528, 343, '512', value=True)
    s.text(16, 600, 'Protein (g)', 12, fill='#666')
    input_box(s, 16, 608, 343, '41', value=True)
    s.text(W / 2, 696, 'Use the computed values', 14, 'middle', bold=True)
    s.line(112, 700, 263, 700)
    s.callout(0, 456)
    s.callout(0, 552)
    s.callout(0, 696)
    s.finish('03-nutrition-override.svg')


def s04():
    s = Svg('04 Ingredient values on the catalog')
    status_bar(s)
    s.text(16, 72, '‹ Ingredients', 14)
    s.text(16, 96, 'Ovo', 28, bold=True)
    card(s, 16, 120, 343, 72)
    s.text(32, 146, 'SOURCE', 12, fill='#666')
    s.text(32, 170, 'Built-in (INSA) · used in 4 recipes', 14)
    s.text(16, 224, 'Calories per 100 g', 12, fill='#666')
    input_box(s, 16, 232, 343, '143', value=True)
    s.text(16, 304, 'Protein per 100 g', 12, fill='#666')
    input_box(s, 16, 312, 343, '12.6', value=True)
    s.text(16, 384, 'Grams per unit (for "2 ovos")', 12, fill='#666')
    input_box(s, 16, 392, 343, '55', value=True)
    s.text(16, 472, 'Changing a value saves it for the household and', 12, fill='#666')
    s.text(16, 488, 'updates every recipe that uses this ingredient.', 12, fill='#666')
    button(s, 16, 512, 343, 'Save', True)
    s.text(W / 2, 600, 'Reset to built-in', 14, 'middle', bold=True)
    tab_bar(s, 2)
    s.callout(0, 170)
    s.callout(0, 256)
    s.callout(0, 416)
    s.callout(0, 600)
    s.finish('04-ingredient-values.svg')


def s05():
    s = Svg('05 Plan: the week against the targets')
    status_bar(s)
    header(s, 'Plan', plus=False)
    segmented(s, 128, ['Lists', 'Recipes', 'Plan'], 2)
    week_header(s, 188, 'Mon 16 – Sun 22 Nov', 'Next week')
    card(s, 16, 252, 343, 168)
    s.text(32, 278, 'PER PERSON, PER DAY', 12, fill='#666')
    s.text(343, 278, 'Targets', 12, 'end', bold=True)
    metric_row(s, 308, 'Calories', '1,690', '1,750 kcal', 1690 / 1750)
    metric_row(s, 348, 'Protein', '132', '140 g', 132 / 140)
    s.text(32, 400, 'Flexible meals', 14, bold=True)
    s.text(343, 400, '640 of 1,000 kcal', 14, 'end', '#666')
    for i, (n, meta, k) in enumerate([('Peito de frango a vapor', 'Prep · 165 kcal · 31 g', 6),
                                     ('Bowl de frango e grão', 'Meal · 512 kcal · 41 g', 4),
                                     ('Hambúrguer caseiro', 'Flexible · 790 kcal · 46 g', 2)]):
        y = 436 + i * 80
        card(s, 16, y, 343, 72)
        s.text(32, y + 30, n, 14, bold=True)
        s.text(32, y + 52, meta, 12, fill='#666')
        stepper(s, 239, y + 20, k)
    button(s, 16, 684, 343, '+ Add recipes', False, 48, True)
    tab_bar(s, 2)
    s.callout(0, 278)
    s.callout(0, 320)
    s.callout(0, 400)
    s.callout(0, 548)
    s.finish('05-plan-summary.svg')


def s06():
    s = Svg('06 Profile: nutrition, per member, off by default')
    status_bar(s)
    s.text(16, 72, '‹ Profile', 14)
    s.text(16, 96, 'Nutrition', 28, bold=True)
    card(s, 16, 120, 343, 80)
    s.text(32, 152, 'Show my targets', 14, bold=True)
    s.text(32, 176, 'Only you see them. Off: the app looks as before.', 12, fill='#666')
    toggle(s, 295, 136, True)
    s.text(16, 232, 'DAILY TARGETS', 12, fill='#666')
    card(s, 16, 240, 343, 192)
    setting_row(s, 240, 'Calories', '1,750 kcal')
    setting_row(s, 288, 'Protein', '140 g')
    setting_row(s, 336, 'Water', '2.5 L')
    setting_row(s, 384, 'Coffee', 'up to 4, before 15:00', last=True)
    s.text(16, 464, 'EACH WEEK', 12, fill='#666')
    card(s, 16, 472, 343, 48)
    setting_row(s, 472, 'Flexible meals budget', '1,000 kcal', last=True)
    button(s, 16, 544, 343, 'Work out my targets', False)
    s.text(16, 616, 'Asks age, height, weight, sex and activity once.', 12, fill='#666')
    s.text(16, 632, 'Only the targets are kept. Estimates, not medical advice.', 12, fill='#666')
    tab_bar(s, 0)
    s.callout(0, 160)
    s.callout(0, 336)
    s.callout(0, 496)
    s.callout(0, 568)
    s.finish('06-profile-nutrition.svg')


def s07():
    s = Svg('07 Today: one card for the day, only with nutrition on')
    status_bar(s)
    header(s, 'Today')
    card(s, 16, 128, 343, 56)
    s.text(32, 162, 'Capture something…', 14, fill='#666')
    card(s, 16, 200, 343, 360)
    s.text(32, 226, 'YOUR DAY', 12, fill='#666')
    s.text(343, 226, 'Week 1 of the cycle', 12, 'end', '#666')
    metric_row(s, 256, 'Planned', '1,640', '1,750 kcal', 1640 / 1750)
    metric_row(s, 296, 'Protein', '138', '140 g', 138 / 140)
    s.line(32, 328, 343, 328, '#e6e6e6')
    s.text(32, 352, 'Water 2.5 L · coffee up to 4, the last by 15:00', 12, fill='#666')
    s.line(32, 368, 343, 368, '#e6e6e6')
    s.text(32, 392, 'THIS WEEK', 12, fill='#666')
    for i, (label, done, goal) in enumerate([('Strength', 1, 3), ('Bodyweight', 1, 2)]):
        y = 408 + i * 32
        s.text(32, y + 16, label, 14, bold=True)
        for j in range(goal):
            s.circle(152 + j * 24, y + 11, 8, '#000' if j < done else '#fff')
        s.text(343, y + 16, f'{done} of {goal}', 14, 'end', '#666')
    s.rect(32, 480, 311, 40, 6, '#fff', dash=True)
    s.text(44, 505, 'Next: Strength · 17:30 to 19:00 · 40 min', 12, bold=True)
    s.text(32, 544, '6,240 steps today', 12, fill='#666')
    card(s, 16, 576, 343, 112)
    s.text(32, 602, 'COMING UP', 12, fill='#666')
    s.text(32, 634, '13:00  Dog walk', 14)
    s.text(32, 666, '17:00  Dog walk', 14)
    tab_bar(s, 0)
    s.callout(0, 268)
    s.callout(0, 352)
    s.callout(0, 424)
    s.callout(0, 500)
    s.callout(0, 540)
    s.finish('07-today-card.svg')


def day_timeline(s, top=200):
    hours = list(range(7, 23))
    step = 32
    for i, h in enumerate(hours):
        y = top + i * step
        s.text(16, y + 4, f'{h:02d}', 12, fill='#666')
        s.line(48, y, 359, y, '#e6e6e6')

    def y_at(hh, mm=0):
        return top + (hh - 7) * step + mm * step / 60

    x, w = 56, 303
    walk = 'Dog walk \u00b7 either of us'
    block(s, x, y_at(7) + 2, w, 28, walk, None, 'reserved')
    block(s, x, y_at(9, 30), w, y_at(11, 30) - y_at(9, 30), 'Walking pad', '30 to 60 min, during calls')
    block(s, x, y_at(12) + 2, 148, 28, 'Bodyweight · 20 min', None)
    block(s, x + 156, y_at(12) + 2, w - 156, 28, 'Lunch · or 13:30', None, 'reserved')
    block(s, x, y_at(13) + 2, w, 28, walk, None, 'reserved')
    block(s, x, y_at(17) + 2, w, 28, walk, None, 'reserved')
    block(s, x, y_at(14, 30), w, y_at(16, 30) - y_at(14, 30), 'Walking pad', 'week 2: QA and waiting')
    s.text(x, y_at(20), 'Nothing planned after 19:00', 12, fill='#666')
    block(s, x, y_at(21) + 2, w, 28, walk, None, 'reserved')
    return y_at


def calendar_day(s):
    status_bar(s)
    header(s, 'Calendar')
    s.text(16, 136, 'Wed 18 Nov · week 2 of the cycle', 14, bold=True)
    s.text(16, 160, 'Strength 1 of 2 · Bodyweight 1 of 3', 12, fill='#666')
    day_timeline(s, 192)
    tab_bar(s, 1)


def s08():
    s = Svg('08 Calendar day: reserved walks, training blocks as dashed windows')
    calendar_day(s)
    s.callout(0, 154)
    s.callout(0, 196)
    s.callout(0, 270)
    s.callout(0, 352)
    s.callout(0, 448)
    s.callout(0, 608)
    s.finish('08-calendar-blocks.svg')


def s09():
    s = Svg('09 Set up my training week: cycle anchor and weekly goals')
    ghost(s, calendar_day)
    sheet(s, 160, 'My training week', footer='Create blocks')
    card(s, 16, 216, 343, 72)
    s.text(32, 242, 'WORK CYCLE', 12, fill='#666')
    s.text(32, 268, 'Week 1 starts Mon 9 Nov, every 2 weeks', 14)
    segmented(s, 304, ['Week 1', 'Week 2'], 0)
    for i, (label, goal, blocks) in enumerate([('Strength', 3, 'Mon, Wed 17:30 · Fri 15:00 · Sat 10:00'),
                                              ('Bodyweight + stretch', 2, 'Tue, Thu 12:00 · Sun 17:30'),
                                              ('Walking pad', 5, 'Weekdays 09:30 to 11:30')]):
        y = 368 + i * 104
        card(s, 16, y, 343, 96)
        s.text(32, y + 30, label, 14, bold=True)
        s.text(32, y + 52, 'goal per week', 12, fill='#666')
        stepper(s, 247, y + 14, goal)
        s.text(32, y + 80, blocks, 12, fill='#666')
    s.text(16, 704, 'Blocks are free time in Google. Edit them like any event.', 12, fill='#666')
    s.callout(0, 256)
    s.callout(0, 328)
    s.callout(0, 398)
    s.callout(0, 448)
    s.finish('09-training-setup.svg')


def s10():
    s = Svg('10 A training block: done, or let it go')
    ghost(s, calendar_day)
    sheet(s, 448, 'Bodyweight and stretching')
    s.text(16, 520, 'Today · 12:00 to 12:30 · 20 min', 14)
    s.text(16, 544, '10 min bodyweight, 10 min stretching. Counts towards 3.', 12, fill='#666')
    button(s, 16, 568, 343, 'Mark done', True)
    button(s, 16, 632, 343, 'Not today', False)
    s.text(16, 712, 'Not today changes nothing: the goal stays, other', 12, fill='#666')
    s.text(16, 728, 'blocks this week can still meet it.', 12, fill='#666')
    s.callout(0, 532)
    s.callout(0, 592)
    s.callout(0, 656)
    s.finish('10-block-detail.svg')


def s11():
    s = Svg('11 Profile → Watch and scale: Health Connect, steps, weight trend')
    status_bar(s)
    s.circle(40, 80, 20, '#e6e6e6')
    s.text(40, 85, '×', 14, 'middle')
    s.text(72, 88, 'Watch and scale', 20, bold=True)
    card(s, 16, 120, 343, 152)
    s.text(32, 148, 'Read from Health Connect', 14, bold=True)
    s.text(32, 172, 'A session inside a block marks it done.', 12, fill='#666')
    s.text(32, 188, 'Read each time you open Díade.', 12, fill='#666')
    toggle(s, 295, 134, True)
    button(s, 32, 208, 311, 'Open Health Connect', False)
    s.text(16, 304, 'TODAY', 12, fill='#666')
    card(s, 16, 320, 343, 56)
    s.text(32, 354, 'Steps', 14)
    s.text(343, 354, '6,240', 20, 'end', bold=True)
    s.text(16, 408, 'WEIGHT', 12, fill='#666')
    card(s, 16, 424, 343, 304)
    s.text(32, 456, 'Last 7 days, on average', 12, fill='#666')
    s.text(343, 456, '86.5 kg', 20, 'end', bold=True)
    s.text(343, 480, '−0.7 kg on the week before', 12, 'end', '#666')
    s.line(32, 552, 343, 552, '#e6e6e6')
    pts = [(40, 512), (88, 520), (136, 536), (184, 544), (232, 552), (280, 568), (328, 576)]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        s.line(x1, y1, x2, y2, '#000', 2)
    s.circle(328, 576, 4, '#000')
    input_box(s, 32, 608, 199, 'Weight in kg, like 86.4')
    button(s, 247, 608, 96, 'Add', True)
    s.text(32, 688, 'The trend is the average of the last 7 days,', 12, fill='#666')
    s.text(32, 704, 'so one heavy morning barely moves it.', 12, fill='#666')
    s.text(16, 760, 'Everything is read on this phone. Only the blocks a', 12, fill='#666')
    s.text(16, 776, 'session marks done reach the server.', 12, fill='#666')
    s.callout(0, 148)
    s.callout(0, 224)
    s.callout(0, 354)
    s.callout(0, 456)
    s.callout(0, 552)
    s.callout(0, 632)
    s.finish('11-watch-and-scale.svg')


def flow():
    s = Svg('Flow: six PRs, left to right')
    s.parts[0] = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1464" height="480" viewBox="0 0 1464 480" '
        f'font-family="{FONT}" fill="#fff" stroke="#000" stroke-width="1.5">'
    )
    s.parts[2] = '<rect x="0" y="0" width="1464" height="480" fill="#fff"/>'
    cols = [
        ('H1', 'Recipe nutrition', ['01 Per serving', '02 Library + filter', '03 Override', '04 Ingredient values']),
        ('H2', 'Prod content', ['64 ingredients', '15 new recipes', 'Vault recipes, lighter']),
        ('H3', 'Targets', ['06 Profile', '05 Plan summary', '07 Today card']),
        ('H4', 'Training blocks', ['08 Calendar day', '09 Set up week', '10 Block']),
        ('H5', 'Google Calendar', ['Write scope', '"Díade · Treino"', 'Free, not busy']),
        ('H6', 'Health Connect', ['11 Watch and scale', '07 Steps on Today', '10 Ticked by watch', 'APK release']),
    ]
    for i, (tag, title, items) in enumerate(cols):
        x = 24 + i * 240
        s.rect(x, 48, 216, 360, 8, '#e6e6e6' if i < 2 else '#fff')
        s.text(x + 16, 80, tag, 12, fill='#666')
        s.text(x + 16, 112, title, 20, bold=True)
        for j, it in enumerate(items):
            s.rect(x + 16, 136 + j * 56, 184, 40, 6)
            s.text(x + 32, 161 + j * 56, it, 14)
        if i < 5:
            s.line(x + 216, 228, x + 240, 228)
    s.text(24, 448, 'Grey: helps this week. H2 needs H1; H5 needs H4; H6 needs H4 and an APK release.', 12, fill='#666')
    s.finish('flow.svg')


if __name__ == '__main__':
    for fn in (s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, flow):
        fn()
    print('wrote', len(os.listdir(mp.OUT)), 'files to', mp.OUT)
