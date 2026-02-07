import React, { useEffect, useRef, useState } from 'react';

interface RichTextareaProps {
    value: string;
    onChange: (newValue: string) => void;
    className?: string;
    placeholder?: string;
}

// --- PARSERS LÉGERS ---

// Convertit le Markdown basique (Notion-friendly) en HTML pour l'affichage
const markdownToHtml = (md: string): string => {
    if (!md) return "";
    let html = md
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Blocs
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    
    // Listes
    const lines = html.split('\n');
    let inList = false;
    let newLines = [];
    
    for (let line of lines) {
        if (line.trim().startsWith('- ')) {
            if (!inList) { newLines.push('<ul>'); inList = true; }
            newLines.push(`<li>${line.trim().substring(2)}</li>`);
        } else {
            if (inList) { newLines.push('</ul>'); inList = false; }
            // Preservation des sauts de ligne vides
            if (!line.match(/<\/?(h1|h2|blockquote)>/)) {
               if (line.trim() === '') newLines.push('<br>');
               else newLines.push(`<div>${line}</div>`);
            } else {
                newLines.push(line);
            }
        }
    }
    if (inList) newLines.push('</ul>');
    html = newLines.join('');

    // Inline
    html = html
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/_(.*?)_/g, '<i>$1</i>')
        .replace(/~(.*?)~/g, '<s>$1</s>')
        .replace(/`([^`]*)`/g, '<code>$1</code>');

    return html;
};

// Convertit le HTML de la div éditable en Markdown pour la sauvegarde
const htmlToMarkdown = (element: HTMLElement): string => {
    let md = '';
    
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            md += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const tag = el.tagName.toLowerCase();

            switch (tag) {
                case 'b':
                case 'strong':
                    md += '**';
                    el.childNodes.forEach(walk);
                    md += '**';
                    break;
                case 'i':
                case 'em':
                    md += '_';
                    el.childNodes.forEach(walk);
                    md += '_';
                    break;
                case 's':
                case 'strike':
                    md += '~';
                    el.childNodes.forEach(walk);
                    md += '~';
                    break;
                case 'code':
                    md += '`';
                    el.childNodes.forEach(walk);
                    md += '`';
                    break;
                case 'h1':
                    md += '\n# ';
                    el.childNodes.forEach(walk);
                    md += '\n';
                    break;
                case 'h2':
                    md += '\n## ';
                    el.childNodes.forEach(walk);
                    md += '\n';
                    break;
                case 'blockquote':
                    md += '\n> ';
                    el.childNodes.forEach(walk);
                    md += '\n';
                    break;
                case 'ul':
                    md += '\n';
                    el.childNodes.forEach(walk);
                    md += '\n';
                    break;
                case 'li':
                    md += '- ';
                    el.childNodes.forEach(walk);
                    md += '\n';
                    break;
                case 'div':
                case 'p':
                    if (md.length > 0 && !md.endsWith('\n')) md += '\n';
                    el.childNodes.forEach(walk);
                    break;
                case 'br':
                    md += '\n';
                    break;
                default:
                    el.childNodes.forEach(walk);
            }
        }
    };

    element.childNodes.forEach(walk);
    // On évite le trim() agressif qui empêche de taper des espaces à la fin,
    // mais on nettoie quand même les sauts de ligne multiples excessifs
    return md.replace(/\n{3,}/g, '\n\n');
};

export const RichTextarea = ({ value, onChange, className = "", placeholder }: RichTextareaProps) => {
    const editorRef = useRef<HTMLDivElement>(null);

    // Initialisation et sync externe
    useEffect(() => {
        if (editorRef.current) {
            const currentMD = htmlToMarkdown(editorRef.current);
            // Vérification du focus pour ne pas interrompre la saisie
            const isFocused = document.activeElement === editorRef.current;

            // On ne met à jour le HTML que si la valeur a changé de l'extérieur ET qu'on a pas le focus
            // (ou si le contenu est vide pour l'initialisation)
            if (value !== currentMD && !isFocused) {
                editorRef.current.innerHTML = markdownToHtml(value);
            }
        }
    }, [value]);

    const handleInput = () => {
        if (editorRef.current) {
            const md = htmlToMarkdown(editorRef.current);
            onChange(md);
        }
    };

    return (
        <div 
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            className={`
                outline-none overflow-y-auto whitespace-pre-wrap break-words 
                text-base md:text-lg leading-relaxed text-brand-main dark:text-white
                empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400
                [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:border-b [&_h1]:border-brand-border/50
                [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1
                [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-500
                [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1
                ${className}
            `}
            data-placeholder={placeholder}
            spellCheck={false}
        />
    );
};