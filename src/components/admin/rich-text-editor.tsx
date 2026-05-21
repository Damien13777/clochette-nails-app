"use client";

/**
 * Éditeur WYSIWYG TipTap réutilisable côté admin.
 *
 * Utilisations prévues :
 *  - Blog admin (article)
 *  - Ebooks admin (description marketing)
 *  - Newsletter admin (composition campagne)
 *  - Éventuellement descriptions prestations
 *
 * Le composant produit du HTML standard que les pages publiques rendent
 * via `dangerouslySetInnerHTML` après sanitization DOMPurify (cf.
 * `src/lib/sanitize-html.ts`).
 *
 * Props :
 *  - value : HTML initial
 *  - onChange : appelé à chaque édition avec le HTML courant
 *  - toolbarVariant : "full" (blog/ebook) ou "minimal" (newsletter)
 *  - disabled
 *  - placeholder
 */

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";

/** Image étendue avec attribut `width` (ex: "30%", "50%", "100%"). */
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute("width"),
        renderHTML: (attrs) =>
          attrs.width ? { width: attrs.width } : {},
      },
    };
  },
});

type Props = {
  value: string;
  onChange: (html: string) => void;
  toolbarVariant?: "full" | "minimal";
  disabled?: boolean;
  placeholder?: string;
  /** Hauteur minimale en classes Tailwind (ex: "min-h-[24rem]"). */
  minHeightClass?: string;
  /** Si fourni, le bouton Image ouvre un file picker et appelle ce callback
   *  qui doit retourner l'URL publique de l'image uploadée. Sinon, fallback
   *  sur un prompt() URL classique. */
  onImageUpload?: (file: File) => Promise<string>;
};

export function RichTextEditor({
  value,
  onChange,
  toolbarVariant = "full",
  disabled,
  minHeightClass = "min-h-[20rem]",
  onImageUpload,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // StarterKit v3 inclut Link et Underline → on les désactive ici
        // pour les redéclarer ci-dessous avec nos options custom.
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      ResizableImage.configure({
        HTMLAttributes: { class: "rounded-md max-w-full h-auto" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `rich-content max-w-none focus:outline-none px-4 py-3 ${minHeightClass}`,
      },
    },
  });

  // Sync external value changes (e.g. reset form)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return (
      <div
        className={`border border-[var(--color-line)] rounded-[var(--radius-sm)] bg-[var(--color-bone)]/40 ${minHeightClass}`}
      />
    );
  }

  return (
    <div className="border border-[var(--color-line)] rounded-[var(--radius-sm)] overflow-hidden bg-[var(--color-paper)]">
      <Toolbar
        editor={editor}
        variant={toolbarVariant}
        disabled={disabled}
        onImageUpload={onImageUpload}
      />
      <EditorContent editor={editor} />
    </div>
  );
}

// ─── Toolbar ────────────────────────────────────────────────

type EditorType = NonNullable<ReturnType<typeof useEditor>>;

function Toolbar({
  editor,
  variant,
  disabled,
  onImageUpload,
}: {
  editor: EditorType;
  variant: "full" | "minimal";
  disabled?: boolean;
  onImageUpload?: (file: File) => Promise<string>;
}) {
  const isFull = variant === "full";
  const imageInputRef = useRef<HTMLInputElement>(null);

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onImageUpload) return;
    try {
      const url = await onImageUpload(file);
      const alt =
        window.prompt(
          "Texte alternatif (description pour SEO et accessibilité)",
          "",
        ) ?? "";
      editor.chain().focus().setImage({ src: url, alt }).run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur upload";
      window.alert(`Échec upload image : ${msg}`);
    }
  }

  function handleImageClick() {
    if (onImageUpload && imageInputRef.current) {
      imageInputRef.current.click();
    } else {
      const url = window.prompt("URL de l'image (https://…)");
      if (!url) return;
      const alt =
        window.prompt(
          "Texte alternatif (description pour SEO et accessibilité)",
          "",
        ) ?? "";
      editor.chain().focus().setImage({ src: url, alt }).run();
    }
  }

  function handleEditAlt() {
    const current = (editor.getAttributes("image").alt as string) ?? "";
    const next = window.prompt(
      "Texte alternatif (description pour SEO et accessibilité)",
      current,
    );
    if (next === null) return;
    editor.chain().focus().updateAttributes("image", { alt: next }).run();
  }

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 px-2 py-2 border-b border-[var(--color-line)] bg-[var(--color-bone)]/50"
      role="toolbar"
      aria-label="Mise en forme"
    >
      {/* Inline */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        disabled={disabled}
        label="Gras"
        kbd="B"
      >
        <strong className="text-sm">B</strong>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        disabled={disabled}
        label="Italique"
        kbd="I"
      >
        <em className="text-sm">I</em>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        disabled={disabled}
        label="Souligné"
        kbd="U"
      >
        <span className="text-sm underline">U</span>
      </ToolBtn>
      {isFull && (
        <ToolBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          disabled={disabled}
          label="Barré"
        >
          <span className="text-sm line-through">S</span>
        </ToolBtn>
      )}

      <Sep />

      {/* Headings */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        disabled={disabled}
        label="Titre 1"
      >
        <span className="text-[11px] font-bold">H1</span>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        disabled={disabled}
        label="Titre 2"
      >
        <span className="text-[11px] font-bold">H2</span>
      </ToolBtn>
      {isFull && (
        <ToolBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor.isActive("heading", { level: 3 })}
          disabled={disabled}
          label="Titre 3"
        >
          <span className="text-[11px] font-bold">H3</span>
        </ToolBtn>
      )}
      <ToolBtn
        onClick={() => editor.chain().focus().setParagraph().run()}
        active={editor.isActive("paragraph")}
        disabled={disabled}
        label="Paragraphe"
      >
        <span className="text-[11px]">¶</span>
      </ToolBtn>

      <Sep />

      {/* Lists */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        disabled={disabled}
        label="Liste à puces"
      >
        <span className="text-sm">•</span>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        disabled={disabled}
        label="Liste numérotée"
      >
        <span className="text-[11px]">1.</span>
      </ToolBtn>
      {isFull && (
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          disabled={disabled}
          label="Citation"
        >
          <span className="text-sm">❝</span>
        </ToolBtn>
      )}

      {isFull && (
        <>
          <Sep />

          {/* Alignment */}
          <ToolBtn
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            active={editor.isActive({ textAlign: "left" })}
            disabled={disabled}
            label="Aligner à gauche"
          >
            <AlignIcon align="left" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            active={editor.isActive({ textAlign: "center" })}
            disabled={disabled}
            label="Centrer"
          >
            <AlignIcon align="center" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            active={editor.isActive({ textAlign: "right" })}
            disabled={disabled}
            label="Aligner à droite"
          >
            <AlignIcon align="right" />
          </ToolBtn>
          <ToolBtn
            onClick={() =>
              editor.chain().focus().setTextAlign("justify").run()
            }
            active={editor.isActive({ textAlign: "justify" })}
            disabled={disabled}
            label="Justifier"
          >
            <AlignIcon align="justify" />
          </ToolBtn>

          <Sep />

          {/* Link + Image */}
          <ToolBtn
            onClick={() => {
              const prev = (editor.getAttributes("link").href as string) ?? "";
              const url = window.prompt("URL du lien (https://…)", prev);
              if (url === null) return;
              if (url.trim() === "") {
                editor.chain().focus().unsetLink().run();
                return;
              }
              const href = url.trim();

              // Si du texte est déjà sélectionné OU si on clique sur un lien
              // existant, on applique/remplace le href sur ce range.
              const hasSelection = !editor.state.selection.empty;
              if (hasSelection || editor.isActive("link")) {
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href })
                  .run();
                return;
              }

              // Pas de sélection : on demande le texte du lien et on l'insère
              // au curseur, déjà marqué comme lien.
              const text = window.prompt(
                "Texte du lien (laissez vide pour utiliser l'URL)",
                "",
              );
              if (text === null) return;
              const linkText = text.trim() === "" ? href : text.trim();
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "text",
                  text: linkText,
                  marks: [{ type: "link", attrs: { href } }],
                })
                .run();
            }}
            active={editor.isActive("link")}
            disabled={disabled}
            label="Lien"
          >
            <span className="text-sm">🔗</span>
          </ToolBtn>
          <ToolBtn
            onClick={handleImageClick}
            disabled={disabled}
            label={onImageUpload ? "Téléverser une image" : "Image par URL"}
          >
            <span className="text-sm">🖼️</span>
          </ToolBtn>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={handleImageFile}
            className="sr-only"
          />

          {/* Outils image (visible quand une image est sélectionnée) */}
          {editor.isActive("image") && (
            <>
              <Sep />
              <ToolBtn
                onClick={handleEditAlt}
                disabled={disabled}
                label="Modifier le texte alternatif (alt)"
              >
                <span className="text-[10px] font-semibold">Alt</span>
              </ToolBtn>
              <ToolBtn
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", { width: "30%" })
                    .run()
                }
                disabled={disabled}
                label="Image petite (30%)"
              >
                <span className="text-[10px] font-semibold">S</span>
              </ToolBtn>
              <ToolBtn
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", { width: "50%" })
                    .run()
                }
                disabled={disabled}
                label="Image moyenne (50%)"
              >
                <span className="text-[10px] font-semibold">M</span>
              </ToolBtn>
              <ToolBtn
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", { width: "75%" })
                    .run()
                }
                disabled={disabled}
                label="Image grande (75%)"
              >
                <span className="text-[10px] font-semibold">L</span>
              </ToolBtn>
              <ToolBtn
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", { width: null })
                    .run()
                }
                disabled={disabled}
                label="Image pleine largeur"
              >
                <span className="text-[10px] font-semibold">Full</span>
              </ToolBtn>
            </>
          )}
        </>
      )}

      <Sep />

      {/* Undo/Redo */}
      <ToolBtn
        onClick={() => editor.chain().focus().undo().run()}
        disabled={disabled || !editor.can().undo()}
        label="Annuler"
        kbd="⌘Z"
      >
        <span className="text-sm">↶</span>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().redo().run()}
        disabled={disabled || !editor.can().redo()}
        label="Refaire"
        kbd="⌘⇧Z"
      >
        <span className="text-sm">↷</span>
      </ToolBtn>
    </div>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-[var(--color-line)] mx-1" />;
}

function ToolBtn({
  onClick,
  active,
  disabled,
  label,
  kbd,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  kbd?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={kbd ? `${label} (${kbd})` : label}
      title={kbd ? `${label} (${kbd})` : label}
      className={`w-8 h-8 inline-flex items-center justify-center rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
      }`}
    >
      {children}
    </button>
  );
}

function AlignIcon({
  align,
}: {
  align: "left" | "center" | "right" | "justify";
}) {
  const lines: { x1: string; x2: string }[] = (() => {
    switch (align) {
      case "left":
        return [
          { x1: "3", x2: "13" },
          { x1: "3", x2: "17" },
          { x1: "3", x2: "11" },
        ];
      case "center":
        return [
          { x1: "5", x2: "15" },
          { x1: "3", x2: "17" },
          { x1: "6", x2: "14" },
        ];
      case "right":
        return [
          { x1: "7", x2: "17" },
          { x1: "3", x2: "17" },
          { x1: "9", x2: "17" },
        ];
      case "justify":
        return [
          { x1: "3", x2: "17" },
          { x1: "3", x2: "17" },
          { x1: "3", x2: "17" },
        ];
    }
  })();
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1={lines[0].x1} y1="6" x2={lines[0].x2} y2="6" />
      <line x1={lines[1].x1} y1="10" x2={lines[1].x2} y2="10" />
      <line x1={lines[2].x1} y1="14" x2={lines[2].x2} y2="14" />
    </svg>
  );
}
