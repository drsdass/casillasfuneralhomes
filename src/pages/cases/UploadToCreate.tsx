import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { ArrowLeft, Upload, FileText, Sparkles, AlertTriangle } from 'lucide-react'
import type { ExtractedCaseData } from '@/types'

export default function UploadToCreate() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const extractMutation = useMutation({
    mutationFn: (file: File) => api.extractCaseFromDocument(file),
    onSuccess: (extracted: ExtractedCaseData) => {
      navigate('/cases/new', { state: { extracted } })
    },
  })

  function handleFile(file: File | undefined) {
    if (!file) return
    const okTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!okTypes.includes(file.type)) {
      alert('Please upload a PDF or an image (JPG, PNG, WEBP).')
      return
    }
    setFileName(file.name)
    extractMutation.mutate(file)
  }

  return (
    <div>
      <Link to="/cases" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={15} /> Back to cases
      </Link>

      <SectionHeading
        title="Create Case from Document"
        subtitle="Upload an intake form, hospital paperwork, or existing invoice — we'll read it and pre-fill a new case for you to review"
      />

      <Card className="max-w-2xl p-8">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFile(e.dataTransfer.files?.[0])
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg py-16 text-center cursor-pointer transition ${
            dragOver ? 'border-[#3b4a35] bg-[#3b4a35]/5' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          {extractMutation.isPending ? (
            <>
              <Sparkles size={28} className="mx-auto mb-3 text-[#b3925a] animate-pulse" />
              <div className="text-sm font-medium text-slate-700">Reading "{fileName}"…</div>
              <div className="text-xs text-slate-400 mt-1">This usually takes a few seconds</div>
            </>
          ) : (
            <>
              <Upload size={28} className="mx-auto mb-3 text-slate-300" />
              <div className="text-sm font-medium text-slate-700">Drop a file here, or click to browse</div>
              <div className="text-xs text-slate-400 mt-1">PDF, JPG, PNG, or WEBP</div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        {extractMutation.isError && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              Couldn't read that document: {extractMutation.error instanceof Error ? extractMutation.error.message : 'Unknown error'}
            </span>
          </div>
        )}

        <div className="mt-6 flex items-start gap-2 text-xs text-slate-400">
          <FileText size={14} className="shrink-0 mt-0.5" />
          <span>
            Nothing is saved automatically — after reading the document, you'll land on the normal
            New Case form with fields pre-filled from what was found. Review and edit before saving,
            same as creating a case by hand.
          </span>
        </div>
      </Card>
    </div>
  )
}
