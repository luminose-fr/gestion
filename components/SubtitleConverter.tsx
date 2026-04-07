import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Upload, Download, FileText, Eye, ChevronDown, ChevronUp, Scissors, Merge, RotateCcw, Sparkles, Cpu, Zap, DollarSign, X, Loader2 } from 'lucide-react';
import {
    parseSrt, regroupSubtitles, generateFcpxml, wrapText,
    DEFAULT_STYLE, VIDEO_FORMATS,
    type SrtBlock, type SubtitleBlock, type SubtitleStyle, type ShadowStyle, type VideoFormat,
} from '../services/subtitleService';
import { AIModel } from '../types';
import { INTERNAL_MODELS, isOneMinModel } from '../ai/actions';
import * as GeminiService from '../services/geminiService';
import * as OneMinService from '../services/oneMinService';

const FONT_OPTIONS = [
    'Futura', 'Helvetica Neue', 'Arial', 'Avenir', 'Montserrat',
    'SF Pro Display', 'Roboto', 'Open Sans', 'Lato', 'Inter',
];

// ── Icons ───────────────────────────────────────────────────────────

const IconH = () => (
    <svg viewBox="0 0 24 16" className="w-7 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="22" height="14" rx="2" />
        <line x1="6" y1="11" x2="18" y2="11" strokeWidth="1" opacity="0.4" />
    </svg>
);
const IconV = () => (
    <svg viewBox="0 0 16 24" className="w-4 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="14" height="22" rx="2" />
        <line x1="4" y1="19" x2="12" y2="19" strokeWidth="1" opacity="0.4" />
    </svg>
);

// ── Helpers ─────────────────────────────────────────────────────────

function reindex(subs: SubtitleBlock[]): SubtitleBlock[] { return subs.map((s, i) => ({ ...s, index: i + 1 })); }

function splitAtChar(sub: SubtitleBlock, charPos: number): [SubtitleBlock, SubtitleBlock] {
    const before = sub.text.slice(0, charPos).trimEnd();
    const after = sub.text.slice(charPos).trimStart();
    if (!before || !after) return [sub, { ...sub, text: '', startMs: sub.endMs, endMs: sub.endMs }];
    const ratio = before.length / (before.length + after.length);
    const splitMs = sub.startMs + Math.round((sub.endMs - sub.startMs) * ratio);
    return [{ ...sub, text: before, endMs: splitMs }, { ...sub, text: after, startMs: splitMs, endMs: sub.endMs }];
}

function nearestWordBoundary(text: string, charPos: number): number {
    if (text[charPos] === ' ') return charPos;
    let left = charPos, right = charPos;
    while (left > 0 && text[left] !== ' ') left--;
    while (right < text.length && text[right] !== ' ') right++;
    if (left === 0 && text[0] !== ' ') return right < text.length ? right : charPos;
    if (right >= text.length) return left;
    return (charPos - left) <= (right - charPos) ? left : right;
}

// ── Preview component ───────────────────────────────────────────────

const SubtitlePreview: React.FC<{ text: string; style: SubtitleStyle; videoFormat: VideoFormat }> = ({ text, style, videoFormat }) => {
    const isVertical = videoFormat.height > videoFormat.width;
    const aspect = videoFormat.width / videoFormat.height;

    // Scale factor: fit the preview to a reasonable size
    const previewHeight = isVertical ? 280 : 180;
    const previewWidth = Math.round(previewHeight * aspect);
    const scale = previewHeight / videoFormat.height;

    const wrapped = wrapText(text, style.maxCharsPerLine);
    const lines = wrapped.split('\n');
    const fontSize = Math.max(8, Math.round(style.fontSize * scale));
    const lineHeight = fontSize * 1.3;

    // Position: FCP Y=0 is center. Negative = bottom. Convert to CSS bottom offset.
    // FCP coordinate range is roughly -height/2 to +height/2
    const centerY = previewHeight / 2;
    // positionY in FCP: positive = up from center, negative = down from center
    // For bottom-anchored multi-line: we place the LAST line at positionY, others stack above
    const baseFromCenter = style.positionY * scale;
    const bottomOfText = centerY - baseFromCenter; // distance from top
    const totalTextHeight = lines.length * lineHeight;
    const topOfText = bottomOfText - totalTextHeight;

    return (
        <div
            className="relative overflow-hidden rounded-lg mx-auto"
            style={{
                width: previewWidth,
                height: previewHeight,
                backgroundColor: '#1a1a1a',
            }}
        >
            {/* Subtitle text */}
            <div
                className="absolute left-0 right-0 px-1"
                style={{
                    top: topOfText,
                    textAlign: style.alignment,
                    fontFamily: style.fontFamily,
                    fontSize: `${fontSize}px`,
                    lineHeight: `${lineHeight}px`,
                    fontWeight: style.bold ? 'bold' : 'normal',
                    fontStyle: style.italic ? 'italic' : 'normal',
                    color: style.fontColor,
                    whiteSpace: 'pre-line',
                    textShadow: style.shadow.enabled
                        ? (() => {
                            const d = style.shadow.distance * scale;
                            const a = style.shadow.angle * Math.PI / 180;
                            const sx = (d * Math.cos(a)).toFixed(1);
                            const sy = (-d * Math.sin(a)).toFixed(1); // CSS Y is inverted
                            const blur = (style.shadow.blur * scale).toFixed(1);
                            const r = parseInt(style.shadow.color.slice(1, 3), 16);
                            const g = parseInt(style.shadow.color.slice(3, 5), 16);
                            const b = parseInt(style.shadow.color.slice(5, 7), 16);
                            return `${sx}px ${sy}px ${blur}px rgba(${r},${g},${b},${style.shadow.opacity / 100})`;
                        })()
                        : 'none',
                }}
            >
                {wrapped}
            </div>
        </div>
    );
};

// ── Main component ──────────────────────────────────────────────────

interface SubtitleConverterProps {
    aiModels?: AIModel[];
}

const SubtitleConverter: React.FC<SubtitleConverterProps> = ({ aiModels = [] }) => {
    const [srtContent, setSrtContent] = useState<string | null>(null);
    const [fileName, setFileName] = useState('');
    const [srtBlocks, setSrtBlocks] = useState<SrtBlock[]>([]);
    const [subtitles, setSubtitles] = useState<SubtitleBlock[]>([]);
    const [wordsPerBlock, setWordsPerBlock] = useState(4);
    const [style, setStyle] = useState<SubtitleStyle>({ ...DEFAULT_STYLE });
    const [videoFormat, setVideoFormat] = useState<VideoFormat>(VIDEO_FORMATS[1]);
    const [showPreview, setShowPreview] = useState(true);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [hasManualEdits, setHasManualEdits] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [showAIModal, setShowAIModal] = useState(false);
    const [aiSelectedModel, setAiSelectedModel] = useState(INTERNAL_MODELS.FAST);
    const [aiLoading, setAiLoading] = useState(false);
    const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
    const dragCounter = useRef(0);

    const previewText = useMemo(() => {
        if (subtitles.length === 0) return 'Aperçu du sous-titre';
        return subtitles[Math.min(previewIndex, subtitles.length - 1)].text;
    }, [subtitles, previewIndex]);

    // ── File handling ───────────────────────────────────────────────

    const processFile = useCallback((file: File) => {
        if (!file.name.toLowerCase().endsWith('.srt')) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            setSrtContent(text);
            const blocks = parseSrt(text);
            setSrtBlocks(blocks);
            setSubtitles(regroupSubtitles(blocks, wordsPerBlock));
            setHasManualEdits(false);
            setEditingIndex(null);
            setPreviewIndex(0);
        };
        reader.readAsText(file);
    }, [wordsPerBlock]);

    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) processFile(f); }, [processFile]);
    const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setIsDragging(true); }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }, []);
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
    const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0; const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }, [processFile]);

    // ── Settings ────────────────────────────────────────────────────

    const handleWordsChange = useCallback((n: number) => { setWordsPerBlock(n); if (srtBlocks.length > 0) { setSubtitles(regroupSubtitles(srtBlocks, n)); setHasManualEdits(false); setEditingIndex(null); } }, [srtBlocks]);
    const handleReset = useCallback(() => { if (srtBlocks.length > 0) { setSubtitles(regroupSubtitles(srtBlocks, wordsPerBlock)); setHasManualEdits(false); setEditingIndex(null); } }, [srtBlocks, wordsPerBlock]);
    const handleStyleChange = useCallback(<K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) => { setStyle(prev => ({ ...prev, [key]: value })); }, []);
    const handleShadowChange = useCallback(<K extends keyof ShadowStyle>(key: K, value: ShadowStyle[K]) => { setStyle(prev => ({ ...prev, shadow: { ...prev.shadow, [key]: value } })); }, []);

    // ── AI Smart Splitting ─────────────────────────────────────────
    const aiGroupedModels = useMemo(() => {
        const internal = { id: 'internal-fast', name: 'Gemini Flash', apiCode: INTERNAL_MODELS.FAST, provider: 'Google (Interne)', cost: 'low' as const, isInternal: true };
        const all: any[] = [internal, ...aiModels];
        const groups: Record<string, any[]> = {};
        all.forEach(m => { const p = m.provider?.trim() || 'Autres'; if (!groups[p]) groups[p] = []; groups[p].push(m); });
        return groups;
    }, [aiModels]);

    const handleAISmartSplit = useCallback(async () => {
        if (srtBlocks.length === 0) return;
        setAiLoading(true);
        try {
            // Build the full text with original timing info
            const fullText = srtBlocks.map(b => b.text).join(' ');
            const prompt = `Tu es un assistant spécialisé dans le découpage de sous-titres pour vidéo.

Voici une transcription complète d'une vidéo :
"""
${fullText}
"""

Découpe ce texte en blocs de sous-titres en respectant ces règles :
1. Chaque bloc doit contenir environ ${wordsPerBlock} mots (entre ${Math.max(1, wordsPerBlock - 1)} et ${wordsPerBlock + 2} mots).
2. Ne coupe JAMAIS au milieu d'une expression, d'un groupe nominal ou d'un verbe composé.
3. Respecte la ponctuation : une virgule, un point, un point d'exclamation ou d'interrogation sont des endroits naturels de coupure.
4. Privilégie les coupures aux frontières de propositions (après "que", "qui", "et", "mais", "car", "donc", "or", "ni", etc.).
5. Chaque bloc doit être lisible seul et avoir du sens.
6. Conserve le texte EXACTEMENT tel quel, sans corriger ni modifier les mots.

Réponds UNIQUEMENT avec un JSON valide au format suivant (tableau de strings) :
["bloc 1 texte", "bloc 2 texte", "bloc 3 texte", ...]

Chaque string est le texte d'un sous-titre. La concaténation de tous les blocs doit redonner le texte original complet.`;

            let responseText: string;
            if (isOneMinModel(aiSelectedModel, aiModels)) {
                responseText = await OneMinService.generateContent({ model: aiSelectedModel, prompt });
            } else {
                responseText = await GeminiService.generateContent({
                    model: aiSelectedModel,
                    prompt,
                    generationConfig: { response_mime_type: 'application/json' },
                });
            }

            // Parse the JSON array
            const cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
            const blocks: string[] = JSON.parse(cleaned);

            if (!Array.isArray(blocks) || blocks.length === 0) throw new Error('Réponse IA invalide');

            // Redistribute timing across AI-split blocks
            const allWords: { word: string; startMs: number; endMs: number }[] = [];
            for (const block of srtBlocks) {
                const words = block.text.split(/\s+/).filter(w => w.length > 0);
                if (words.length === 0) continue;
                const dur = block.endMs - block.startMs;
                const totalChars = words.reduce((s, w) => s + w.length, 0);
                let t = block.startMs;
                words.forEach((w, i) => {
                    const wd = Math.round(dur * (w.length / totalChars));
                    const end = i === words.length - 1 ? block.endMs : t + wd;
                    allWords.push({ word: w, startMs: t, endMs: end });
                    t = end;
                });
            }

            // Match AI blocks to timed words
            const newSubs: SubtitleBlock[] = [];
            let wordIdx = 0;
            blocks.forEach((blockText, i) => {
                const bWords = blockText.trim().split(/\s+/).filter(w => w.length > 0);
                const startWord = wordIdx;
                const endWord = Math.min(wordIdx + bWords.length - 1, allWords.length - 1);
                if (startWord < allWords.length) {
                    newSubs.push({
                        index: i + 1,
                        startMs: allWords[startWord].startMs,
                        endMs: allWords[Math.min(endWord, allWords.length - 1)].endMs,
                        text: blockText.trim(),
                    });
                }
                wordIdx += bWords.length;
            });

            setSubtitles(newSubs);
            setHasManualEdits(true);
            setShowAIModal(false);
            setPreviewIndex(0);
        } catch (err: any) {
            console.error('AI Smart Split error:', err);
            alert(`Erreur IA : ${err.message}`);
        } finally {
            setAiLoading(false);
        }
    }, [srtBlocks, wordsPerBlock, aiSelectedModel, aiModels]);

    // ── Edit, Split, Merge ──────────────────────────────────────────

    const handleTextChange = useCallback((index: number, newText: string) => {
        setSubtitles(prev => { const updated = [...prev]; const idx = updated.findIndex(s => s.index === index); if (idx !== -1) updated[idx] = { ...updated[idx], text: newText }; return updated; });
        setHasManualEdits(true);
    }, []);

    const handleSplit = useCallback((index: number) => {
        const input = inputRefs.current.get(index); const sub = subtitles.find(s => s.index === index); if (!sub) return;
        let charPos = input && editingIndex === index && input.selectionStart !== null ? nearestWordBoundary(sub.text, input.selectionStart) : nearestWordBoundary(sub.text, Math.floor(sub.text.length / 2));
        if (charPos <= 0 || charPos >= sub.text.length) return;
        const [a, b] = splitAtChar(sub, charPos); if (!a.text || !b.text) return;
        setSubtitles(prev => { const idx = prev.findIndex(s => s.index === index); if (idx === -1) return prev; const u = [...prev]; u.splice(idx, 1, a, b); return reindex(u); });
        setHasManualEdits(true);
    }, [subtitles, editingIndex]);

    const handleMerge = useCallback((index: number) => {
        setSubtitles(prev => { const idx = prev.findIndex(s => s.index === index); if (idx === -1 || idx >= prev.length - 1) return prev; const c = prev[idx]; const n = prev[idx + 1]; const u = [...prev]; u.splice(idx, 2, { index: c.index, startMs: c.startMs, endMs: n.endMs, text: c.text + ' ' + n.text }); return reindex(u); });
        setHasManualEdits(true);
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, sub: SubtitleBlock) => {
        const input = e.currentTarget;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (sub.text.split(/\s+/).length >= 2 && input.selectionStart !== null) {
                const cp = nearestWordBoundary(sub.text, input.selectionStart);
                if (cp > 0 && cp < sub.text.length) {
                    const [a, b] = splitAtChar(sub, cp);
                    if (a.text && b.text) { setSubtitles(prev => { const idx = prev.findIndex(s => s.index === sub.index); if (idx === -1) return prev; const u = [...prev]; u.splice(idx, 1, a, b); return reindex(u); }); setHasManualEdits(true); setTimeout(() => { const ni = inputRefs.current.get(sub.index + 1); if (ni) { ni.focus(); ni.setSelectionRange(0, 0); } }, 20); }
                }
            }
        }
        if (e.key === 'Backspace' && input.selectionStart === 0 && input.selectionEnd === 0) {
            if (sub.index < 2) return; e.preventDefault();
            setSubtitles(prev => { const idx = prev.findIndex(s => s.index === sub.index); if (idx <= 0) return prev; const ps = prev[idx - 1]; const cp = ps.text.length; const u = [...prev]; u.splice(idx - 1, 2, { index: ps.index, startMs: ps.startMs, endMs: sub.endMs, text: ps.text + ' ' + sub.text }); const r = reindex(u); setTimeout(() => { const mi = inputRefs.current.get(ps.index); if (mi) { mi.focus(); mi.setSelectionRange(cp, cp); } }, 20); return r; });
            setHasManualEdits(true);
        }
        if (e.key === 'Delete' && input.selectionStart === sub.text.length && input.selectionEnd === sub.text.length) {
            const ci = subtitles.findIndex(s => s.index === sub.index); if (ci === -1 || ci >= subtitles.length - 1) return; e.preventDefault(); const cp = sub.text.length;
            setSubtitles(prev => { const idx = prev.findIndex(s => s.index === sub.index); if (idx === -1 || idx >= prev.length - 1) return prev; const n = prev[idx + 1]; const u = [...prev]; u.splice(idx, 2, { index: sub.index, startMs: sub.startMs, endMs: n.endMs, text: sub.text + ' ' + n.text }); const r = reindex(u); setTimeout(() => { const mi = inputRefs.current.get(sub.index); if (mi) { mi.focus(); mi.setSelectionRange(cp, cp); } }, 20); return r; });
            setHasManualEdits(true);
        }
        if (e.key === 'ArrowUp') { const ci = subtitles.findIndex(s => s.index === sub.index); if (ci > 0) { e.preventDefault(); const ps = subtitles[ci - 1]; const pos = Math.min(input.selectionStart ?? 0, ps.text.length); const pi = inputRefs.current.get(ps.index); if (pi) { pi.focus(); pi.setSelectionRange(pos, pos); } } }
        if (e.key === 'ArrowDown') { const ci = subtitles.findIndex(s => s.index === sub.index); if (ci < subtitles.length - 1) { e.preventDefault(); const ns = subtitles[ci + 1]; const pos = Math.min(input.selectionStart ?? 0, ns.text.length); const ni = inputRefs.current.get(ns.index); if (ni) { ni.focus(); ni.setSelectionRange(pos, pos); } } }
    }, [subtitles]);

    // ── Download ────────────────────────────────────────────────────

    const handleDownload = useCallback(() => {
        if (subtitles.length === 0) return;
        const pn = fileName.replace(/\.srt$/i, '') || 'Sous-titres';
        const xml = generateFcpxml(subtitles, style, videoFormat, pn);
        const blob = new Blob([xml], { type: 'application/xml' }); const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${pn}.fcpxml`; a.click(); URL.revokeObjectURL(url);
    }, [subtitles, style, videoFormat, fileName]);

    const fmtTime = (ms: number) => { const s = Math.floor(ms / 1000); const m = Math.floor(s / 60); const sec = s % 60; const millis = ms % 1000; return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0').slice(0, 2)}`; };

    // ── Shared input styles ─────────────────────────────────────────
    const labelCls = "text-xs text-brand-main/60 dark:text-dark-text/60";
    const inputCls = "mt-1 w-full text-sm bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg px-3 py-2 text-brand-main dark:text-white";
    const toggleCls = (on: boolean) => `px-3 py-2 text-sm font-bold rounded-lg border-2 transition-colors ${on ? 'bg-brand-main text-white border-brand-main dark:bg-white dark:text-brand-main dark:border-white' : 'border-brand-border dark:border-dark-sec-border text-brand-main/30 dark:text-dark-text/30'}`;
    const fmtBtnCls = (on: boolean) => `flex items-center justify-center w-11 h-11 rounded-lg border-2 transition-all ${on ? 'border-brand-main dark:border-white text-brand-main dark:text-white bg-brand-light dark:bg-dark-sec-bg' : 'border-brand-border dark:border-dark-sec-border text-brand-main/30 dark:text-dark-text/30 hover:border-brand-main/50 dark:hover:border-white/50 hover:text-brand-main/60'}`;

    return (
        <div className="mx-auto space-y-6" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>

            {/* Upload zone */}
            {!srtContent || isDragging ? (
                <label className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${isDragging ? 'border-brand-main dark:border-white bg-brand-light dark:bg-dark-sec-bg scale-[1.01]' : 'border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface hover:bg-brand-light dark:hover:bg-dark-sec-bg'}`}>
                    <Upload className={`w-12 h-12 mb-4 transition-colors ${isDragging ? 'text-brand-main dark:text-white' : 'text-brand-main/30 dark:text-dark-text/30'}`} />
                    <span className={`text-sm font-medium transition-colors ${isDragging ? 'text-brand-main dark:text-white' : 'text-brand-main/70 dark:text-dark-text/70'}`}>
                        {isDragging ? 'Déposez le fichier .srt ici' : 'Glissez un fichier .srt ou cliquez pour sélectionner'}
                    </span>
                    <span className="text-xs text-brand-main/40 dark:text-dark-text/40 mt-1">Fichier généré par WhisperTranscript</span>
                    <input type="file" accept=".srt" className="hidden" onChange={handleFileUpload} />
                </label>
            ) : (
                <>
                    {/* File info bar */}
                    <div className="flex items-center justify-between bg-white dark:bg-dark-surface rounded-xl p-4 border border-brand-border dark:border-dark-sec-border">
                        <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-brand-main dark:text-dark-text" />
                            <div>
                                <p className="text-sm font-semibold text-brand-main dark:text-white">{fileName}</p>
                                <p className="text-xs text-brand-main/50 dark:text-dark-text/50">
                                    {srtBlocks.length} blocs SRT → {subtitles.length} sous-titres
                                    {hasManualEdits && <span className="ml-1 text-amber-500">(modifié)</span>}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowAIModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors" title="Découpage intelligent par IA">
                                <Sparkles className="w-3.5 h-3.5" /> Découpage IA
                            </button>
                            {hasManualEdits && (
                                <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-brand-border dark:border-dark-sec-border text-brand-main/70 dark:text-dark-text/70 hover:bg-brand-light dark:hover:bg-dark-sec-bg transition-colors" title="Réinitialiser">
                                    <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
                                </button>
                            )}
                            <label className="px-3 py-1.5 text-xs font-medium rounded-lg border border-brand-border dark:border-dark-sec-border text-brand-main/70 dark:text-dark-text/70 hover:bg-brand-light dark:hover:bg-dark-sec-bg transition-colors cursor-pointer">
                                Remplacer <input type="file" accept=".srt" className="hidden" onChange={handleFileUpload} />
                            </label>
                            <button onClick={handleDownload} disabled={subtitles.length === 0} className="flex items-center gap-2 px-4 py-1.5 bg-brand-main text-white rounded-lg text-sm font-medium hover:bg-brand-hover transition-colors disabled:opacity-50 dark:bg-white dark:text-brand-main dark:hover:bg-gray-100">
                                <Download className="w-4 h-4" /> Télécharger .fcpxml
                            </button>
                        </div>
                    </div>

                    {/* ═══ Two-column: Réglages | Style ═══ */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        {/* ── Left: Réglages ── */}
                        <div className="bg-white dark:bg-dark-surface rounded-xl p-4 border border-brand-border dark:border-dark-sec-border space-y-4">
                            <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider">Réglages</div>

                            <div>
                                <label className={labelCls}>Mots par sous-titre</label>
                                <div className="flex items-center gap-3 mt-1.5">
                                    <input type="range" min={1} max={10} value={wordsPerBlock} onChange={e => handleWordsChange(parseInt(e.target.value))} className="flex-1 accent-brand-main dark:accent-white" />
                                    <span className="text-xl font-bold text-brand-main dark:text-white w-6 text-center">{wordsPerBlock}</span>
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Format vidéo</label>
                                <div className="flex items-center gap-2 mt-1.5">
                                    {VIDEO_FORMATS.map(f => (
                                        <button key={f.id} onClick={() => setVideoFormat(f)} title={f.label} className={fmtBtnCls(videoFormat.id === f.id)}>
                                            {f.height > f.width ? <IconV /> : <IconH />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Retour à la ligne ({style.maxCharsPerLine === 0 ? 'off' : style.maxCharsPerLine + ' car.'})</label>
                                <input type="range" min={0} max={60} value={style.maxCharsPerLine} onChange={e => handleStyleChange('maxCharsPerLine', parseInt(e.target.value))} className="mt-1 w-full accent-brand-main dark:accent-white" />
                                <div className="flex justify-between text-[10px] text-brand-main/40 dark:text-dark-text/40"><span>Désactivé</span><span>Long</span></div>
                            </div>

                            <div>
                                <label className={labelCls}>Position verticale ({style.positionY})</label>
                                <input type="range" min={-500} max={500} value={style.positionY} onChange={e => handleStyleChange('positionY', parseInt(e.target.value))} className="mt-1 w-full accent-brand-main dark:accent-white" />
                                <div className="flex justify-between text-[10px] text-brand-main/40 dark:text-dark-text/40"><span>Bas</span><span>Centre</span><span>Haut</span></div>
                            </div>
                        </div>

                        {/* ── Right: Style ── */}
                        <div className="bg-white dark:bg-dark-surface rounded-xl p-4 border border-brand-border dark:border-dark-sec-border space-y-4">
                            <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider">Style des sous-titres</div>

                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className={labelCls}>Police</label>
                                    <select value={style.fontFamily} onChange={e => handleStyleChange('fontFamily', e.target.value)} className={inputCls}>
                                        {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div className="w-20">
                                    <label className={labelCls}>Taille</label>
                                    <input type="number" min={12} max={200} value={style.fontSize} onChange={e => handleStyleChange('fontSize', parseInt(e.target.value) || 36)} className={inputCls} />
                                </div>
                            </div>

                            <div className="flex items-end gap-3">
                                <div>
                                    <label className={labelCls}>Couleur</label>
                                    <div className="mt-1 flex items-center gap-2">
                                        <input type="color" value={style.fontColor} onChange={e => handleStyleChange('fontColor', e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border border-brand-border dark:border-dark-sec-border" />
                                        <span className="text-[10px] font-mono text-brand-main/40 dark:text-dark-text/40">{style.fontColor}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Style</label>
                                    <div className="flex gap-1.5 mt-1">
                                        <button onClick={() => handleStyleChange('bold', !style.bold)} className={toggleCls(style.bold)}>B</button>
                                        <button onClick={() => handleStyleChange('italic', !style.italic)} className={`${toggleCls(style.italic)} italic`}>I</button>
                                    </div>
                                </div>
                            </div>

                            {/* Shadow */}
                            <div className="border-t border-brand-border dark:border-dark-sec-border pt-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className={labelCls}>Ombre portée</label>
                                    <button
                                        onClick={() => handleShadowChange('enabled', !style.shadow.enabled)}
                                        className={`relative w-9 h-5 rounded-full transition-colors ${style.shadow.enabled ? 'bg-brand-main dark:bg-white' : 'bg-gray-300 dark:bg-dark-sec-border'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-dark-bg transition-transform ${style.shadow.enabled ? 'translate-x-4' : ''}`} />
                                    </button>
                                </div>
                                {style.shadow.enabled && (
                                    <>
                                        <div className="flex items-end gap-3">
                                            <div>
                                                <label className={labelCls}>Couleur</label>
                                                <div className="mt-1 flex items-center gap-2">
                                                    <input type="color" value={style.shadow.color} onChange={e => handleShadowChange('color', e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-brand-border dark:border-dark-sec-border" />
                                                    <span className="text-[10px] font-mono text-brand-main/40 dark:text-dark-text/40">{style.shadow.color}</span>
                                                </div>
                                            </div>
                                            <div className="flex-1">
                                                <label className={labelCls}>Opacité ({style.shadow.opacity}%)</label>
                                                <input type="range" min={0} max={100} value={style.shadow.opacity} onChange={e => handleShadowChange('opacity', parseInt(e.target.value))} className="mt-1 w-full accent-brand-main dark:accent-white" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <label className={labelCls}>Flou</label>
                                                <input type="number" min={0} max={50} value={style.shadow.blur} onChange={e => handleShadowChange('blur', parseFloat(e.target.value) || 0)} className={`${inputCls} !py-1.5 text-center`} />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Distance</label>
                                                <input type="number" min={0} max={50} step={0.5} value={style.shadow.distance} onChange={e => handleShadowChange('distance', parseFloat(e.target.value) || 0)} className={`${inputCls} !py-1.5 text-center`} />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Angle (°)</label>
                                                <input type="number" min={0} max={360} step={5} value={style.shadow.angle} onChange={e => handleShadowChange('angle', parseFloat(e.target.value) || 0)} className={`${inputCls} !py-1.5 text-center`} />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                        </div>
                    </div>

                    {/* ═══ Subtitle editor + Aperçu (two columns) ═══ */}
                    <div className="flex gap-4 items-start">
                        {/* Left: editor */}
                        <div className="flex-1 min-w-0 bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border">
                            <button onClick={() => setShowPreview(!showPreview)} className="w-full flex items-center justify-between p-4">
                                <div className="flex items-center gap-2">
                                    <Eye className="w-4 h-4 text-brand-main/50 dark:text-dark-text/50" />
                                    <span className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider">Sous-titres ({subtitles.length})</span>
                                </div>
                                {showPreview ? <ChevronUp className="w-4 h-4 text-brand-main/50 dark:text-dark-text/50" /> : <ChevronDown className="w-4 h-4 text-brand-main/50 dark:text-dark-text/50" />}
                            </button>
                            {showPreview && (
                                <div className="px-4 pb-4 border-t border-brand-border dark:border-dark-sec-border pt-2">
                                    <p className="text-[10px] text-brand-main/40 dark:text-dark-text/40 mb-2 px-2">
                                        Cliquez pour modifier. Entrée = couper. Retour arrière en début = fusionner. Suppr en fin = fusionner.
                                    </p>
                                    <div className="max-h-[32rem] overflow-y-auto space-y-0.5">
                                        {subtitles.map((sub, idx) => (
                                            <div key={`${sub.index}-${sub.startMs}`}
                                                className={`group flex items-center gap-2 py-1 px-2 rounded-lg transition-colors cursor-pointer ${editingIndex === sub.index ? 'bg-brand-light dark:bg-dark-sec-bg' : 'hover:bg-brand-light/50 dark:hover:bg-dark-sec-bg/50'}`}
                                                onClick={() => setPreviewIndex(idx)}
                                            >
                                                <span className="text-[10px] font-mono text-brand-main/30 dark:text-dark-text/30 w-14 shrink-0 text-right">{fmtTime(sub.startMs)}</span>
                                                <input
                                                    ref={el => { if (el) inputRefs.current.set(sub.index, el); }}
                                                    type="text" value={sub.text}
                                                    onChange={e => handleTextChange(sub.index, e.target.value)}
                                                    onFocus={() => { setEditingIndex(sub.index); setPreviewIndex(idx); }}
                                                    onBlur={() => setTimeout(() => setEditingIndex(prev => prev === sub.index ? null : prev), 150)}
                                                    onKeyDown={e => handleKeyDown(e, sub)}
                                                    className="flex-1 min-w-0 text-sm text-brand-main dark:text-white bg-transparent border-0 outline-none focus:bg-white dark:focus:bg-dark-bg focus:ring-1 focus:ring-brand-main/20 dark:focus:ring-white/20 rounded px-1.5 py-0.5 transition-all"
                                                />
                                                <span className="text-[10px] font-mono text-brand-main/30 dark:text-dark-text/30 w-14 shrink-0">{fmtTime(sub.endMs)}</span>
                                                <div className={`flex items-center gap-0.5 shrink-0 transition-opacity ${editingIndex === sub.index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                    <button onClick={() => handleSplit(sub.index)} disabled={sub.text.split(/\s+/).length < 2} className="p-1 rounded text-brand-main/40 hover:text-brand-main hover:bg-brand-light dark:text-dark-text/40 dark:hover:text-white dark:hover:bg-dark-bg transition-colors disabled:opacity-20 disabled:cursor-not-allowed" title="Couper"><Scissors className="w-3.5 h-3.5" /></button>
                                                    {idx < subtitles.length - 1 && (
                                                        <button onClick={() => handleMerge(sub.index)} className="p-1 rounded text-brand-main/40 hover:text-brand-main hover:bg-brand-light dark:text-dark-text/40 dark:hover:text-white dark:hover:bg-dark-bg transition-colors" title="Fusionner"><Merge className="w-3.5 h-3.5" /></button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right: sticky preview */}
                        <div className="hidden md:block sticky top-6 shrink-0">
                            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider">Aperçu</span>
                                    {subtitles.length > 1 && (
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))} disabled={previewIndex === 0} className="text-[10px] px-1.5 py-0.5 rounded text-brand-main/40 hover:text-brand-main dark:text-dark-text/40 dark:hover:text-white disabled:opacity-20">&larr;</button>
                                            <span className="text-[10px] text-brand-main/40 dark:text-dark-text/40 font-mono">{previewIndex + 1}/{subtitles.length}</span>
                                            <button onClick={() => setPreviewIndex(Math.min(subtitles.length - 1, previewIndex + 1))} disabled={previewIndex >= subtitles.length - 1} className="text-[10px] px-1.5 py-0.5 rounded text-brand-main/40 hover:text-brand-main dark:text-dark-text/40 dark:hover:text-white disabled:opacity-20">&rarr;</button>
                                        </div>
                                    )}
                                </div>
                                <SubtitlePreview text={previewText} style={style} videoFormat={videoFormat} />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ═══ AI Model Selection Modal ═══ */}
            {showAIModal && (
                <div className="fixed inset-0 z-80 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => !aiLoading && setShowAIModal(false)}>
                    <div className="bg-white dark:bg-dark-bg rounded-xl shadow-2xl border border-brand-border dark:border-dark-sec-border w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-brand-border dark:border-dark-sec-border">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-brand-main dark:text-white flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-purple-500" />
                                    Découpage intelligent
                                </h3>
                                <button onClick={() => !aiLoading && setShowAIModal(false)} className="p-1 rounded-lg hover:bg-brand-light dark:hover:bg-dark-sec-bg transition-colors">
                                    <X className="w-5 h-5 text-brand-main/50 dark:text-dark-text/50" />
                                </button>
                            </div>
                            <p className="text-xs text-brand-main/60 dark:text-dark-text/60 mt-2">
                                L'IA va redécouper les sous-titres en tenant compte de la ponctuation, du sens et d'environ <strong>{wordsPerBlock} mots</strong> par bloc.
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {Object.entries(aiGroupedModels).map(([provider, models]) => (
                                <div key={provider}>
                                    <div className="text-[10px] font-bold text-brand-main/40 dark:text-dark-text/40 uppercase mb-1.5 ml-1">{provider}</div>
                                    <div className="space-y-1.5">
                                        {models.map((model: any) => (
                                            <div
                                                key={model.apiCode}
                                                onClick={() => !aiLoading && setAiSelectedModel(model.apiCode || '')}
                                                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${
                                                    aiSelectedModel === model.apiCode
                                                        ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700 ring-1 ring-purple-300 dark:ring-purple-700'
                                                        : 'bg-white/50 dark:bg-dark-surface/50 border-transparent hover:bg-brand-light dark:hover:bg-dark-sec-bg'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    {model.isInternal ? <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500" /> : <Cpu className="w-4 h-4 text-brand-main/30 dark:text-dark-text/30" />}
                                                    <div>
                                                        <div className="text-sm font-semibold text-brand-main dark:text-white">{model.name}</div>
                                                        {model.isInternal && <span className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-1.5 py-0.5 rounded-sm">Recommandé</span>}
                                                    </div>
                                                </div>
                                                {model.cost && (() => {
                                                    const c = (model.cost || '').toLowerCase();
                                                    if (c.includes('low')) return <span className="text-green-500 text-[10px] font-bold"><DollarSign className="w-3 h-3 inline" /></span>;
                                                    if (c.includes('medium') || c === 'medium') return <span className="text-yellow-600 text-[10px] font-bold"><DollarSign className="w-3 h-3 inline" /><DollarSign className="w-3 h-3 inline" /></span>;
                                                    if (c.includes('high')) return <span className="text-orange-500 text-[10px] font-bold"><DollarSign className="w-3 h-3 inline" /><DollarSign className="w-3 h-3 inline" /><DollarSign className="w-3 h-3 inline" /></span>;
                                                    return null;
                                                })()}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 border-t border-brand-border dark:border-dark-sec-border flex justify-end gap-3">
                            <button onClick={() => setShowAIModal(false)} disabled={aiLoading} className="px-5 py-2 text-sm font-medium text-brand-main dark:text-dark-text hover:bg-brand-light dark:hover:bg-dark-sec-bg rounded-lg transition-colors disabled:opacity-50">
                                Annuler
                            </button>
                            <button
                                onClick={handleAISmartSplit}
                                disabled={aiLoading}
                                className="flex items-center gap-2 px-6 py-2 text-sm font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700 shadow-lg shadow-purple-600/20 transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0"
                            >
                                {aiLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Découpage en cours...</> : <><Sparkles className="w-4 h-4" /> Lancer le découpage</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubtitleConverter;
