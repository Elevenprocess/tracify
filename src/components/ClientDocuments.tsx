import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { formatDateTime } from '../lib/format'
import {
  CheckIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  PencilIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from './icons'
import { EmptyState, SectionTitle } from './ui'

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

// Petit badge par famille de fichier (extension), sans dépendre du MIME
// souvent vide côté navigateur.
function fileKind(name: string, mime: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(ext))
    return { label: ext.toUpperCase(), color: 'var(--chart-2)' }
  if (ext === 'pdf') return { label: 'PDF', color: 'var(--status-bad)' }
  if (['csv', 'xls', 'xlsx', 'numbers'].includes(ext))
    return { label: ext.toUpperCase(), color: 'var(--status-good)' }
  if (['md', 'txt', 'doc', 'docx', 'pages', 'rtf'].includes(ext))
    return { label: ext.toUpperCase(), color: 'var(--lagoon)' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return { label: ext.toUpperCase(), color: 'var(--status-warn)' }
  if (mime.startsWith('video/'))
    return { label: 'VIDÉO', color: 'var(--chart-2)' }
  if (mime.startsWith('audio/'))
    return { label: 'AUDIO', color: 'var(--chart-2)' }
  return {
    label: ext ? ext.toUpperCase().slice(0, 5) : 'FICHIER',
    color: 'var(--status-muted)',
  }
}

interface Pending {
  key: string
  file: File
  remark: string
  state: 'idle' | 'uploading' | 'done' | 'error'
  error?: string
}

// Onglet « Dossier » de la fiche client : dépôt de fichiers par glisser-
// déposer (tout type), une remarque par fichier — c'est elle qui s'affiche,
// pas le nom du fichier — puis liste téléchargeable.
export default function ClientDocuments({
  clientSlug,
}: {
  clientSlug: string
}) {
  const docs = useQuery(api.documents.list, { clientSlug })
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl)
  const create = useMutation(api.documents.create)
  const setRemark = useMutation(api.documents.setRemark)
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
      remark: '',
      state: 'idle',
    }))
    setPending((p) => [...p, ...next])
  }

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
      setPending((p) =>
        p.map((x) => (x.key === item.key ? { ...x, state: 'uploading' } : x)),
      )
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
          mimeType: item.file.type,
          size: item.file.size,
          remark: item.remark,
        })
        setPending((p) =>
          p.map((x) => (x.key === item.key ? { ...x, state: 'done' } : x)),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setPending((p) =>
          p.map((x) =>
            x.key === item.key ? { ...x, state: 'error', error: message } : x,
          ),
        )
      }
    }
    setUploading(false)
    // On retire les fichiers déposés avec succès de la zone d'attente.
    setPending((p) => p.filter((x) => x.state !== 'done'))
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
          Glisse tes fichiers ici
        </p>
        <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">
          CSV, Excel, PDF, images, Markdown, archives… tout est accepté (50 Mo
          max par fichier). Ajoute une remarque : c'est elle qui s'affichera,
          pas le nom du fichier.
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

      {/* Fichiers en attente : remarque + envoi */}
      {pending.length > 0 && (
        <div className="island-shell rise-in mt-4 rounded-2xl p-4">
          <p className="island-kicker m-0 mb-3">À déposer · {pending.length}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {pending.map((item) => {
              const kind = fileKind(item.file.name, item.file.type)
              return (
                <li
                  key={item.key}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5"
                >
                  <KindBadge label={kind.label} color={kind.color} />
                  <div className="min-w-0 flex-1 basis-56">
                    <input
                      value={item.remark}
                      onChange={(e) =>
                        setPending((p) =>
                          p.map((x) =>
                            x.key === item.key
                              ? { ...x, remark: e.target.value }
                              : x,
                          ),
                        )
                      }
                      disabled={item.state === 'uploading'}
                      placeholder="Remarque (ex. Devis signé, Export leads juillet…)"
                      className="field w-full py-1.5 text-sm"
                    />
                    <p className="m-0 mt-1 truncate text-[11px] text-[var(--sea-ink-faint)]">
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
                    onClick={() =>
                      setPending((p) => p.filter((x) => x.key !== item.key))
                    }
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
              onClick={() => setPending([])}
              className="btn btn-ghost btn-sm"
            >
              Tout retirer
            </button>
          </div>
        </div>
      )}

      {/* Liste des fichiers déposés */}
      <div className="island-shell rise-in mt-4 rounded-2xl">
        {docs === undefined ? (
          <div className="p-4">
            <div className="skeleton mb-2 h-12 w-full" />
            <div className="skeleton h-12 w-full" />
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={<FolderIcon className="h-4 w-4" />}
            title="Dossier vide"
            hint="Les fichiers déposés apparaîtront ici avec leur remarque."
          />
        ) : (
          <ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
            {docs.map((d) => (
              <DocumentRow
                key={d.id}
                doc={d}
                onSetRemark={(remark) => setRemark({ id: d.id, remark })}
                onRemove={() => {
                  if (
                    window.confirm(
                      `Supprimer « ${d.remark || d.fileName} » du dossier ?`,
                    )
                  )
                    remove({ id: d.id })
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function KindBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="flex h-10 w-12 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold tracking-wide"
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

function DocumentRow({
  doc,
  onSetRemark,
  onRemove,
}: {
  doc: {
    id: Id<'documents'>
    fileName: string
    mimeType: string
    size: number
    remark: string
    createdAt: string
    url: string | null
  }
  onSetRemark: (remark: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(doc.remark)
  const kind = fileKind(doc.fileName, doc.mimeType)

  const save = () => {
    onSetRemark(draft)
    setEditing(false)
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <KindBadge label={kind.label} color={kind.color} />
      <div className="min-w-0 flex-1 basis-56">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
            className="flex items-center gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              placeholder="Remarque"
              className="field w-full py-1.5 text-sm"
            />
            <button type="submit" className="btn btn-primary btn-sm px-2">
              <CheckIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(doc.remark)
                setEditing(false)
              }}
              className="btn btn-ghost btn-sm px-2"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </form>
        ) : (
          <p className="m-0 flex items-center gap-2 text-sm font-semibold text-[var(--sea-ink)]">
            <span className="truncate">
              {doc.remark || (
                <span className="font-normal italic text-[var(--sea-ink-soft)]">
                  Sans remarque
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label="Modifier la remarque"
              onClick={() => setEditing(true)}
              className="cursor-pointer rounded-md border-0 bg-transparent p-1 text-[var(--sea-ink-faint)] hover:text-[var(--lagoon)]"
            >
              <PencilIcon className="h-3 w-3" />
            </button>
          </p>
        )}
        <p className="m-0 mt-0.5 truncate text-[11px] text-[var(--sea-ink-faint)]">
          {doc.fileName} · {formatSize(doc.size)} · déposé le{' '}
          {formatDateTime(doc.createdAt)}
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
            Télécharger
          </a>
        )}
        <button
          type="button"
          aria-label={`Supprimer ${doc.remark || doc.fileName}`}
          onClick={onRemove}
          className="btn btn-ghost btn-sm px-2 hover:text-[var(--status-bad)]"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  )
}

export interface DocumentItem {
  id: Id<'documents'>
  fileName: string
  mimeType: string
  size: number
  remark: string
  createdAt: string
  url: string | null
}

// Liste en lecture seule (espace client) : remarque en titre, téléchargement.
export function DocumentList({
  docs,
  emptyHint = 'Les fichiers partagés par Eleven Process apparaîtront ici.',
}: {
  docs: Array<DocumentItem> | undefined
  emptyHint?: string
}) {
  return (
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
          {docs.map((d) => {
            const kind = fileKind(d.fileName, d.mimeType)
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <KindBadge label={kind.label} color={kind.color} />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="m-0 truncate text-sm font-semibold text-[var(--sea-ink)]">
                    {d.remark || d.fileName}
                  </p>
                  <p className="m-0 mt-0.5 truncate text-[11px] text-[var(--sea-ink-faint)]">
                    {d.fileName} · {formatSize(d.size)} ·{' '}
                    {formatDateTime(d.createdAt)}
                  </p>
                </div>
                {d.url && (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener"
                    download={d.fileName}
                    className="btn btn-secondary btn-sm"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    Télécharger
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
