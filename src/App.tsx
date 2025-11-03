import { Shield } from 'lucide-react'
import './App.css'

function App() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Shield className="w-24 h-24 text-primary" />
        </div>
        <h1 className="text-4xl font-bold mb-2">SHIELD 2.0</h1>
        <p className="text-muted-foreground">
          Privacy-first AI Assistant for Windows
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Coming soon...
        </p>
      </div>
    </div>
  )
}

export default App
