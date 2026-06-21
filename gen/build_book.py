# -*- coding: utf-8 -*-
"""
THE GUARDIAN COMPENDIUM OF AUREL
A complete, illustrated bestiary generated from the live game data
(gen/guardians.json). Dark, atmospheric vector artbook built with reportlab.
"""
import json, os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    Table, TableStyle, PageBreak, KeepTogether, CondPageBreak, Flowable, NextPageTemplate)
from reportlab.graphics.shapes import Drawing, Group, Rect, String, Line, Circle, Polygon, PolyLine

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, 'guardians.json'), encoding='utf-8'))
OUT  = os.path.join(os.path.dirname(HERE), 'Guardian-Compendium-of-Aurel.pdf')

# ----------------------------------------------------------------------------- fonts
FD = r'C:\Windows\Fonts'
def reg(name, fn):
    try: pdfmetrics.registerFont(TTFont(name, os.path.join(FD, fn))); return True
    except Exception as e: print('font miss', fn, e); return False
SERIF, SERIF_B, SERIF_I = 'Const', 'Const-B', 'Const-I'
reg(SERIF,'constan.ttf'); reg(SERIF_B,'constanb.ttf')
if not reg(SERIF_I,'constani.ttf'): SERIF_I = SERIF_I if reg(SERIF_I,'georgiai.ttf') else SERIF
SANS, SANS_B = 'Sans', 'Sans-B'
reg(SANS,'calibri.ttf'); reg(SANS_B,'calibrib.ttf')
MONO, MONO_B = 'Mono', 'Mono-B'
reg(MONO,'consola.ttf'); reg(MONO_B,'consolab.ttf')
DISP = 'Disp'
if not reg(DISP,'BOOKOSB.ttf'): DISP = SERIF_B
for fam, n, b, i in [('Const','Const','Const-B','Const-I'), ('Sans','Sans','Sans-B','Sans-B')]:
    try: pdfmetrics.registerFontFamily(fam, normal=n, bold=b, italic=i, boldItalic=b)
    except Exception: pass

# ----------------------------------------------------------------------------- theme
INK   = HexColor('#e9edfb'); DIM = HexColor('#9aa4c8'); FAINT = HexColor('#5b638c')
GOLD  = HexColor('#f2c44e'); GOLDD = HexColor('#caa23e')
BG_TOP= HexColor('#06080f'); BG_BOT= HexColor('#0c1228')
PANEL = HexColor('#141a30'); PANEL2= HexColor('#1b2342'); EDGE = HexColor('#2c3560')
RED   = HexColor('#e8546e'); BLUE = HexColor('#5f86e0')
PAGEW, PAGEH = A4
MARGIN = 1.5*cm
USABLE = PAGEW - 2*MARGIN
TYPE_ELEMENT = {'Blaze':'Fire','Tide':'Water','Verdant':'Nature','Volt':'Electric','Gale':'Space','Umbra':'Dark'}
TYPE_MOTTO = {
 'Blaze':'Burn brighter than your doubt.','Tide':'Still water carves the canyon.',
 'Verdant':'Roots first, then branches.','Volt':'Strike once, strike true.',
 'Gale':'Ride the high silence.','Umbra':'See what the light hides.'}
M = DATA['meta']; SPECIES = DATA['species']; LORE = DATA['lore']
SP = {s['id']: s for s in SPECIES}
ECSS = M['elementCss']; TCSS = M['typeCss']; EICON = M['elementIcons']; ECHART = M['elementChart']
ELEMENTS = M['elements']; STAGES = M['stages']; STAGE_KIND = M['stageKindLabel']; STAGE_RANK = M['stageRank']
BIG3 = set(M['big3'])
def tcol(t): return HexColor(TCSS.get(t, '#888888'))
def ecol(e): return HexColor(ECSS.get(e, '#888888'))
def thex(t): return TCSS.get(t, '#888888')
def ehex(e): return ECSS.get(e, '#888888')
GOLDX = '#f2c44e'

def hexlerp(a, b, t):
    a = a.lstrip('#'); b = b.lstrip('#')
    ar,ag,ab = int(a[0:2],16),int(a[2:4],16),int(a[4:6],16)
    br,bg,bb = int(b[0:2],16),int(b[2:4],16),int(b[4:6],16)
    return Color(((ar+(br-ar)*t)/255.0), ((ag+(bg-ag)*t)/255.0), ((ab+(bb-ab)*t)/255.0))

def esc(s):
    return (s or '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

ITEMNAME = {'terra_catalyst':'Terra Catalyst','transcend_sigil':'Transcendence Sigil','aether_shard':'Aether Shard'}
FLAGNAME = {'terra_visited':'reach Terra City'}

# ----------------------------------------------------------------------------- styles
def ps(name, **kw):
    base = dict(fontName=SERIF, fontSize=9.4, leading=12.8, textColor=INK)
    base.update(kw); return ParagraphStyle(name, **base)
S = {
 'chapter': ps('chapter', fontName=DISP, fontSize=27, leading=30, textColor=GOLD, spaceAfter=2, alignment=TA_LEFT),
 'chapsub': ps('chapsub', fontName=SERIF_I, fontSize=11, leading=15, textColor=DIM, spaceAfter=10),
 'h2':   ps('h2', fontName=SERIF_B, fontSize=15.5, leading=19, textColor=INK, spaceBefore=10, spaceAfter=4),
 'h3':   ps('h3', fontName=SANS_B, fontSize=10.5, leading=13, textColor=GOLD, spaceBefore=6, spaceAfter=3),
 'body': ps('body', alignment=TA_JUSTIFY, spaceAfter=6),
 'lore': ps('lore', fontName=SERIF_I, textColor=HexColor('#c7cef0'), alignment=TA_JUSTIFY),
 'small':ps('small', fontName=SANS, fontSize=7.6, leading=10, textColor=DIM),
 'tiny': ps('tiny', fontName=SANS, fontSize=6.8, leading=8.6, textColor=FAINT),
 'cardname': ps('cardname', fontName=SERIF_B, fontSize=13.5, leading=15, textColor=INK, spaceAfter=0),
 'meta': ps('meta', fontName=SANS, fontSize=7.8, leading=10, textColor=DIM, spaceAfter=2),
 'chips':ps('chips', fontName=SANS, fontSize=8.4, leading=11, textColor=INK, spaceAfter=2),
 'kv':   ps('kv', fontName=SANS, fontSize=8.0, leading=10.6, textColor=INK, spaceAfter=1),
 'cap':  ps('cap', fontName=SANS, fontSize=7.6, leading=10, textColor=DIM),
 'erafrom':ps('erafrom', fontName=MONO, fontSize=8, leading=10, textColor=GOLD),
}

# stat normalisation (global maxima → bar length conveys raw power)
STAT_KEYS = ['hp','sp','atk','def','spd','wis']
STAT_MAX = {k: max(1, max(s['base'][k] for s in SPECIES)) for k in STAT_KEYS}

# reverse evolution map ("evolves from")
EVO_FROM = {}
for s in SPECIES:
    for fld in ('evolvesTo','extraEvolvesTo','ascendsTo'):
        e = s.get(fld)
        if e: EVO_FROM.setdefault(e['species'], []).append((s['id'], fld, e))

EXCLUDED = set(BIG3) | {g['speciesId'] for g in LORE['corruptedLegion']} | {'ironhusk','gravemaw','voltigarch'}
TARGETS = set()
for s in SPECIES:
    for fld in ('evolvesTo','extraEvolvesTo','ascendsTo'):
        if s.get(fld): TARGETS.add(s[fld]['species'])

def children(sid):
    s = SP[sid]; out=[]
    if s.get('evolvesTo'): out.append((s['evolvesTo']['species'],'evolve',s['evolvesTo']))
    if s.get('ascendsTo'): out.append((s['ascendsTo']['species'],'ascend',s['ascendsTo']))
    if s.get('extraEvolvesTo'): out.append((s['extraEvolvesTo']['species'],'split',s['extraEvolvesTo']))
    return out

def dfs_line(root):
    """Return ordered list of (id, depth, parent_id, kind, edge)."""
    out=[]; seen=set()
    def go(sid, depth, parent, kind, edge):
        if sid in seen or sid not in SP: return
        seen.add(sid); out.append((sid, depth, parent, kind, edge))
        for cid, k, e in children(sid):
            go(cid, depth+1, sid, k, e)
    go(root, 0, None, None, None)
    return out

def edge_label(kind, edge):
    if kind=='evolve': return 'Lv %d' % edge['level']
    if kind=='split':  return 'SPLIT · Lv %d' % edge['level']
    if kind=='ascend':
        k = edge.get('kind','').upper(); bits=[k]
        if edge.get('level'): bits.append('Lv%d'%edge['level'])
        return '» ' + ' '.join(bits)
    return ''

# ----------------------------------------------------------------------------- crest
def crest(sp, w=112, h=92):
    d = Drawing(w, h)
    prim = HexColor(sp['palette']['primary']); sec = HexColor(sp['palette']['secondary'])
    acc  = HexColor(sp['palette']['accent']);  tc = tcol(sp['type'])
    cx, cy = w/2.0, h/2.0+4
    # hexagon gem (outer = type ring, mid = primary, inner = secondary)
    def hexpts(r, sq=0.86):
        import math
        return sum([[cx+r*math.cos(math.radians(60*i-90)), cy+r*sq*math.sin(math.radians(60*i-90))] for i in range(6)], [])
    ring_col = GOLD if (sp['isBoss'] or sp['isBig3']) else tc
    d.add(Polygon(points=hexpts(38), fillColor=hexlerp(sp['palette']['primary'],'#000000',0.35), strokeColor=ring_col, strokeWidth=2.0))
    d.add(Polygon(points=hexpts(31), fillColor=prim, strokeColor=None))
    d.add(Polygon(points=hexpts(22), fillColor=sec, strokeColor=None))
    d.add(Circle(cx-9, cy+9, 4.5, fillColor=HexColor('#dde6ff'), strokeColor=None))  # shine
    # monogram
    mono = sp['name'][0].upper()
    d.add(String(cx, cy-8, mono, fontName=DISP, fontSize=30, fillColor=HexColor('#f4f6ff'), textAnchor='middle'))
    # element dots along the base
    els = sp['elements']; n=len(els); gap=13; x0 = cx-(n-1)*gap/2.0
    for i,e in enumerate(els):
        d.add(Circle(x0+i*gap, 7, 4.0, fillColor=ecol(e), strokeColor=HexColor('#0c1024'), strokeWidth=0.5))
    return d

# ----------------------------------------------------------------------------- stat bars
def stat_bars(sp, w=112, h=92):
    d = Drawing(w, h); tc = tcol(sp['type'])
    rows = STAT_KEYS; rh = h/len(rows); barx = 26; barw = w-barx-20
    for i,k in enumerate(rows):
        y = h - (i+1)*rh + 3
        d.add(String(0, y, k.upper(), fontName=MONO, fontSize=6.2, fillColor=DIM))
        d.add(Rect(barx, y-1, barw, 5.2, rx=2, ry=2, fillColor=PANEL2, strokeColor=None))
        frac = min(1.0, sp['base'][k]/float(STAT_MAX[k]))
        d.add(Rect(barx, y-1, max(1.4, barw*frac), 5.2, rx=2, ry=2, fillColor=tc, strokeColor=None))
        d.add(String(w, y, str(sp['base'][k]), fontName=MONO, fontSize=6.2, fillColor=INK, textAnchor='end'))
    return d

# ----------------------------------------------------------------------------- helpers for card text
def chips_html(els):
    return '   '.join('<font name="%s" color="%s">●</font> %s' % (SANS, ECSS.get(e,'#888'), e) for e in els)

def notable_techs(sp):
    seen=set(); picks=[]
    ts = sorted(sp['techs'], key=lambda t:(0 if t['signature'] else 1, -t['power']))
    for t in ts:
        if t['name'] in seen: continue
        seen.add(t['name']); picks.append(t)
        if len(picks)>=5: break
    out=[]
    for t in picks:
        tag = ' ★' if t['signature'] else ''
        pw = ' (%d)'%t['power'] if t['power']>0 else ''
        out.append('%s%s%s'%(esc(t['name']), pw, tag))
    return ', '.join(out)

def evo_lines(sp):
    out=[]
    frm = EVO_FROM.get(sp['id'])
    if frm:
        src, fld, e = frm[0]
        verb = {'evolve':'Evolves from','extraEvolvesTo':'Branches from','ascend':'Ascends from'}.get(
               'ascend' if fld=='ascendsTo' else ('extraEvolvesTo' if fld=='extraEvolvesTo' else 'evolve'),'From')
        out.append('%s <b>%s</b>'%(verb, esc(SP[src]['name'])))
    if sp.get('evolvesTo'):
        t=sp['evolvesTo']; out.append('Evolves into <b>%s</b> at Lv.%d'%(esc(SP[t['species']]['name']), t['level']))
    if sp.get('extraEvolvesTo'):
        t=sp['extraEvolvesTo']; out.append('Split path into <b>%s</b> at Lv.%d'%(esc(SP[t['species']]['name']), t['level']))
    if sp.get('ascendsTo'):
        t=sp['ascendsTo']; reqs=[]
        if t.get('level'): reqs.append('Lv.%d'%t['level'])
        if t.get('item'): reqs.append(ITEMNAME.get(t['item'],t['item']))
        if t.get('flag'): reqs.append(FLAGNAME.get(t['flag'],t['flag']))
        out.append('Ascends » <b>%s</b> <i>(%s — %s)</i>'%(
            esc(SP[t['species']]['name']), esc(t.get('kind','')), esc(', '.join(reqs) if reqs else 'rite')))
    if not out: out.append('A singular form — it evolves from nothing and into nothing.')
    return '<br/>'.join(out)

# ----------------------------------------------------------------------------- Guardian card
def guardian_card(sp):
    tc = tcol(sp['type'])
    badge = ''
    if sp['isBig3']: badge = '  <font color="#f2c44e">◆ LEGEND</font>'
    elif sp['isBoss']: badge = '  <font color="#f2c44e">▲ WORLD-BOSS</font>'
    elif sp['isFusion']: badge = '  <font color="#9adfff">◇ FUSION</font>'
    rank = STAGE_RANK.get(sp['stage'], 0)
    name_p = Paragraph('<font color="%s">%s</font>%s'%(thex(sp['type']), esc(sp['name']), badge), S['cardname'])
    meta_p = Paragraph('%s &nbsp;·&nbsp; Form %d — <b>%s</b> &nbsp;·&nbsp; %s &nbsp;·&nbsp; <i>%s</i>'%(
        esc(sp['type']), rank, esc(STAGE_KIND.get(sp['stage'], sp['stage'])), esc(sp['stage']), esc(sp['archetype'].title())), S['meta'])
    chips_p = Paragraph(chips_html(sp['elements']), S['chips'])
    pas_p = Paragraph('<font name="%s" color="#f2c44e">Passive — %s.</font> <font color="#aab2d6">%s</font>'%(
        SANS_B, esc(sp['passive']['name']), esc(sp['passive']['desc'])), S['kv'])
    lore_p = Paragraph('“%s”'%esc(sp['desc']), S['lore'])
    evo_p = Paragraph(evo_lines(sp), S['kv'])
    tech_p = Paragraph('<font name="%s" color="#aab2d6">Techniques:</font> %s'%(SANS_B, notable_techs(sp)), S['cap'])

    left = [crest(sp), Spacer(1,2), stat_bars(sp)]
    right = [name_p, meta_p, chips_p, Spacer(1,2), pas_p, Spacer(1,1), lore_p, Spacer(1,2), evo_p, Spacer(1,1), tech_p]
    t = Table([[left, right]], colWidths=[1.62*cm+92, USABLE-(1.62*cm+92)])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), PANEL),
        ('BOX',(0,0),(-1,-1), 0.6, EDGE),
        ('LINEBEFORE',(0,0),(0,-1), 3.0, tc),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),
        ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
    ]))
    return KeepTogether([t, Spacer(1,7)])

# ----------------------------------------------------------------------------- evolution tree
def tree_drawing(root):
    rows = dfs_line(root)
    rows = [r for r in rows if r[0] in SP]
    rowH = 25.0; boxH=18.0; indent=24.0; toppad=6
    H = toppad*2 + rowH*len(rows)
    d = Drawing(USABLE, H)
    pos = {}
    def boxw(name): return max(58, min(150, 12 + len(name)*5.0))
    for i,(sid,depth,parent,kind,edge) in enumerate(rows):
        sp=SP[sid]; tc=tcol(sp['type'])
        x = 6 + depth*indent
        ytop = H - toppad - i*rowH
        yc = ytop - boxH/2.0
        w = boxw(sp['name']); pos[sid]=(x, yc, ytop, ytop-boxH)
        # connector from parent
        if parent and parent in pos:
            px = pos[parent][0]; pbot = pos[parent][3]
            col = {'evolve':tc,'ascend':GOLD,'split':HexColor(sp['palette']['accent'])}.get(kind, FAINT)
            d.add(PolyLine([px+9, pbot, px+9, yc, x, yc], strokeColor=col, strokeWidth=1.1))
            d.add(Polygon([x,yc, x-5,yc+2.6, x-5,yc-2.6], fillColor=col, strokeColor=None))
            if edge:
                d.add(String(px+13, (pbot+yc)/2.0-2, edge_label(kind,edge), fontName=MONO, fontSize=5.7, fillColor=col))
        ringc = GOLD if (sp['isBoss'] or sp['isBig3']) else tc
        d.add(Rect(x, ytop-boxH, w, boxH, rx=4, ry=4, fillColor=PANEL2, strokeColor=ringc, strokeWidth=1.0))
        d.add(Circle(x+9, yc, 3.2, fillColor=ecol(sp['elements'][0]), strokeColor=None))
        d.add(String(x+16, yc-2.4, sp['name'], fontName=SANS_B, fontSize=7.2, fillColor=INK))
        d.add(String(x+w+5, yc-2.2, sp['stage'], fontName=SANS, fontSize=6.0, fillColor=DIM))
    return d

# ----------------------------------------------------------------------------- damage lattice
def damage_grid():
    head = [''] + ELEMENTS
    data = [head]
    for a in ELEMENTS:
        row=[a]
        for dfd in ELEMENTS:
            m = ECHART.get(a,{}).get(dfd, 1.0)
            row.append('–' if abs(m-1.0)<1e-6 else ('×%s'%(('%g'%m))))
        data.append(row)
    cw = [1.4*cm] + [(USABLE-1.4*cm)/len(ELEMENTS)]*len(ELEMENTS)
    t = Table(data, colWidths=cw, rowHeights=[0.62*cm]*(len(ELEMENTS)+1))
    st = [('FONTNAME',(0,0),(-1,-1),MONO),('FONTSIZE',(0,0),(-1,-1),6.6),
          ('ALIGN',(0,0),(-1,-1),'CENTER'),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
          ('BACKGROUND',(0,0),(-1,-1),PANEL),('TEXTCOLOR',(0,0),(-1,-1),INK),
          ('BOX',(0,0),(-1,-1),0.5,EDGE),('INNERGRID',(0,0),(-1,-1),0.25,HexColor('#0c1024'))]
    for i,e in enumerate(ELEMENTS):
        st.append(('TEXTCOLOR',(i+1,0),(i+1,0), ecol(e)))
        st.append(('TEXTCOLOR',(0,i+1),(0,i+1), ecol(e)))
        st.append(('FONTNAME',(i+1,0),(i+1,0),SANS_B)); st.append(('FONTNAME',(0,i+1),(0,i+1),SANS_B))
        st.append(('FONTSIZE',(i+1,0),(i+1,0),6.0)); st.append(('FONTSIZE',(0,i+1),(0,i+1),6.0))
    for r,a in enumerate(ELEMENTS):
        for c,dfd in enumerate(ELEMENTS):
            m = ECHART.get(a,{}).get(dfd,1.0)
            if m>1: bg = hexlerp('#141a30','#e8546e', min(0.65,(m-1)*0.55+0.12))
            elif m<1: bg = hexlerp('#141a30','#5f86e0', min(0.65,(1-m)*0.7+0.12))
            else: bg = PANEL
            st.append(('BACKGROUND',(c+1,r+1),(c+1,r+1), bg))
    t.setStyle(TableStyle(st))
    return t

# ----------------------------------------------------------------------------- divider flowable
class Band(Flowable):
    def __init__(self, w, h, color): super().__init__(); self.w=w; self.h=h; self.color=color
    def wrap(self, *a): return (self.w, self.h)
    def draw(self):
        c=self.canv
        n=max(1,int(self.h))
        for i in range(n):
            c.setFillColor(hexlerp(self.color, '#0a0e1c', i/float(n)))
            c.rect(0, self.h-i-1, self.w, 1.4, stroke=0, fill=1)

def type_divider(t):
    el = TYPE_ELEMENT[t]; tc = tcol(t)
    d = Drawing(USABLE, 84)
    d.add(Rect(0,0,USABLE,84, fillColor=PANEL, strokeColor=None))
    d.add(Rect(0,0,5,84, fillColor=tc, strokeColor=None))
    d.add(String(20, 46, t.upper(), fontName=DISP, fontSize=34, fillColor=tc))
    d.add(String(22, 28, 'The %s Lineages'%t, fontName=SERIF_I, fontSize=12, fillColor=INK))
    d.add(String(22, 13, TYPE_MOTTO.get(t,''), fontName=SERIF_I, fontSize=9, fillColor=DIM))
    # element identity (computed from chart)
    strong=[x for x in ELEMENTS if ECHART.get(el,{}).get(x,1)>1]
    weak  =[x for x in ELEMENTS if ECHART.get(el,{}).get(x,1)<1]
    d.add(String(USABLE-12, 60, 'PRIMARY ELEMENT', fontName=SANS_B, fontSize=7, fillColor=DIM, textAnchor='end'))
    d.add(Circle(USABLE-150, 44, 6, fillColor=ecol(el), strokeColor=None))
    d.add(String(USABLE-138, 41, el, fontName=SANS_B, fontSize=12, fillColor=ecol(el)))
    d.add(String(USABLE-12, 41, '', textAnchor='end'))
    d.add(String(USABLE-12, 25, 'Strikes hard: '+', '.join(strong[:5]), fontName=SANS, fontSize=6.6, fillColor=RED, textAnchor='end'))
    d.add(String(USABLE-12, 13, 'Shrugs off: '+', '.join(weak[:6]), fontName=SANS, fontSize=6.6, fillColor=BLUE, textAnchor='end'))
    return d

# ----------------------------------------------------------------------------- canvas: bg + cover + footer
def paint_bg(canvas, doc):
    canvas.saveState()
    bands=60
    for i in range(bands):
        canvas.setFillColor(hexlerp('#06080f','#0c1228', i/float(bands)))
        canvas.rect(0, PAGEH*i/bands, PAGEW, PAGEH/bands+1, stroke=0, fill=1)
    canvas.setStrokeColor(GOLDD); canvas.setLineWidth(0.6)
    canvas.line(MARGIN, PAGEH-MARGIN+10, PAGEW-MARGIN, PAGEH-MARGIN+10)
    canvas.setStrokeColor(HexColor('#1b2240')); canvas.setLineWidth(0.5)
    canvas.line(MARGIN, MARGIN-8, PAGEW-MARGIN, MARGIN-8)
    canvas.setFont(SANS, 7.2); canvas.setFillColor(FAINT)
    canvas.drawString(MARGIN, MARGIN-18, 'THE GUARDIAN COMPENDIUM OF AUREL')
    canvas.drawRightString(PAGEW-MARGIN, MARGIN-18, '%d'%doc.page)
    canvas.setFillColor(GOLDD); canvas.drawCentredString(PAGEW/2.0, MARGIN-18, '❖')
    canvas.restoreState()

def paint_cover(canvas, doc):
    import math
    canvas.saveState()
    bands=80
    for i in range(bands):
        canvas.setFillColor(hexlerp('#04060c','#0e1430', i/float(bands)))
        canvas.rect(0, PAGEH*i/bands, PAGEW, PAGEH/bands+1, stroke=0, fill=1)
    cx, cy = PAGEW/2.0, PAGEH*0.62
    # concentric rings
    for r,wid,al in [(150,1.4,0.9),(120,0.8,0.6),(92,0.6,0.4)]:
        canvas.setStrokeColor(Color(GOLD.red,GOLD.green,GOLD.blue,al)); canvas.setLineWidth(wid)
        canvas.circle(cx, cy, r, stroke=1, fill=0)
    # element sigils around the ring
    for i,e in enumerate(ELEMENTS):
        a = math.radians(-90 + i*36)
        ex, ey = cx+135*math.cos(a), cy+135*math.sin(a)
        canvas.setFillColor(ecol(e)); canvas.circle(ex, ey, 7.5, stroke=0, fill=1)
        canvas.setFillColor(Color(1,1,1,0.16)); canvas.circle(ex-1.6, ey+1.6, 2.6, stroke=0, fill=1)
    # central emblem
    canvas.setFillColor(GOLD); canvas.setFont(DISP, 64)
    canvas.drawCentredString(cx, cy-22, 'A')
    canvas.setStrokeColor(GOLD); canvas.setLineWidth(0.8); canvas.circle(cx, cy, 52, stroke=1, fill=0)
    # title
    canvas.setFillColor(INK); canvas.setFont(DISP, 33)
    canvas.drawCentredString(cx, PAGEH*0.40, 'THE GUARDIAN')
    canvas.drawCentredString(cx, PAGEH*0.40-38, 'COMPENDIUM')
    canvas.setFillColor(GOLD); canvas.setFont(SERIF_I, 18)
    canvas.drawCentredString(cx, PAGEH*0.40-66, 'of Aurel')
    canvas.setStrokeColor(GOLDD); canvas.setLineWidth(0.7)
    canvas.line(cx-120, PAGEH*0.40-80, cx+120, PAGEH*0.40-80)
    canvas.setFillColor(DIM); canvas.setFont(SANS, 10.5)
    canvas.drawCentredString(cx, PAGEH*0.40-100, 'B E S T I A R Y   ·   E V O L U T I O N S   ·   E L E M E N T S   ·   L O R E')
    canvas.setFillColor(FAINT); canvas.setFont(SANS, 9)
    canvas.drawCentredString(cx, PAGEH*0.085+14, '%d Guardians · 6 Elemental Houses · Nine Forms · the Big Three and their Nine'%len(SPECIES))
    canvas.drawCentredString(cx, PAGEH*0.085, 'A Tamer’s Codex — First Edition')
    canvas.restoreState()

# ----------------------------------------------------------------------------- assemble
story = [NextPageTemplate('main'), PageBreak()]   # page 1 = cover template; content from page 2

def chapter(title, sub=None):
    fl=[CondPageBreak(6*cm), Paragraph(esc(title), S['chapter'])]
    if sub: fl.append(Paragraph(esc(sub), S['chapsub']))
    fl.append(Band(USABLE, 3, GOLDX)); fl.append(Spacer(1,8))
    return fl

def para(txt, st='body'): return Paragraph(txt, S[st])

# ---- Foreword / how to read
story += chapter('Foreword', 'On the keeping of Guardians, and the reading of this codex.')
story += [para(
 'Across Aurel — from the lantern-streets of Haven City to the neon Circuit-Crown of Terra, from the drowned vaults of the old empire to the sealed dark of Ghandra — the bond between Tamer and Guardian is the oldest craft there is. This codex gathers every known Guardian: its forms, its elements, the powers it grows into, and the lore the Guilds have set down. '
 'Each entry is drawn straight from the living records of the World Circuit.')]
story += [para('<b>How to read an entry.</b> Every Guardian is given a card. On the left sits its <b>crest</b> (coloured to its own hide) and a <b>stat profile</b> — HP, SP, Attack, Defence, Speed and Wisdom — with bars measured against the mightiest of their kind, so a glance tells you raw power. On the right: its <b>Form</b> and rank on the nine-step ladder, its <b>elements</b>, its innate <b>Passive</b>, a line of lore, its place in the <b>evolution tree</b>, and its signature <b>techniques</b> (★ marks a unique art).', 'body')]
story += [para('<b>A word on power.</b> Damage in Aurel is reckoned as a share of the foe’s vitality, never a flat number, so no blow — however vast the attacker — can erase a Guardian outright. Two laws shape every duel: the <b>Elemental Lattice</b> (overleaf), and the <b>Form-Block</b> — the hard truth that a lesser form, however brave, simply cannot wound a greater one the way an equal could.', 'body')]

# ---- The Age of Aurel (timeline)
story += [PageBreak()] + chapter('I. The Age of Aurel', 'Six turnings of the world, as the Chronicle keeps them.')
for era in LORE['timeline']:
    story += [Paragraph('<font name="%s" color="#f2c44e">%s</font> &nbsp; <font color="#9aa4c8">(%s)</font>'%(SANS_B, esc(era['title']), esc(era['when'])), S['h3']),
              para(esc(era['text']), 'body')]

# ---- The Ten Elements & the Damage Lattice
story += [PageBreak()] + chapter('II. The Ten Elements', 'And the lattice of strength and weakness that binds them.')
story += [para('Every Guardian carries one to three elements — the singular beings, four. When an art lands, its element is weighed against <i>each</i> element the defender bears, and the products multiplied; a Guardian of two elements can thus be doubly broken, or doubly safe. The lattice below reads attacker (down the left) against defender (across the top): <font color="#e8546e">red</font> is devastation, <font color="#5f86e0">blue</font> is resistance, a dash is even ground.', 'body')]
story += [Spacer(1,4), damage_grid(), Spacer(1,8)]
story += [para('<b>Identities of note.</b> <font color="#f2603a">Fire</font> withers <font color="#4ec45e">Nature</font> and <font color="#9adff2">Ice</font> but gutters in <font color="#3a9df2">Water</font>. <font color="#f2d23a">Electric</font> is annihilated by the earth — grounded to a quarter against <font color="#b0865a">Rock</font> — yet rules the <font color="#3a9df2">sea</font> and the <font color="#7a8af2">void</font>. <font color="#f2e8b8">Light</font> and <font color="#9a5af2">Dark</font> are eternal rivals, each twice as cruel to the other. And <font color="#ff9ad2">Aether</font>, the first element, strikes all of creation hard and shrugs off everything but Light and Dark — which is why only legends and bosses are made of it.', 'body')]

# ---- The Nine Forms
story += [PageBreak()] + chapter('III. The Nine Forms', 'The ladder of evolution — and the Form-Block that guards it.')
ladder = [('Novice','The hatchling state. Lowest stats, lowest reach — but every legend began here.'),
 ('Adept','The first evolution. Confidence, and the first real techniques.'),
 ('Elite','Twice-evolved. The backbone of any serious team.'),
 ('Apex','Thrice-evolved — the natural peak of a wild line, and the gate to the higher mysteries.'),
 ('Split','The fourth form forks in two: a Guardian chooses one of two destinies. Reached at the Ascension Lab.'),
 ('Special','Drawn out of a Split form by training and will.'),
 ('Terra','Re-forged in the world-furnaces of Terra City — requires a Terra Catalyst.'),
 ('Transcendent','A form that sheds its mortal shape. Requires a Transcendence Sigil and great level.'),
 ('Aether','The eighth and final evolution — the stuff of the Big Three’s Nine. Mostly fought, rarely tamed; an Aether Shard is the only key.')]
for i,(name,desc) in enumerate(ladder):
    colx = '#f2c44e' if name=='Aether' else ('#ff9ad2' if name in ('Terra','Transcendent','Special','Split') else '#e9edfb')
    story += [Paragraph('<font name="%s" color="%s">Form %d — %s</font>'%(SANS_B, colx, i, esc(name)), S['kv']),
              Paragraph(esc(desc), S['cap']), Spacer(1,3)]
story += [Spacer(1,4), para('<b>The Form-Block.</b> When a lower form strikes a higher one it is <i>out-classed</i>: the defender shrugs off <b>5% of the damage for every form it stands above the attacker</b>, to a ceiling of 40% — and this stacks atop the elemental lattice. A Novice may chip an Apex; it cannot fell one. An Aether-born, striking down the ladder, suffers no such penalty: it lands in full. This single law is why the Big Three’s Nine are spoken of in the same breath as natural disasters.', 'body')]

# ---- The Bestiary, by element
story += [PageBreak()] + chapter('IV. The Bestiary', 'Every lineage of Aurel, house by house — trees, then full entries.')
TYPE_ORDER=['Blaze','Tide','Verdant','Volt','Gale','Umbra']
roots_by_type={t:[] for t in TYPE_ORDER}
for s in SPECIES:
    if s['id'] in TARGETS or s['id'] in EXCLUDED: continue
    roots_by_type.get(s['type'], roots_by_type.setdefault(s['type'],[])).append(s['id'])
emitted=set()
for t in TYPE_ORDER:
    story += [CondPageBreak(10*cm), type_divider(t), Spacer(1,10)]
    rts = sorted(roots_by_type.get(t,[]), key=lambda i: (-(len(dfs_line(i))), SP[i]['name']))
    # trees first (overview)
    story += [Paragraph('Evolution Lines', S['h2'])]
    for rid in rts:
        line=[x for x in dfs_line(rid) if x[0] in SP]
        if not line: continue
        title=Paragraph('<font name="%s" color="#9aa4c8">%s line</font>'%(SANS_B, esc(SP[rid]['name'])), S['cap'])
        story += [KeepTogether([title, tree_drawing(rid), Spacer(1,6)])]
    # full entries, grouped by line
    story += [Paragraph('Guardian Archive', S['h2'])]
    for rid in rts:
        for sid,_,_,_,_ in dfs_line(rid):
            if sid in emitted or sid not in SP or sid in EXCLUDED: continue
            emitted.add(sid); story.append(guardian_card(SP[sid]))

# ---- The Aether Crown — the Big Three & their Nine
story += [PageBreak()] + chapter('V. The Aether Crown', 'The Big Three of the World Circuit, and the Nine bonded lights that walked into Ghandra.')
story += [para('Three names stand above the Circuit: <b>Aljay the Dawnflame</b>, <b>Greggy the Stormheart</b>, and <b>Onnel the Worldroot</b>. Between them they hold more titles than the Coliseum has walls to hang them on — and each walked into the sealed dark of Ghandra with three bonded Guardians of the eighth form. These nine Aether-born are the only ones of their kind, and the measuring-stick against which all other power is judged.', 'body')]
for lg in LORE['legends']:
    head = '<font name="%s" color="%s">%s</font> <font color="#9aa4c8">— %s</font>'%(SANS_B, lg.get('color','#f2c44e'), esc(lg['name']), esc(lg['title']))
    sub = '%s · %s championship%s%s'%(esc(lg.get('element','')), lg.get('championships','?'),
            '' if lg.get('championships')==1 else 's', (' · '+esc(lg.get('champYears',''))) if lg.get('champYears') else '')
    story += [CondPageBreak(8*cm), Paragraph(head, S['h2']), Paragraph(sub, S['meta'])]
    if lg.get('story'): story += [para(esc(lg['story']), 'lore')]
    for g in lg['guardians']:
        sid = g['name'].lower()
        if sid in SP:
            story.append(guardian_card(SP[sid])); emitted.add(sid)
        else:
            story += [Paragraph('<b>%s</b> — <i>%s</i>'%(esc(g['name']), esc(g.get('epithet',''))), S['kv']),
                      Paragraph('“%s”'%esc(g.get('desc','')), S['lore']), Spacer(1,4)]

# ---- Aether world-bosses (the new top-tier)
bosses=[s for s in SPECIES if s['isBoss']]
if bosses:
    story += [Paragraph('The Aether World-Enders', S['h2']),
        para('Where a lineage reaches all the way to the eighth form, it does not produce a champion — it produces a calamity. These six are the apex of their elemental houses, fought in the deep trials of the world and tamed by almost no one.', 'body')]
    for b in bosses:
        story += [Paragraph('<font name="%s" color="#f2c44e">☠ %s</font> <font color="#9aa4c8">— %s, the Aether %s</font>'%(
            SANS_B, esc(b['name']), esc(b['type']), esc(' / '.join(b['elements']))), S['kv']),
            Paragraph('“%s”'%esc(b['desc']), S['lore']), Spacer(1,3)]

# ---- The Corrupted Legion
story += [PageBreak()] + chapter('VI. The Corrupted Legion', 'Nine generals of Ghandra, sealed but not slain.')
story += [para(esc(LORE.get('legionSummary','')), 'body')]
for gen in LORE['corruptedLegion']:
    sid=gen['speciesId']
    story += [Paragraph('<font name="%s" color="#ff5a6e">%s</font> <font color="#9aa4c8">— %s, commander of %s</font>'%(
        SANS_B, esc(SP[sid]['name'] if sid in SP else sid), esc(gen.get('title','')), esc(gen.get('army',''))), S['kv'])]
    if sid in SP:
        story.append(guardian_card(SP[sid])); emitted.add(sid)

story += [Paragraph('The Corrupted Sentinels', S['h2']),
    para('Before the nine generals, lesser corruptions stirred — old guardian-engines and beasts warped by Ghandra’s leak, loosed across Aurel as the first warnings that the seal had begun to strain.', 'body')]
for sid in ['ironhusk','gravemaw','voltigarch']:
    if sid in SP and sid not in emitted:
        story.append(guardian_card(SP[sid])); emitted.add(sid)

# ---- Appendix: full roster index
story += [PageBreak()] + chapter('Appendix', 'The complete roster of Aurel, by house and form.')
rows=[['Guardian','House','Form','Rank','Elements']]
for s in sorted(SPECIES, key=lambda x:(TYPE_ORDER.index(x['type']) if x['type'] in TYPE_ORDER else 9, STAGE_RANK.get(x['stage'],0), x['name'])):
    rows.append([s['name'], s['type'], s['stage'], str(STAGE_RANK.get(s['stage'],0)), '/'.join(s['elements'])])
idx = Table(rows, colWidths=[USABLE*0.30, USABLE*0.16, USABLE*0.20, USABLE*0.10, USABLE*0.24], repeatRows=1)
ist=[('FONTNAME',(0,0),(-1,0),SANS_B),('FONTNAME',(0,1),(-1,-1),SANS),('FONTSIZE',(0,0),(-1,-1),7.4),
     ('TEXTCOLOR',(0,0),(-1,0),GOLD),('TEXTCOLOR',(0,1),(-1,-1),INK),
     ('BACKGROUND',(0,0),(-1,0),PANEL2),('ROWBACKGROUNDS',(0,1),(-1,-1),[PANEL, HexColor('#101729')]),
     ('LINEBELOW',(0,0),(-1,0),0.6,GOLDD),('TOPPADDING',(0,0),(-1,-1),2.2),('BOTTOMPADDING',(0,0),(-1,-1),2.2),
     ('LEFTPADDING',(0,0),(-1,-1),6)]
for i in range(1,len(rows)):
    ist.append(('TEXTCOLOR',(1,i),(1,i), tcol(rows[i][1])))
idx.setStyle(TableStyle(ist))
story += [idx]
story += [Spacer(1,10), Paragraph('Compiled from the living records of the World Circuit — %d Guardians across nine forms. “Train them well; they are not weapons, but bonds.”'%len(SPECIES), S['chapsub'])]

# ----------------------------------------------------------------------------- build
def mkframe(): return Frame(MARGIN, MARGIN, USABLE, PAGEH-2*MARGIN, id='f',
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc = BaseDocTemplate(OUT, pagesize=A4, title='The Guardian Compendium of Aurel',
                      author='The World Circuit of Aurel', leftMargin=MARGIN, rightMargin=MARGIN,
                      topMargin=MARGIN, bottomMargin=MARGIN)
doc.addPageTemplates([
    PageTemplate(id='cover', frames=[mkframe()], onPage=paint_cover),   # page 1 (default)
    PageTemplate(id='main',  frames=[mkframe()], onPage=paint_bg),
])
doc.build(story)
print('PDF written:', OUT, '— emitted cards:', len(emitted), '/', len(SPECIES))
