/** Shared with ThemeProvider. Kept dependency-free so build tools can import it. */
export const STYLE_ID = 'm3-theme'
export const ATTRIBUTE = 'data-m3-theme'
export const MOTION_ATTRIBUTE = 'data-motion-scheme'

/**
 * Inline script for `<head>` that applies the stored mode, colors and motion scheme before first
 * paint. Must use the same `storageKey` as ThemeProvider.
 */
export function themeInitScript(storageKey = 'm3-theme'): string {
  const k = JSON.stringify(storageKey)
  return `(function(){try{var k=${k},d=document.documentElement,m=localStorage.getItem(k+':mode');if(m){try{m=JSON.parse(m)}catch(e){}if(m==='light'||m==='dark')d.setAttribute('${ATTRIBUTE}',m)}var g;try{g=JSON.parse(localStorage.getItem(k+':config')||'{}')}catch(e){g={}}d.setAttribute('${MOTION_ATTRIBUTE}',g&&g.motionScheme==='standard'?'standard':'expressive');var c=localStorage.getItem(k+':css');if(c){var s=document.createElement('style');s.id='${STYLE_ID}';s.textContent=c;document.head.appendChild(s)}}catch(e){}})()`
}
