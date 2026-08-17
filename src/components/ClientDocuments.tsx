import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { formatDateTime } from '../lib/format'
import {
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FolderIcon,
  PencilIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from './icons'
import { EmptyState, SectionTitle } from './ui'

export interface DocumentItem {
  id: Id<'documents'>
  fileName: string
  name: string
  mimeType: string
  size: number
  remark: string
  createdAt: string
  url: string | null
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp']
const TEXT_EXT = ['csv', 'txt', 'md', 'markdown', 'json', 'log', 'tsv', 'xml']

type PreviewKind = 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'none'
export function previewKind(name: string, mime: string): PreviewKind {
  const e = ext(name)
  if (mime.startsWith('image/') || IMAGE_EXT.includes(e)) return 'image'
  if (mime === 'application/pdf' || e === 'pdf') return 'pdf'
  if (mime.startsWith('text/') || TEXT_EXT.includes(e)) return 'text'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'none'
}

// Badge par famille de fichier (extension), sans dépendre du MIME souvent
// vide côté navigateur.
function fileKind(name: string, mime: string) {
  const e = ext(name)
  if (IMAGE_EXT.includes(e))
    return { label: e.toUpperCase(), color: 'var(--chart-2)' }
  if (e === 'pdf') return { label: 'PDF', color: 'var(--status-bad)' }
  if (['csv', 'xls', 'xlsx', 'numbers', 'tsv'].includes(e))
    return { label: e.toUpperCase(), color: 'var(--status-good)' }
  if (['md', 'txt', 'doc', 'docx', 'pages', 'rtf', 'json'].includes(e))
    return { label: e.toUpperCase(), color: 'var(--lagoon)' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e))
    return { label: e.toUpperCase(), color: 'var(--status-warn)' }
  if (mime.startsWith('video/'))
    return { label: 'VIDÉO', color: 'var(--chart-2)' }
  if (mime.startsWith('audio/'))
    return { label: 'AUDIO', color: 'var(--chart-2)' }
  return {
    label: e ? e.toUpperCase().slice(0, 5) : 'FICHIER',
    color: 'var(--status-muted)',
  }
}

interface Pending {
  key: string
  file: File
  name: string
  remark: string
  previewUrl: string | null
  state: 'idle' | 'uploading' | 'done' | 'error'
  error?: string
}

// Onglet « Dossier » de la fiche client : dépôt de fichiers par glisser-
// déposer (tout type, plusieurs à la fois), chacun renommable + remarque,
// miniature pour les images, aperçu au clic, téléchargement.
export default function ClientDocuments({
  clientSlug,
}: {
  clientSlug: string
}) {
  const docs = useQuery(api.documents.list, { clientSlug })
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl)
  const create = useMutation(api.documents.create)
  const update = useMutation(api.documents.update)
  const remove = useMutation(api.documents.remove)

  const [pending, setPending] = useState<Array<Pending>>([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (files: FileList | Array<File> | null) => {
    if (!files) return
    const next: Array<Pending> = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      name: file.name,
      remark: '',
      previewUrl:
        previewKind(file.name, file.type) === 'image'
          ? URL.createObjectURL(file)
          : null,
      state: 'idle',
    }))
    setPending((p) => [...p, ...next])
  }

  const patchPending = (key: string, patch: Partial<Pending>) =>
    setPending((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  const dropPending = (key: string) =>
    setPending((p) => {
      const item = p.find((x) => x.key === key)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return p.filter((x) => x.key !== key)
    })

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files)
    e.target.value = ''
  }

  const uploadAll = async () => {
    if (uploading) return
    setUploading(true)
    for (const item of pending) {
      if (item.state === 'done') continue
      patchPending(item.key, { state: 'uploading' })
      try {
        const url = await generateUploadUrl()
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': item.file.type || 'application/octet-stream',
          },
          body: item.file,
        })
        if (!res.ok) throw new Error(`Envoi refusé (${res.status})`)
        const { storageId } = (await res.json()) as {
          storageId: Id<'_storage'>
        }
        await create({
          clientSlug,
          storageId,
          fileName: item.file.name,
          name: item.name,
          mimeType: item.file.type,
          size: item.file.size,
          remark: item.remark,
        })
        patchPending(item.key, { state: 'done' })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        patchPending(item.key, { state: 'error', error: message })
      }
    }
    setUploading(false)
    // On retire les fichiers déposés avec succès de la zone d'attente.
    setPending((p) => {
      for (const x of p)
        if (x.state === 'done' && x.previewUrl)
          URL.revokeObjectURL(x.previewUrl)
      return p.filter((x) => x.state !== 'done')
    })
  }

  const canUpload = pending.some((p) => p.state !== 'done') && !uploading

  return (
    <section className="min-w-0">
      <SectionTitle icon={<FolderIcon className="h-4 w-4" />}>
        Dossier du client
        {docs && docs.length > 0 && (
          <span className="tabular font-semibold text-[var(--sea-ink-faint)]">
            {docs.length}
          </span>
        )}
      </SectionTitle>

      {/* Zone de dépôt */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rise-in rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? 'border-[var(--lagoon)] bg-[var(--lagoon-tint)]'
            : 'border-[var(--line-strong)] bg-[var(--surface)]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={onPick}
          className="hidden"
          aria-label="Choisir des fichiers"
        />
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--lagoon)]">
          <UploadIcon className="h-5 w-5" />
        </span>
        <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
          Glisse tes fichiers ici (plusieurs à la fois)
        </p>
        <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">
          CSV, Excel, PDF, images, Markdown, archives… tout est accepté (50 Mo
          max par fichier). Tu peux renommer chaque fichier et ajouter une
          remarque avant de déposer.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn btn-secondary btn-sm mt-4"
        >
          <FileIcon className="h-3.5 w-3.5" />
          Choisir des fichiers
        </button>
      </div>

      {/* Fichiers en attente : nom + remarque + envoi */}
      {pending.length > 0 && (
        <div className="island-shell rise-in mt-4 rounded-2xl p-4">
          <p className="island-kicker m-0 mb-3">À déposer · {pending.length}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {pending.map((item) => {
              const kind = fileKind(item.file.name, item.file.type)
              return (
                <li
                  key={item.key}
                  className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5"
                >
                  <Thumb
                    url={item.previewUrl}
                    label={kind.label}
                    color={kind.color}
                    alt={item.name}
                  />
                  <div className="grid min-w-0 flex-1 basis-64 gap-1.5 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-[var(--sea-ink-faint)]">
                        Nom
                      </span>
                      <input
                        value={item.name}
                        onChange={(e) =>
                          patchPending(item.key, { name: e.target.value })
                        }
                        disabled={item.state === 'uploading'}
                        placeholder={item.file.name}
                        className="field w-full py-1.5 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-[var(--sea-ink-faint)]">
                        Remarque
                      </span>
                      <input
                        value={item.remark}
                        onChange={(e) =>
                          patchPending(item.key, { remark: e.target.value })
                        }
                        disabled={item.state === 'uploading'}
                        placeholder="Optionnel (ex. Devis signé, Export juillet…)"
                        className="field w-full py-1.5 text-sm"
                      />
                    </label>
                    <p className="m-0 truncate text-[11px] text-[var(--sea-ink-faint)] sm:col-span-2">
                      {item.file.name} · {formatSize(item.file.size)}
                      {item.state === 'uploading' && ' · envoi…'}
                      {item.state === 'error' && (
                        <span className="text-[var(--status-bad)]">
                          {' '}
                          · {item.error}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Retirer ${item.file.name}`}
                    disabled={item.state === 'uploading'}
                    onClick={() => dropPending(item.key)}
                    className="btn btn-ghost btn-sm px-2"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={!canUpload}
              onClick={uploadAll}
              className="btn btn-primary btn-sm"
            >
              <UploadIcon className="h-3.5 w-3.5" />
              {uploading
                ? 'Envoi en cours…'
                : `Déposer ${pending.length} fichier${pending.length > 1 ? 's' : ''}`}
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                for (const x of pending)
                  if (x.previewUrl) URL.revokeObjectURL(x.previewUrl)
                setPending([])
              }}
              className="btn btn-ghost btn-sm"
            >
              Tout retirer
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <DocumentList
          docs={docs}
          emptyHint="Les fichiers déposés apparaîtront ici."
          onUpdate={(id, patch) => update({ id, ...patch })}
          onRemove={(d) => {
            if (window.confirm(`Supprimer « ${d.name} » du dossier ?`))
              remove({ id: d.id })
          }}
        />
      </div>
    </section>
  )
}

// Miniature : l'image elle-même quand c'est une image, sinon un badge.
function Thumb({
  url,
  label,
  color,
  alt,
}: {
  url: string | null
  label: string
  color: string
  alt: string
}) {
  if (url)
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="h-10 w-14 flex-shrink-0 rounded-lg border border-[var(--line)] object-cover"
      />
    )
  return (
    <span
      className="flex h-10 w-14 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold tracking-wide"
      style={{
        background: 'var(--surface-strong)',
        color,
        border: '1px solid var(--line)',
      }}
      aria-hidden="true"
    >
      {label}
    </span>
  )
}

// Liste des fichiers : clic = aperçu ; en mode admin (onUpdate/onRemove)
// on peut renommer, changer la remarque et supprimer.
export function DocumentList({
  docs,
  emptyHint = 'Les fichiers partagés par Eleven Process apparaîtront ici.',
  onUpdate,
  onRemove,
}: {
  docs: Array<DocumentItem> | undefined
  emptyHint?: string
  onUpdate?: (
    id: Id<'documents'>,
    patch: { name?: string; remark?: string },
  ) => void
  onRemove?: (doc: DocumentItem) => void
}) {
  const [openId, setOpenId] = useState<Id<'documents'> | null>(null)
  const open = openId ? (docs?.find((d) => d.id === openId) ?? null) : null
  const step = (delta: number) => {
    if (!docs || !open) return
    const i = docs.findIndex((d) => d.id === open.id)
    const next = docs.at((i + delta + docs.length) % docs.length)
    if (next) setOpenId(next.id)
  }

  return (
    <>
      <div className="island-shell rise-in rounded-2xl">
        {docs === undefined ? (
          <div className="p-4">
            <div className="skeleton mb-2 h-12 w-full" />
            <div className="skeleton h-12 w-full" />
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={<FolderIcon className="h-4 w-4" />}
            title="Dossier vide"
            hint={emptyHint}
          />
        ) : (
          <ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
            {docs.map((d) => (
              <DocumentRow
                key={d.id}
                doc={d}
                onOpen={() => setOpenId(d.id)}
                onUpdate={
                  onUpdate ? (patch) => onUpdate(d.id, patch) : undefined
                }
                onRemove={onRemove ? () => onRemove(d) : undefined}
              />
            ))}
          </ul>
        )}
      </div>
      {open && (
        <DocumentPreview
          doc={open}
          onClose={() => setOpenId(null)}
          onPrev={docs && docs.length > 1 ? () => step(-1) : undefined}
          onNext={docs && docs.length > 1 ? () => step(1) : undefined}
        />
      )}
    </>
  )
}

function DocumentRow({
  doc,
  onOpen,
  onUpdate,
  onRemove,
}: {
  doc: DocumentItem
  onOpen: () => void
  onUpdate?: (patch: { name?: string; remark?: string }) => void
  onRemove?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(doc.name)
  const [remark, setRemark] = useState(doc.remark)
  const kind = fileKind(doc.fileName, doc.mimeType)
  const isImage = previewKind(doc.fileName, doc.mimeType) === 'image'

  const save = () => {
    onUpdate?.({ name, remark })
    setEditing(false)
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ouvrir ${doc.name}`}
        className="cursor-pointer border-0 bg-transparent p-0"
      >
        <Thumb
          url={isImage ? doc.url : null}
          label={kind.label}
          color={kind.color}
          alt={doc.name}
        />
      </button>
      <div className="min-w-0 flex-1 basis-56">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
            className="grid gap-1.5 sm:grid-cols-[1fr_1fr_auto]"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Nom"
              aria-label="Nom"
              className="field w-full py-1.5 text-sm"
            />
            <input
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Remarque"
              aria-label="Remarque"
              className="field w-full py-1.5 text-sm"
            />
            <div className="flex items-center gap-1">
              <button type="submit" className="btn btn-primary btn-sm px-2">
                <CheckIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setName(doc.name)
                  setRemark(doc.remark)
                  setEditing(false)
                }}
                className="btn btn-ghost btn-sm px-2"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="m-0 flex items-center gap-2 text-sm font-semibold">
              <button
                type="button"
                onClick={onOpen}
                className="min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-sm font-semibold text-[var(--sea-ink)] hover:text-[var(--lagoon)]"
              >
                {doc.name}
              </button>
              {onUpdate && (
                <button
                  type="button"
                  aria-label="Renommer / modifier la remarque"
                  onClick={() => setEditing(true)}
                  className="cursor-pointer rounded-md border-0 bg-transparent p-1 text-[var(--sea-ink-faint)] hover:text-[var(--lagoon)]"
                >
                  <PencilIcon className="h-3 w-3" />
                </button>
              )}
            </p>
            {doc.remark && (
              <p className="m-0 mt-0.5 truncate text-xs text-[var(--sea-ink-soft)]">
                {doc.remark}
              </p>
            )}
          </>
        )}
        <p className="m-0 mt-0.5 truncate text-[11px] text-[var(--sea-ink-faint)]">
          {doc.name !== doc.fileName && `${doc.fileName} · `}
          {formatSize(doc.size)} · déposé le {formatDateTime(doc.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener"
            download={doc.fileName}
            className="btn btn-secondary btn-sm"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Télécharger</span>
          </a>
        )}
        {onRemove && (
          <button
            type="button"
            aria-label={`Supprimer ${doc.name}`}
            onClick={onRemove}
            className="btn btn-ghost btn-sm px-2 hover:text-[var(--status-bad)]"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  )
}

// Fenêtre d'aperçu : image, PDF, texte/CSV/Markdown, vidéo, audio ; sinon
// invitation au téléchargement. Flèches ← → pour passer au fichier suivant.
export function DocumentPreview({
  doc,
  onClose,
  onPrev,
  onNext,
}: {
  doc: DocumentItem
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}) {
  const kind = previewKind(doc.fileName, doc.mimeType)
  const [text, setText] = useState<string | null>(null)
  const [textError, setTextError] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev?.()
      if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, onPrev, onNext])

  useEffect(() => {
    setText(null)
    setTextError(false)
    if (kind !== 'text' || !doc.url) return
    if (doc.size > 2 * 1024 * 1024) {
      setTextError(true)
      return
    }
    let cancelled = false
    fetch(doc.url)
      .then((r) =>
        r.ok ? r.text() : Promise.reject(new Error(String(r.status))),
      )
      .then((t) => {
        if (!cancelled) setText(t)
      })
      .catch(() => {
        if (!cancelled) setTextError(true)
      })
    return () => {
      cancelled = true
    }
  }, [doc.id, doc.url, doc.size, kind])

  const isCsv = ['csv', 'tsv'].includes(ext(doc.fileName))
  const csvRows =
    isCsv && text
      ? text
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0)
          .slice(0, 200)
          .map((l) =>
            l.split(l.includes(';') && !l.includes(',') ? ';' : /,|\t/),
          )
      : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Fermer l'aperçu"
        onClick={onClose}
        className="absolute inset-0 cursor-default border-0 bg-[rgba(4,18,22,0.75)] p-0 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Aperçu de ${doc.name}`}
        className="rise-in relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-solid)] shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-sm font-bold text-[var(--sea-ink)]">
              {doc.name}
            </p>
            <p className="m-0 mt-0.5 truncate text-[11px] text-[var(--sea-ink-faint)]">
              {doc.remark && <>{doc.remark} · </>}
              {doc.name !== doc.fileName && `${doc.fileName} · `}
              {formatSize(doc.size)} · {formatDateTime(doc.createdAt)}
            </p>
          </div>
          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              className="btn btn-ghost btn-sm px-2"
              aria-label="Fichier précédent"
            >
              ←
            </button>
          )}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              className="btn btn-ghost btn-sm px-2"
              aria-label="Fichier suivant"
            >
              →
            </button>
          )}
          {doc.url && (
            <>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener"
                className="btn btn-ghost btn-sm"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Ouvrir</span>
              </a>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener"
                download={doc.fileName}
                className="btn btn-primary btn-sm"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Télécharger</span>
              </a>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="btn btn-ghost btn-sm px-2"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-[40vh] flex-1 items-center justify-center overflow-auto bg-[rgba(0,0,0,0.25)]">
          {!doc.url ? (
            <EmptyState title="Fichier indisponible" />
          ) : kind === 'image' ? (
            <img
              src={doc.url}
              alt={doc.name}
              className="max-h-[80vh] max-w-full object-contain"
            />
          ) : kind === 'pdf' ? (
            <iframe
              src={doc.url}
              title={doc.name}
              className="h-[80vh] w-full border-0 bg-white"
            />
          ) : kind === 'video' ? (
            <video src={doc.url} controls className="max-h-[80vh] max-w-full" />
          ) : kind === 'audio' ? (
            <audio src={doc.url} controls className="w-full max-w-md" />
          ) : kind === 'text' ? (
            textError ? (
              <EmptyState
                title="Aperçu texte indisponible"
                hint="Le fichier est trop lourd ou ne peut pas être lu ici — télécharge-le."
              />
            ) : text === null ? (
              <p className="demo-muted m-0 flex items-center gap-2 text-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--lagoon)]" />
                Chargement…
              </p>
            ) : csvRows ? (
              <div className="w-full self-start overflow-auto p-4">
                <table className="demo-table text-xs">
                  <thead>
                    <tr>
                      {csvRows[0]?.map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(1).map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) => (
                          <td key={j}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {text.split(/\r?\n/).length > 200 && (
                  <p className="m-0 mt-2 text-[11px] text-[var(--sea-ink-faint)]">
                    Aperçu limité aux 200 premières lignes.
                  </p>
                )}
              </div>
            ) : (
              <pre className="m-0 w-full self-start overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-[var(--sea-ink)]">
                {text}
              </pre>
            )
          ) : (
            <EmptyState
              icon={<FileIcon className="h-4 w-4" />}
              title="Pas d'aperçu pour ce type de fichier"
              hint="Utilise « Télécharger » pour l'ouvrir sur ton ordinateur."
              action={
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener"
                  download={doc.fileName}
                  className="btn btn-primary btn-sm"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                  Télécharger
                </a>
              }
            />
          )}
        </div>
      </section>
    </div>
  )
}
