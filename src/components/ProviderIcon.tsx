import React from 'react';
import { ProviderType } from '../types';
import {
  SiGooglegemini,
  SiGooglecloud,
  SiAnthropic,
  SiX, 
  SiBytedance,
  SiAlibabacloud
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
      // react-icons dropped SiOpenai in 5.7; keeping the mark inline.
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
        </svg>
      );
    case 'Grok':
      return <SiX className={className} />;
    case 'Claude':
      return <SiAnthropic className={className} />;
    case 'BytePlus':
      return <SiBytedance className={className} />;
    case 'Replicate':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 4.5A2.5 2.5 0 0 0 3.5 7v10A2.5 2.5 0 0 0 6 19.5h12A2.5 2.5 0 0 0 20.5 17V7A2.5 2.5 0 0 0 18 4.5H6Zm.5 3h4.7a3.9 3.9 0 1 1 0 7.8H9.6V17H6.5V7.5Zm3.1 5.1h1.2a1.2 1.2 0 0 0 0-2.4H9.6v2.4Z" />
        </svg>
      );
    case 'BlackForestLabs':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.5 3.6-6.5 3.6-6.5-3.6L12 4.3ZM5 9.4l6 3.3v7.7l-6-3.3V9.4Zm14 0v7.7l-6 3.3v-7.7l6-3.3Z" />
        </svg>
      );
    case 'Alibabacloud':
      return <SiAlibabacloud className={className} />;
    case 'Kimi':
      // Crescent mark for Moonshot AI — react-icons has no Kimi/Moonshot glyph.
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M20.5 15.5A9 9 0 0 1 8.5 3.5a9 9 0 1 0 12 12Z" />
        </svg>
      );
    case 'MiniMax':
      // Bold "M" mark — react-icons has no MiniMax glyph.
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 19V5h3l6 8.4L18 5h3v14h-3v-8.6l-6 8.4-6-8.4V19H3Z" />
        </svg>
      );
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
