import { useState } from 'react'
import './App.css'
import { generateSampleDocuments } from './lib/generateExam'

type GenerationStatus = 'idle' | 'generating' | 'success' | 'error'

function App() {
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [message, setMessage] = useState(
    'Ready to generate five approved Unit 1 questions.',
  )

  const handleGenerate = async (): Promise<void> => {
    setStatus('generating')
    setMessage('Generating the DOCX file...')

    try {
      await generateSampleDocuments()

      setStatus('success')
      setMessage('Exam and answer key generated successfully. Check your Downloads folder.')
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown generation error.'

      setStatus('error')
      setMessage(`Generation failed: ${errorMessage}`)
    }
  }

  const isGenerating = status === 'generating'

  return (
    <main>
      <h1>ExamGO</h1>
      <p>Grade 6 Iraqi English — Unit 1 document-generation proof</p>

      <div className="card">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? 'Generating…' : 'Generate Exam + Answer Key'}
        </button>

        <p
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {message}
        </p>
      </div>
    </main>
  )
}

export default App