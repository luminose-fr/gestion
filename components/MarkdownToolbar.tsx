import React from 'react';
import { Bold, Italic, List, Heading1, Heading2, Quote, Undo, Redo } from 'lucide-react';

interface MarkdownToolbarProps {
    className?: string;
}

export const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({ className = "" }) => {
    
    const applyFormat = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        // Le focus reste généralement sur l'élément éditable si on utilise onMouseDown avec preventDefault sur les boutons
    };

    const Button = ({ command, value, icon: Icon, title }: { command: string, value?: string, icon: any, title: string }) => (
        <button 
            onMouseDown={(e) => {
                e.preventDefault(); // Empêche la perte de focus de l'éditeur
                applyFormat(command, value);
            }}
            className="p-1.5 rounded hover:bg-brand-border dark:hover:bg-dark-sec-border text-brand-main dark:text-dark-text transition-colors"
            title={title}
        >
            <Icon className="w-4 h-4" />
        </button>
    );

    return (
        <div className={`flex items-center gap-1 p-2 border-b border-brand-border dark:border-dark-sec-border bg-brand-light/50 dark:bg-dark-bg/50 ${className}`}>
            <Button command="bold" icon={Bold} title="Gras" />
            <Button command="italic" icon={Italic} title="Italique" />
            
            <div className="w-px h-4 bg-brand-border dark:bg-dark-sec-border mx-1"></div>
            
            <Button command="formatBlock" value="H1" icon={Heading1} title="Grand Titre" />
            <Button command="formatBlock" value="H2" icon={Heading2} title="Titre Moyen" />
            
            <div className="w-px h-4 bg-brand-border dark:bg-dark-sec-border mx-1"></div>
            
            <Button command="insertUnorderedList" icon={List} title="Liste à puces" />
            <Button command="formatBlock" value="BLOCKQUOTE" icon={Quote} title="Citation" />

            <div className="flex-1"></div>
            
            <Button command="undo" icon={Undo} title="Annuler" />
            <Button command="redo" icon={Redo} title="Rétablir" />
        </div>
    );
};