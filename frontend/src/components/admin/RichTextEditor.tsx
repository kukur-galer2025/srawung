'use client';

import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Placeholder, CharacterCount } from '@tiptap/extensions';
import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * Image bawaan Tiptap (mode resize) hanya mengubah ukuran saat diseret: atribut `width`
 * dari tombol ukuran cepat — atau dari artikel yang dibuka ulang — tidak diterapkan ke
 * tampilan. Ekstensi ini menerapkannya saat gambar dimuat dan setiap kali atribut berubah.
 */
const ResizableImage = Image.extend({
  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    return (props) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = parent(props) as any;
      const img = (view.dom as HTMLElement).querySelector('img');
      const apply = (node: PMNode) => {
        if (!img) return;
        img.style.width = node.attrs.width ? `${node.attrs.width}px` : '';
        img.style.height = 'auto';
      };
      apply(props.node);
      const original = view.update?.bind(view);
      view.update = (node: PMNode, ...rest: unknown[]) => {
        const ok = original ? original(node, ...rest) : true;
        if (ok) apply(node);
        return ok;
      };
      return view;
    };
  },
});
import { promptDialog, toast } from '@/lib/dialog';

/*
 * Editor artikel WYSIWYG berbasis Tiptap (open source, MIT).
 * Hasilnya HTML; server tetap menyanitasi ulang sebelum disimpan & ditampilkan.
 */

const MAX_IMAGE_MB = 5;

async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('File harus berupa gambar.');
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`Ukuran gambar maksimal ${MAX_IMAGE_MB} MB.`);
  const fd = new FormData();
  fd.append('image', file);
  const res = await api.post('/admin/posts/images', fd);
  return res.url as string;
}

function ToolButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // jaga seleksi teks tetap aktif
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-30 ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px bg-slate-200" />;

function Toolbar({ editor, onPickImage, uploading }: { editor: Editor; onPickImage: () => void; uploading: boolean }) {
  const setLink = async () => {
    const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
    const url = await promptDialog({
      title: prev ? 'Ubah tautan' : 'Sisipkan tautan',
      inputLabel: 'Alamat (URL)',
      placeholder: 'https://… atau /buku/…',
      value: prev,
      inputType: 'text',
      denyText: prev ? 'Hapus tautan' : undefined,
      validate: (v) => (!v || /^(https?:\/\/|\/(?!\/)|mailto:)/i.test(v) ? null : 'Awali dengan https://, mailto:, atau / untuk halaman Srawung.'),
    });
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (url === '') chain.unsetLink().run();
    else chain.setLink({ href: url }).run();
  };

  const c = () => editor.chain().focus();

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur">
      <ToolButton label="Paragraf" active={editor.isActive('paragraph')} onClick={() => c().setParagraph().run()}>
        <Pilcrow className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Subjudul besar" active={editor.isActive('heading', { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Subjudul kecil" active={editor.isActive('heading', { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="h-4 w-4" />
      </ToolButton>
      <Divider />
      <ToolButton label="Tebal (Ctrl+B)" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Miring (Ctrl+I)" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Garis bawah (Ctrl+U)" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}>
        <UnderlineIcon className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Coret" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Tautan" active={editor.isActive('link')} onClick={setLink}>
        <Link2 className="h-4 w-4" />
      </ToolButton>
      <Divider />
      <ToolButton label="Daftar berpoin" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Daftar bernomor" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Kutipan" active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Blok kode" active={editor.isActive('codeBlock')} onClick={() => c().toggleCodeBlock().run()}>
        <Code2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Garis pemisah" onClick={() => c().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </ToolButton>
      <Divider />
      <ToolButton label="Sisipkan gambar" onClick={onPickImage} disabled={uploading}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      </ToolButton>
      <span className="ml-auto flex items-center gap-0.5">
        <ToolButton label="Urungkan (Ctrl+Z)" onClick={() => c().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Ulangi (Ctrl+Y)" onClick={() => c().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 className="h-4 w-4" />
        </ToolButton>
      </span>
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder = 'Mulai menulis artikel…' }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const insertFiles = async (editor: Editor, files: File[], pos?: number) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return false;
    setUploading(true);
    try {
      for (const file of images) {
        const src = await uploadImage(file);
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        const chain = editor.chain().focus();
        if (pos !== undefined) chain.insertContentAt(pos, { type: 'image', attrs: { src, alt } }).run();
        else chain.setImage({ src, alt }).run();
      }
      toast.success(images.length > 1 ? `${images.length} gambar ditambahkan` : 'Gambar ditambahkan');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah gambar.');
    } finally {
      setUploading(false);
    }
    return true;
  };

  const editor = useEditor({
    immediatelyRender: false, // wajib untuk Next.js (hindari hydration mismatch)
    shouldRerenderOnTransaction: true, // status tombol toolbar ikut berubah
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } },
      }),
      ResizableImage.configure({
        HTMLAttributes: { class: 'article-image' },
        // Tarik titik di sudut gambar untuk mengubah ukuran (rasio terjaga).
        resize: { enabled: true, directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], minWidth: 80, minHeight: 40, alwaysPreserveAspectRatio: true },
      }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: value,
    editorProps: {
      attributes: { class: 'prose-amania min-h-[22rem] px-5 py-5 outline-none sm:px-8' },
      // Klik gambar → pilih gambarnya (menampilkan titik ubah ukuran & menu ukuran cepat).
      handleClickOn: (view, _pos, node, nodePos) => {
        if (node.type.name !== 'image') return false;
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.some((f) => f.type.startsWith('image/')) || !editorRef.current) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertFiles(editorRef.current, files, pos);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.some((f) => f.type.startsWith('image/')) || !editorRef.current) return false;
        event.preventDefault();
        void insertFiles(editorRef.current, files);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
  });

  // Ref agar handler drop/paste (dibuat sekali) bisa mengakses instance editor.
  const editorRef = useRef<Editor | null>(null);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Tampilan gambar yang bisa di-resize menangani event mouse sendiri, sehingga klik
  // tidak memilih gambar. Pilih manual: klik gambar → NodeSelection (memunculkan menu ukuran).
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-resize-handle]')) return;
      const container = target.closest('[data-resize-container]');
      if (!container) return;
      let found: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (found !== null) return false;
        if (node.type.name === 'image' && editor.view.nodeDOM(pos) === container) found = pos;
      });
      if (found === null) return;
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, found)));
      editor.view.focus();
    };
    dom.addEventListener('click', onClick);
    return () => dom.removeEventListener('click', onClick);
  }, [editor]);

  if (!editor) {
    return <div className="h-[26rem] animate-pulse rounded-xl border border-slate-200 bg-slate-50" />;
  }

  const words = editor.storage.characterCount?.words?.() ?? 0;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white transition focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/10">
      <Toolbar editor={editor} onPickImage={() => fileRef.current?.click()} uploading={uploading} />
      {editor.isActive('image') && <ImageSizeBar editor={editor} />}
      <div className="max-h-[32rem] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
        <span>Seret & lepas atau tempel gambar · klik gambar untuk mengubah ukurannya · maks {MAX_IMAGE_MB} MB</span>
        <span className="tabular-nums">
          {words.toLocaleString('id-ID')} kata · ±{Math.max(1, Math.ceil(words / 200))} menit baca
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void insertFiles(editor, files);
        }}
      />
    </div>
  );
}

const SIZES = [
  { label: 'Kecil', pct: 33 },
  { label: 'Sedang', pct: 50 },
  { label: 'Besar', pct: 75 },
  { label: 'Penuh', pct: 100 },
];

/** Lebar area tulis (tanpa padding) — acuan persentase ukuran gambar. */
function contentWidth(editor: Editor): number {
  const dom = editor.view.dom as HTMLElement;
  const cs = getComputedStyle(dom);
  return Math.max(200, dom.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
}

/** Bilah kontekstual saat gambar dipilih: ukuran cepat + hapus (tarik titik sudut untuk ukuran bebas). */
function ImageSizeBar({ editor }: { editor: Editor }) {
  const width = Number(editor.getAttributes('image').width) || 0;
  const pct = width ? Math.min(100, Math.round((width / contentWidth(editor)) * 100)) : 100;

  const setSize = (p: number) => {
    const px = Math.round((contentWidth(editor) * p) / 100);
    editor.chain().focus().updateAttributes('image', { width: px, height: null }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-blue-50/60 px-3 py-1.5 text-xs">
      <span className="mr-1 font-medium text-slate-600">
        Ukuran gambar <span className="tabular-nums text-slate-400">· {pct}%</span>
      </span>
      {SIZES.map((sz) => (
        <button
          key={sz.pct}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setSize(sz.pct)}
          className={`rounded-md px-2.5 py-1 font-medium transition ${Math.abs(pct - sz.pct) <= 3 ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
        >
          {sz.label}
        </button>
      ))}
      <span className="ml-1 hidden text-slate-400 sm:inline">atau tarik titik di sudut gambar</span>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().deleteSelection().run()}
        className="ml-auto rounded-md px-2.5 py-1 font-medium text-rose-600 transition hover:bg-rose-50"
      >
        Hapus gambar
      </button>
    </div>
  );
}
