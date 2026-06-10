import React, { useState, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'

interface HelpTooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export default function HelpTooltip({ content, children, position = 'top' }: HelpTooltipProps) {
  const [enabled, setEnabled] = useState(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Check local storage setting. Defaults to true.
    const checkHelp = () => {
      const isEnabled = localStorage.getItem('pref_contextual_help') !== 'false'
      setEnabled(isEnabled)
    }

    checkHelp()

    // Add a window listener to update if settings change
    window.addEventListener('storage', checkHelp)
    window.addEventListener('settings-updated', checkHelp)
    
    return () => {
      window.removeEventListener('storage', checkHelp)
      window.removeEventListener('settings-updated', checkHelp)
    }
  }, [])

  if (!enabled) return <>{children}</>

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-950/90 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-950/90 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-950/90 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-950/90 border-y-transparent border-l-transparent'
  }

  return (
    <div 
      className="relative inline-block w-full"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className={`absolute z-[9999] w-64 p-3 bg-gray-950/90 text-white text-[11px] leading-relaxed rounded-xl shadow-2xl border border-white/20 backdrop-blur-md transition-all duration-200 pointer-events-none animate-fade-in ${positionClasses[position]}`}>
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>{content}</span>
          </div>
          <div className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`} />
        </div>
      )}
    </div>
  )
}
