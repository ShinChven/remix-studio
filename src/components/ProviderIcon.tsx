import React from 'react';
import { ProviderType } from '../types';
import { 
  SiGooglegemini, 
  SiGooglecloud, 
  SiOpenai, 
  SiAnthropic, 
  SiX, 
  SiBytedance 
} from 'react-icons/si';

interface ProviderIconProps {
  type: ProviderType;
  className?: string;
}

export function ProviderIcon({ type, className = "w-5 h-5" }: ProviderIconProps) {
  switch (type) {
    case 'GoogleAI':
      return <SiGooglegemini className={className} />;
    case 'VertexAI':
      return <SiGooglecloud className={className} />;
    case 'RunningHub':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.5 5.5C13.5 6.32843 12.8284 7 12 7C11.1716 7 10.5 6.32843 10.5 5.5C10.5 4.67157 11.1716 4 12 4C12.8284 4 13.5 4.67157 13.5 5.5Z" />
          <path d="M17.5 10L14.5 11L12 16H9.5L11.5 11.5L9.5 10.5L7 13.5H4.5L8.5 8L11 9L13.5 6H16.5L14.5 9.5L17.5 10Z" />
        </svg>
      );
    case 'KlingAI':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 4h3v7.1L14.28 4H18l-6.16 8.03L18.5 20H14.7L9.63 13.82 8 15.82V20H5V4Z" />
        </svg>
      );
    case 'OpenAI':
      return <SiOpenai className={className} />;
    case 'Grok':
      return <SiX className={className} />;
    case 'Claude':
      return <SiAnthropic className={className} />;
    case 'BytePlus':
      return <SiBytedance className={className} />;
    default:
      // Fallback key icon
      return (
        <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7.5" cy="15.5" r="5.5"/>
          <path d="m21 2-9.6 9.6"/>
          <path d="m15.5 7.5 3 3L22 7l-3-3"/>
        </svg>
      );
  }
}
