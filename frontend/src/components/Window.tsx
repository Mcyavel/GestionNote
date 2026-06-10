import React, { useState, useRef, useEffect } from 'react';
import { X, Minus, Square, Copy } from 'lucide-react';

interface WindowProps {
  title: string;
  onClose: () => void;
  onMinimize?: () => void;
  children: React.ReactNode;
  icon?: React.ElementType;
  initialX?: number;
  initialY?: number;
  active?: boolean;
  onFocus?: () => void;
}

const Window: React.FC<WindowProps> = ({ 
  title, 
  onClose, 
  onMinimize,
  children, 
  icon: Icon,
  initialX = 100,
  initialY = 100,
  active = true,
  onFocus
}) => {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (onFocus) onFocus();
    if (isMaximized) return;
    
    if (windowRef.current) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && !isMaximized) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, isMaximized]);

  const windowStyle: React.CSSProperties = isMaximized ? {
    left: 0,
    top: 0,
    width: '100vw',
    height: 'calc(100vh - 80px)', // Espace pour le dock
    zIndex: active ? 50 : 10,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  } : {
    left: position.x,
    top: position.y,
    zIndex: active ? 50 : 10,
    transition: isDragging ? 'none' : 'all 0.2s ease-out'
  };

  return (
    <div 
      ref={windowRef}
      onClick={onFocus}
      className={`absolute glass-panel rounded-2xl overflow-hidden window-shadow flex flex-col border border-white/20 ${isMaximized ? 'rounded-none' : 'min-w-[400px] min-h-[300px]'}`}
      style={windowStyle}
    >
      {/* Title Bar */}
      <div 
        className="h-12 bg-white/10 flex items-center justify-between px-4 cursor-grab active:cursor-grabbing border-b border-white/10 select-none"
        onMouseDown={handleMouseDown}
        onDoubleClick={toggleMaximize}
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-5 h-5 text-blue-400" />}
          <span className="text-white font-semibold tracking-wide text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={(e) => { e.stopPropagation(); if (onMinimize) onMinimize(); }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); toggleMaximize(); }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
          >
            {isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1.5 hover:bg-red-500/80 rounded-lg text-white/50 hover:text-white transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6 bg-slate-900/60 text-white custom-scrollbar">
        {children}
      </div>
    </div>
  );
};

export default Window;
