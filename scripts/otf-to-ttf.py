"""Convert the brand OpenType masters in assets/fonts to TrueType outlines.

Android's typeface loader does not parse PostScript (CFF) outlines: it returns the default
system face without raising, so a CFF .otf renders correctly on iOS and as Roboto on Android.
The cubic curves are approximated with quadratics to within 1 unit per 1000 em, which measured
under 1% area drift per glyph across all seven faces.

Run after dropping new masters in from the Claude Design project:

    pip install "fonttools[ufo]"
    python scripts/otf-to-ttf.py assets/fonts

Then commit both the .otf masters and the generated .ttf files; app/_layout.tsx registers the
.ttf.
"""

import sys, glob, os
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen

MAX_ERR = 1.0  # units per em tolerance, the standard otf2ttf default

def convert(src, dst):
    f = TTFont(src)
    upem = f['head'].unitsPerEm
    gs = f.getGlyphSet()
    glyf = newTable('glyf'); glyf.glyphOrder = f.getGlyphOrder(); glyf.glyphs = {}
    for name in f.getGlyphOrder():
        pen = TTGlyphPen(gs)
        gs[name].draw(Cu2QuPen(pen, MAX_ERR * upem / 1000))
        glyf[name] = pen.glyph()
    f['glyf'] = glyf
    f['loca'] = newTable('loca')
    f['maxp'] = newTable('maxp'); f['maxp'].tableVersion = 0x00010000
    maxp = f['maxp']
    maxp.numGlyphs = len(f.getGlyphOrder())
    # No hinting survives the conversion, so the TrueType instruction limits are all zero.
    for field, value in (
        ('maxZones', 0), ('maxTwilightPoints', 0), ('maxStorage', 0),
        ('maxFunctionDefs', 0), ('maxInstructionDefs', 0), ('maxStackElements', 0),
        ('maxSizeOfInstructions', 0), ('maxComponentElements', 0), ('maxComponentDepth', 0),
        ('maxPoints', 0), ('maxContours', 0),
        ('maxCompositePoints', 0), ('maxCompositeContours', 0),
    ):
        setattr(maxp, field, value)
    for name in glyf.keys():
        glyf[name].recalcBounds(glyf)
    f['maxp'].recalc(f)
    for t in ('CFF ', 'CFF2', 'VORG'):
        if t in f: del f[t]
    post = f['post']; post.formatType = 2.0
    post.extraNames = []; post.mapping = {}; post.glyphOrder = f.getGlyphOrder()
    f['head'].indexToLocFormat = 0
    f.save(dst)
    return dst

for src in sorted(glob.glob(sys.argv[1] + '/*.otf')):
    dst = src[:-4] + '.ttf'
    convert(src, dst)
    print(os.path.basename(dst), os.path.getsize(dst))
