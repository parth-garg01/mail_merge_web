import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../App'
import api from '../api'

export default function TemplateEditor() {
  const { wizard, updateWizard, navigate } = useApp()
  const [previewRow, setPreviewRow] = useState(0)
  const [preview, setPreview] = useState({ subject: '', body: '' })
  const [validation, setValidation] = useState(null)
  const [previewMode, setPreviewMode] = useState('html')
  const [uploading, setUploading] = useState(false)
  const attachInputRef = useRef(null)

  const { sheetData, subjectTemplate, bodyTemplate, attachments = [] } = wizard
  const headers = sheetData?.headers || []
  const rows = sheetData?.rows || []

  useEffect(() => {
    if (!subjectTemplate && !bodyTemplate) return
    loadPreview()
  }, [subjectTemplate, bodyTemplate, previewRow])

  async function loadPreview() {
    if (!rows.length) return
    const row = rows[previewRow] || rows[0]
    const result = await api.template.preview({ subjectTemplate, bodyTemplate, row })
    if (result) setPreview(result)
  }

  async function validateAndNext() {
    if (!subjectTemplate?.trim() || !bodyTemplate?.trim()) {
      setValidation({ error: 'Subject and body cannot be empty.' })
      return
    }
    const result = await api.template.validate({ subjectTemplate, bodyTemplate, headers })
    setValidation(result)
    if (result.subject.valid && result.body.valid) navigate('schedule')
  }

  function insertField(field) {
    updateWizard({ bodyTemplate: (bodyTemplate || '') + `{{${field}}}` })
  }

  async function handleAttachFiles(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    const results = await Promise.all(files.map(f => api.attachment.upload(f)))
    const added = results.filter(r => r?.success).map(r => r.attachment)
    if (added.length) updateWizard({ attachments: [...attachments, ...added] })
    e.target.value = ''
    setUploading(false)
  }

  async function handleRemoveAttachment(id) {
    await api.attachment.remove(id)
    updateWizard({ attachments: attachments.filter(a => a.id !== id) })
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
          <span onClick={() => navigate('import')} className="text-slate-400 hover:text-indigo-400 cursor-pointer">Step 1</span>
          <span>→</span><span className="text-indigo-400 font-medium">Step 2</span>
          <span>→</span><span>Step 3</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Template Editor</h1>
        <p className="text-slate-400 text-sm mt-1">Write your email with personalized merge fields</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-5">
          <div>
            <label className="label">Subject Line</label>
            <input
              type="text"
              value={subjectTemplate || ''}
              onChange={e => updateWizard({ subjectTemplate: e.target.value })}
              placeholder="e.g. Collaboration Request — {{college}}"
              className="input-field"
            />
            {validation?.subject?.unmatched?.length > 0 && (
              <p className="mt-1 text-xs text-red-400">Unknown fields: {validation.subject.unmatched.join(', ')}</p>
            )}
          </div>

          <div>
            <label className="label">Email Body</label>
            <textarea
              value={bodyTemplate || ''}
              onChange={e => updateWizard({ bodyTemplate: e.target.value })}
              placeholder={`Dear {{first_name}},\n\nI wanted to reach out…`}
              rows={14}
              className="input-field font-mono text-xs leading-relaxed resize-none"
            />
            {validation?.body?.unmatched?.length > 0 && (
              <p className="mt-1 text-xs text-red-400">Unknown fields: {validation.body.unmatched.join(', ')}</p>
            )}
            {validation?.error && (
              <p className="mt-1 text-xs text-red-400">{validation.error}</p>
            )}
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-2">Click a field to insert into body:</p>
            <div className="flex flex-wrap gap-1.5">
              {headers.map(h => (
                <button
                  key={h}
                  onClick={() => insertField(h)}
                  className="px-2 py-0.5 bg-indigo-900/40 border border-indigo-700/50 text-indigo-300 rounded text-xs font-mono hover:bg-indigo-800/50 transition-colors"
                >
                  {`{{${h}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="card py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-200">Attachments</h3>
              <button
                type="button"
                onClick={() => attachInputRef.current.click()}
                disabled={uploading}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                {uploading ? 'Uploading…' : '+ Add File'}
              </button>
              <input
                ref={attachInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleAttachFiles}
              />
            </div>
            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-2 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
                        <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                      </svg>
                      <span className="text-slate-300 text-xs truncate">{a.name}</span>
                      <span className="text-slate-500 text-xs shrink-0">({(a.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button
                      onClick={() => handleRemoveAttachment(a.id)}
                      className="text-slate-500 hover:text-red-400 text-xs ml-3 shrink-0 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No attachments. PDFs, Word docs, images — up to 25 MB each.</p>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => navigate('import')} className="btn-secondary">← Back</button>
            <button onClick={validateAndNext} className="btn-primary flex-1">Next: Schedule →</button>
          </div>
        </div>

        <div>
          <div className="sticky top-0">
            <div className="flex items-center justify-between mb-3">
              <label className="label mb-0">Live Preview</label>
              <div className="flex items-center gap-2">
                {rows.length > 1 && (
                  <select
                    value={previewRow}
                    onChange={e => setPreviewRow(Number(e.target.value))}
                    className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1"
                  >
                    {rows.slice(0, 10).map((_, i) => (
                      <option key={i} value={i}>Row {i + 1}</option>
                    ))}
                  </select>
                )}
                <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
                  <button
                    onClick={() => setPreviewMode('html')}
                    className={`px-3 py-1 ${previewMode === 'html' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setPreviewMode('raw')}
                    className={`px-3 py-1 ${previewMode === 'raw' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}
                  >
                    Raw
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl overflow-hidden shadow-lg">
              <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                <p className="text-xs text-gray-500">Subject:</p>
                <p className="text-sm font-medium text-gray-800 mt-0.5">{preview.subject || 'Your subject will appear here'}</p>
              </div>
              <div className="p-4 min-h-[300px] max-h-[500px] overflow-y-auto">
                {previewMode === 'html' ? (
                  <div
                    className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: preview.body || '<span style="color:#9ca3af">Your email body will appear here…</span>' }}
                  />
                ) : (
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">{preview.body}</pre>
                )}
              </div>
            </div>

            {rows.length > 0 && rows[previewRow] && (
              <div className="mt-3 p-3 bg-slate-800 border border-slate-700 rounded-lg">
                <p className="text-xs text-slate-500 mb-2">Merged values for Row {previewRow + 1}:</p>
                <div className="space-y-1">
                  {headers.map(h => (
                    <div key={h} className="flex items-center gap-2 text-xs">
                      <span className="text-indigo-400 font-mono w-28 shrink-0">{`{{${h}}}`}</span>
                      <span className="text-slate-300 truncate">{rows[previewRow][h] || <em className="text-slate-600">empty</em>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
