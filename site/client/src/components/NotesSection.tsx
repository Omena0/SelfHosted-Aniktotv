import React, { useEffect, useState } from 'react';
import { FileText, Edit3, Save, X, Eye, Plus, Check, Link as LinkIcon, Bold, Italic, List, Heading, Quote, Code } from 'lucide-react';
import { api } from '../lib/api';
import { MarkdownViewer } from './MarkdownViewer';

interface NotesSectionProps {
  slug: string;
}

export const NotesSection: React.FC<NotesSectionProps> = ({ slug }) => {
  const [notes, setNotes] = useState<string>('');
  const [exists, setExists] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editTab, setEditTab] = useState<'write' | 'preview'>('write');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const fetchNotes = async () => {
      try {
        setLoading(true);
        const data = await api.getNotes(slug);
        if (isMounted) {
          setNotes(data.notes || '');
          setExists(data.exists);
        }
      } catch (err) {
        console.error('Failed to load notes.md:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchNotes();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.saveNotes(slug, notes);
      setExists(true);
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save notes.md:', err);
      alert('Failed to save notes.md to disk.');
    } finally {
      setSaving(false);
    }
  };

  const handleInsertToolbar = (prefix: string, suffix: string = '') => {
    const textarea = document.getElementById('notes-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = notes.substring(start, end);
    const replacement = prefix + (selectedText || 'text') + suffix;

    const newNotes = notes.substring(0, start) + replacement + notes.substring(end);
    setNotes(newNotes);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 50);
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-[#142030] border border-white/[0.04] p-6 space-y-4 animate-pulse">
        <div className="h-6 w-40 bg-[#20334d] rounded" />
        <div className="h-32 bg-[#20334d]/50 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#142030] border border-white/[0.04] p-6 space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-2.5">
          <FileText className="w-5 h-5 text-[#209cee]" />
          <h2 className="text-lg font-bold text-white font-archivo">
            Personal Notes
          </h2>
          <span className="px-2 py-0.5 rounded bg-[#209cee]/10 border border-[#209cee]/20 text-[#209cee] text-[11px] font-mono font-bold">
            notes.md
          </span>
          {saveSuccess && (
            <span className="px-2.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30 text-xs font-bold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Saved to disk!
            </span>
          )}
        </div>

        {/* Action Button: Edit / Save / Create */}
        {!isEditing ? (
          <button
            onClick={() => {
              setIsEditing(true);
              setEditTab('write');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#20334d] hover:bg-[#209cee] hover:text-white text-slate-200 text-xs font-bold gpu-trans border border-white/[0.06] self-start sm:self-auto"
          >
            {exists && notes.trim() ? (
              <>
                <Edit3 className="w-3.5 h-3.5" /> Edit notes.md
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" /> Add notes.md
              </>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#20334d] hover:bg-[#1c2d44] text-slate-300 text-xs font-bold gpu-trans"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#209cee] hover:bg-[#3caedc] text-white text-xs font-bold gpu-trans shadow disabled:opacity-50"
            >
              <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
              {saving ? 'Saving...' : 'Save Notes'}
            </button>
          </div>
        )}
      </div>

      {/* Editor or Viewer Body */}
      {isEditing ? (
        <div className="space-y-3">
          {/* Editor Header Toolbar & Write/Preview Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0b1622] p-2 rounded-lg border border-white/[0.04]">
            {/* Formatting Toolbar */}
            <div className="flex flex-wrap items-center gap-1 text-slate-400 text-xs">
              <button
                type="button"
                onClick={() => handleInsertToolbar('# ')}
                className="p-1.5 rounded hover:bg-[#142030] hover:text-white"
                title="Header 1 (# )"
              >
                <Heading className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleInsertToolbar('**', '**')}
                className="p-1.5 rounded hover:bg-[#142030] hover:text-white"
                title="Bold (**text**)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleInsertToolbar('*', '*')}
                className="p-1.5 rounded hover:bg-[#142030] hover:text-white"
                title="Italic (*text*)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleInsertToolbar('- ')}
                className="p-1.5 rounded hover:bg-[#142030] hover:text-white"
                title="Unordered List (- )"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleInsertToolbar('> ')}
                className="p-1.5 rounded hover:bg-[#142030] hover:text-white"
                title="Blockquote (> )"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleInsertToolbar('`', '`')}
                className="p-1.5 rounded hover:bg-[#142030] hover:text-white"
                title="Inline Code (`code`)"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleInsertToolbar('[', '](https://)')}
                className="p-1.5 rounded hover:bg-[#142030] hover:text-white"
                title="Link ([title](url))"
              >
                <LinkIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Write / Preview Tab switcher */}
            <div className="flex items-center bg-[#142030] p-0.5 rounded border border-white/[0.04] text-xs font-bold">
              <button
                type="button"
                onClick={() => setEditTab('write')}
                className={`px-3 py-1 rounded ${
                  editTab === 'write' ? 'bg-[#209cee] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setEditTab('preview')}
                className={`px-3 py-1 rounded flex items-center gap-1 ${
                  editTab === 'preview' ? 'bg-[#209cee] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3 h-3" /> Preview
              </button>
            </div>
          </div>

          {/* Write Mode Textarea */}
          {editTab === 'write' ? (
            <textarea
              id="notes-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Write your personal notes, reviews, ratings, or chapter details in Markdown format..."
              className="w-full h-80 bg-[#081019] text-slate-200 border border-white/[0.08] rounded-lg p-4 font-mono text-xs focus:outline-none focus:border-[#209cee] leading-relaxed resize-y scrollbar-thin"
              autoFocus
            />
          ) : (
            <div className="p-4 min-h-60 rounded-lg bg-[#081019] border border-white/[0.08]">
              <MarkdownViewer content={notes} />
            </div>
          )}
        </div>
      ) : (
        /* View Mode */
        <div>
          {notes && notes.trim() ? (
            <div className="p-4 sm:p-5 rounded-lg bg-[#0b1622]/80 border border-white/[0.04]">
              <MarkdownViewer content={notes} />
            </div>
          ) : (
            <div className="p-8 rounded-lg bg-[#0b1622]/40 border border-dashed border-white/[0.08] text-center space-y-3">
              <FileText className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs text-slate-400">
                No personal <code className="text-[#209cee]">notes.md</code> file exists for this anime title yet.
              </p>
              <button
                onClick={() => {
                  setIsEditing(true);
                  setEditTab('write');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#209cee] hover:bg-[#3caedc] text-white text-xs font-bold gpu-trans"
              >
                <Plus className="w-3.5 h-3.5" /> Create notes.md
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
