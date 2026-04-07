/**
 * Service de conversion SRT → FCPXML (Final Cut Pro)
 *
 * Parse un fichier .srt, redécoupe les blocs en N mots par sous-titre,
 * et génère un fichier FCPXML avec des Titles stylisés.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface SrtBlock {
    index: number;
    startMs: number;
    endMs: number;
    text: string;
}

export interface SubtitleBlock {
    index: number;
    startMs: number;
    endMs: number;
    text: string;
}

export interface ShadowStyle {
    enabled: boolean;
    color: string;           // hex (#60407f)
    opacity: number;         // 0-100
    blur: number;            // blur radius
    distance: number;        // distance in px
    angle: number;           // angle in degrees (0-360)
}

export interface SubtitleStyle {
    fontFamily: string;
    fontSize: number;
    fontColor: string;       // hex (#FFFFFF)
    bold: boolean;
    italic: boolean;
    alignment: 'center' | 'left' | 'right';
    positionY: number;       // vertical position (negative = bottom), e.g. -430
    maxCharsPerLine: number; // 0 = no wrapping
    shadow: ShadowStyle;
}

export interface VideoFormat {
    id: string;
    label: string;
    width: number;
    height: number;
    fcpName: string;
    frameDuration: string;
}

export const VIDEO_FORMATS: VideoFormat[] = [
    { id: 'h1080_30', label: 'Horizontal (1920x1080)', width: 1920, height: 1080, fcpName: 'FFVideoFormat1080p3000', frameDuration: '100/3000s' },
    { id: 'v1080_30', label: 'Vertical (1080x1920)',   width: 1080, height: 1920, fcpName: 'FFVideoFormat1080x1920p3000', frameDuration: '100/3000s' },
];

export const DEFAULT_SHADOW: ShadowStyle = {
    enabled: true,
    color: '#60407f',
    opacity: 100,
    blur: 0,
    distance: 7,
    angle: 315,
};

export const DEFAULT_STYLE: SubtitleStyle = {
    fontFamily: 'Futura',
    fontSize: 36,
    fontColor: '#FFFFFF',
    bold: true,
    italic: false,
    alignment: 'center',
    positionY: -430,
    maxCharsPerLine: 25,
    shadow: { ...DEFAULT_SHADOW },
};

// ── SRT Parser ──────────────────────────────────────────────────────

function parseTimestamp(ts: string): number {
    // Format: HH:MM:SS,mmm
    const match = ts.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
    if (!match) return 0;
    const [, h, m, s, ms] = match;
    return parseInt(h) * 3600000 + parseInt(m) * 60000 + parseInt(s) * 1000 + parseInt(ms);
}

export function parseSrt(content: string): SrtBlock[] {
    const blocks: SrtBlock[] = [];
    // Normalize line endings
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    let i = 0;
    while (i < lines.length) {
        // Skip empty lines
        while (i < lines.length && lines[i].trim() === '') i++;
        if (i >= lines.length) break;

        // Block index
        const indexLine = lines[i].trim();
        if (!/^\d+$/.test(indexLine)) { i++; continue; }
        const index = parseInt(indexLine);
        i++;

        // Timestamp line
        if (i >= lines.length) break;
        const tsLine = lines[i].trim();
        const tsMatch = tsLine.match(/^(.+?)\s*-->\s*(.+?)$/);
        if (!tsMatch) { i++; continue; }
        const startMs = parseTimestamp(tsMatch[1]);
        const endMs = parseTimestamp(tsMatch[2]);
        i++;

        // Text lines (until empty line or end)
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i].trim());
            i++;
        }

        blocks.push({
            index,
            startMs,
            endMs,
            text: textLines.join(' '),
        });
    }

    return blocks;
}

// ── Word regrouping ─────────────────────────────────────────────────

interface TimedWord {
    word: string;
    startMs: number;
    endMs: number;
}

function distributeWordsInBlock(block: SrtBlock): TimedWord[] {
    const words = block.text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];
    if (words.length === 1) {
        return [{ word: words[0], startMs: block.startMs, endMs: block.endMs }];
    }

    const totalDuration = block.endMs - block.startMs;
    const totalChars = words.reduce((sum, w) => sum + w.length, 0);

    const timedWords: TimedWord[] = [];
    let currentTime = block.startMs;

    for (let i = 0; i < words.length; i++) {
        const proportion = words[i].length / totalChars;
        const wordDuration = Math.round(totalDuration * proportion);
        const endTime = i === words.length - 1 ? block.endMs : currentTime + wordDuration;

        timedWords.push({
            word: words[i],
            startMs: currentTime,
            endMs: endTime,
        });
        currentTime = endTime;
    }

    return timedWords;
}

export function regroupSubtitles(srtBlocks: SrtBlock[], wordsPerBlock: number): SubtitleBlock[] {
    // Flatten all words with estimated timing
    const allWords: TimedWord[] = [];
    for (const block of srtBlocks) {
        allWords.push(...distributeWordsInBlock(block));
    }

    if (allWords.length === 0) return [];

    // Regroup into chunks of N words
    const subtitles: SubtitleBlock[] = [];
    let idx = 1;

    for (let i = 0; i < allWords.length; i += wordsPerBlock) {
        const chunk = allWords.slice(i, i + wordsPerBlock);
        subtitles.push({
            index: idx++,
            startMs: chunk[0].startMs,
            endMs: chunk[chunk.length - 1].endMs,
            text: chunk.map(w => w.word).join(' '),
        });
    }

    return subtitles;
}

// ── FCPXML Generator ────────────────────────────────────────────────

/** Convert ms to frame-aligned FCP rational time (30fps → N/30s) */
function msToFcpTime(ms: number, fps: number = 30): string {
    const frames = Math.round(ms * fps / 1000);
    return `${frames}/${fps}s`;
}

function hexToFcpColor(hex: string, alpha: number = 1): string {
    // Convert #RRGGBB to "R G B A" (0-1 range)
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} ${alpha.toFixed(4)}`;
}

function shadowToFcpAttrs(shadow: ShadowStyle): string {
    if (!shadow.enabled) return '';
    const alpha = shadow.opacity / 100;
    const shadowColor = hexToFcpColor(shadow.color, alpha);
    // Convert distance + angle to X/Y offset (FCP Y-up coordinate system)
    const angleRad = shadow.angle * Math.PI / 180;
    const offsetX = (shadow.distance * Math.cos(angleRad)).toFixed(2);
    const offsetY = (shadow.distance * Math.sin(angleRad)).toFixed(2);
    return ` shadowColor="${shadowColor}" shadowOffset="${offsetX} ${offsetY}" shadowBlurRadius="${shadow.blur}"`;
}

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Wrap text into multiple lines respecting max chars per line at word boundaries */
export function wrapText(text: string, maxChars: number): string {
    if (maxChars <= 0 || text.length <= maxChars) return text;
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? current + ' ' + word : word;
        if (candidate.length > maxChars && current) {
            lines.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }
    if (current) lines.push(current);
    return lines.join('\n');
}

export function generateFcpxml(
    subtitles: SubtitleBlock[],
    style: SubtitleStyle,
    videoFormat: VideoFormat,
    projectName: string = 'Sous-titres',
): string {
    if (subtitles.length === 0) return '';

    // Extract fps from frameDuration (e.g. "100/3000s" → 30)
    const fdMatch = videoFormat.frameDuration.match(/^(\d+)\/(\d+)s$/);
    const fps = fdMatch ? Math.round(parseInt(fdMatch[2]) / parseInt(fdMatch[1])) : 30;

    const maxChars = style.maxCharsPerLine;
    const totalDurationMs = subtitles[subtitles.length - 1].endMs;
    const totalDuration = msToFcpTime(totalDurationMs, fps);
    const fcpColor = hexToFcpColor(style.fontColor);

    // Gap starts at 3600s (FCP convention) — connected clip offsets must be relative to this
    const gapStartFrames = 3600 * fps;

    // Line height in FCP ≈ fontSize * 1.2
    const lineHeight = Math.round(style.fontSize * 1.2);

    const titleElements = subtitles.map((sub, i) => {
        const offsetFrames = gapStartFrames + Math.round(sub.startMs * fps / 1000);
        const offset = `${offsetFrames}/${fps}s`;
        const duration = msToFcpTime(sub.endMs - sub.startMs, fps);
        const tsId = `ts${i + 1}`;
        const wrappedText = wrapText(sub.text, maxChars);

        // Compensate Y position: shift up by (extraLines * lineHeight) so text is bottom-anchored
        const numLines = wrappedText.split('\n').length;
        const extraLines = numLines - 1;
        const adjustedY = style.positionY + (extraLines * lineHeight);

        return `                            <title ref="r2" lane="1" offset="${offset}" name="${escapeXml(sub.text)}" duration="${duration}" start="3600s">
                                <param name="Position" key="9999/999166631/999166633/1/100/101" value="0 ${adjustedY}"/>
                                <text>
                                    <text-style ref="${tsId}">${escapeXml(wrappedText)}</text-style>
                                </text>
                                <text-style-def id="${tsId}">
                                    <text-style font="${escapeXml(style.fontFamily)}" fontSize="${style.fontSize}" fontFace="${style.bold ? 'Bold' : 'Regular'}" fontColor="${fcpColor}" bold="${style.bold ? '1' : '0'}" italic="${style.italic ? '1' : '0'}" alignment="${style.alignment}"${shadowToFcpAttrs(style.shadow)}/>
                                </text-style-def>
                            </title>`;
    }).join('\n');

    // Basic Title UID — FCP built-in template (three-dot prefix is FCPXML convention)
    const basicTitleUid = '.../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti';

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.11">
    <resources>
        <format id="r1" name="${videoFormat.fcpName}" frameDuration="${videoFormat.frameDuration}" width="${videoFormat.width}" height="${videoFormat.height}" colorSpace="1-1-1 (Rec. 709)"/>
        <effect id="r2" name="Basic Title" uid="${basicTitleUid}"/>
    </resources>
    <library>
        <event name="${escapeXml(projectName)}">
            <project name="${escapeXml(projectName)}">
                <sequence format="r1" duration="${totalDuration}" tcStart="0s" tcFormat="NDF">
                    <spine>
                        <gap name="Gap" offset="0/${fps}s" duration="${totalDuration}" start="3600s">
${titleElements}
                        </gap>
                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>`;
}
